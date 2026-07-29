import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { AppData, Settings } from './types'
import { buildEmptyData, buildSeedData, DEFAULT_SETTINGS } from './seed'
import { applyFeePlan, isFeePlanEmpty, planFeeReminders } from './selectors'
import { allImages, putRaw } from './images'

const KEY = 'mpp.data.v1'
const AUTH_KEY = 'mpp.auth.v1'
const ATTEMPTS_KEY = 'mpp.pin.attempts'

/* ------------------------------------------------------------------
   PIN attempt limiting.

   Four digits is ten thousand guesses, which a person with the URL can
   work through. Lockouts escalate and survive a reload, so closing the
   tab is not a reset. This lives here rather than in the login screen
   because it must hold wherever the PIN is checked from.

   Note this slows a human down; it is not a substitute for a real
   session. See README § Security.
   ------------------------------------------------------------------ */

const LOCKOUTS_MS = [0, 0, 0, 0, 30_000, 60_000, 300_000, 900_000]

interface Attempts {
  count: number
  until: number
}

function readAttempts(): Attempts {
  try {
    const raw = localStorage.getItem(ATTEMPTS_KEY)
    if (!raw) return { count: 0, until: 0 }
    const a = JSON.parse(raw) as Attempts
    return { count: Number(a.count) || 0, until: Number(a.until) || 0 }
  } catch {
    return { count: 0, until: 0 }
  }
}

function writeAttempts(a: Attempts) {
  try {
    localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(a))
  } catch {
    /* nothing we can do */
  }
}

/** Milliseconds still locked out, 0 when the pad is usable. */
export function lockedForMs(now = Date.now()): number {
  return Math.max(0, readAttempts().until - now)
}

/* ------------------------------------------------------------------
   Persistence. One JSON document in localStorage.

   This is the whole backend. It is deliberate: the app is a static
   GitHub Pages site with no server, used by one person. The trade-off
   is real — data lives in this browser on this device, so the backup in
   Settings is the only thing standing between the academy and a wiped
   phone. Everything reads and writes through this module, so swapping
   in a hosted database later is a change to this file alone.
   ------------------------------------------------------------------ */

/** Fill in defaults and migrate older documents in place. Exported so the
    migration path is testable without a browser. */
export function normalise(parsed: AppData): AppData {
  parsed.settings = { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) }
  parsed.students ??= []
  parsed.reminders ??= []
  parsed.staff ??= []
  parsed.attendance ??= []
  parsed.transactions ??= []
  parsed.batches ??= []

  // Attendance used to have four states. Fold the retired ones in:
  // a half day was worked, a leave day was not.
  for (const rec of parsed.attendance) {
    const st = rec.status as string
    if (st === 'half') rec.status = 'present'
    else if (st === 'leave') rec.status = 'absent'
  }

  /* A student may only ever have one open fee reminder. An earlier build
     could create duplicates when the sync ran twice; fold any away here so
     outstanding totals aren't double-counted. */
  const seenOpenFee = new Set<string>()
  parsed.reminders = parsed.reminders.filter((r) => {
    if (r.kind !== 'fee' || (r.status !== 'pending' && r.status !== 'sent')) return true
    if (seenOpenFee.has(r.studentId)) return false
    seenOpenFee.add(r.studentId)
    return true
  })

  /* Give every student a membership history. Records written before spells
     existed get one built from `joinedOn`; for someone already inactive we
     cannot know when they left, so their last recorded fee month is used as
     the best available estimate. */
  for (const s of parsed.students) {
    if (Array.isArray(s.spells) && s.spells.length > 0) continue
    if (s.active) {
      s.spells = [{ from: s.joinedOn }]
    } else {
      const lastPaid = parsed.transactions
        .filter((t) => t.source === 'student_fee' && t.studentId === s.id)
        .map((t) => t.date)
        .sort()
        .pop()
      s.spells = [{ from: s.joinedOn, to: lastPaid ?? s.joinedOn }]
    }
  }

  // Keep the fee day a real day of the month. Short months are handled
  // when the due date is built, not by rejecting the 29th–31st.
  for (const s of parsed.students) {
    if (!(s.feeDueDay >= 1 && s.feeDueDay <= 31)) {
      s.feeDueDay = Math.min(31, Math.max(1, Math.round(s.feeDueDay) || 1))
    }
  }
  return parsed
}

interface LoadResult {
  data: AppData
  error?: string
}

function load(): LoadResult {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(KEY)
  } catch {
    // Storage blocked entirely (private mode, cookies disabled).
    return {
      data: buildSeedData(),
      error: 'This browser is blocking storage, so nothing you enter will be saved.',
    }
  }

  // First run — hand over the demo dataset.
  if (!raw) return { data: buildSeedData() }

  try {
    const parsed = JSON.parse(raw) as AppData
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.batches)) {
      throw new Error('unrecognised shape')
    }
    return { data: normalise(parsed) }
  } catch {
    /* Saved data is unreadable. Never quietly hand back the demo set —
       the owner could start typing real data on top of it and make the
       damage permanent. Keep the raw copy so it can be rescued, and
       open on a clean slate that obviously isn't their data. */
    try {
      localStorage.setItem(`${KEY}.corrupt`, raw)
    } catch {
      /* nothing more we can do */
    }
    return {
      data: buildEmptyData(),
      error:
        'Saved data could not be read. Your last file was kept under "mpp.data.v1.corrupt" — restore a backup from Settings.',
    }
  }
}

function save(data: AppData): string | null {
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
    return null
  } catch (err) {
    console.error('Could not save.', err)
    const quota =
      err instanceof DOMException &&
      (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED')
    return quota
      ? 'Storage is full — that change was NOT saved. Download a backup, then clear old data.'
      : 'That change could not be saved to this browser.'
  }
}

/* ------------------------------------------------------------------
   Context
   ------------------------------------------------------------------ */

export interface Toast {
  id: number
  text: string
  tone: 'good' | 'bad'
}

interface Ctx {
  data: AppData
  update: (fn: (draft: AppData) => void) => void
  setSettings: (patch: Partial<Settings>) => void
  resetToDemo: () => void
  startFresh: () => void
  importJSON: (json: string) => { ok: boolean; message: string }
  exportJSON: () => Promise<string>
  authed: boolean
  login: (code: string) => boolean
  logout: () => void
  toasts: Toast[]
  toast: (text: string, tone?: 'good' | 'bad') => void
}

const StoreContext = createContext<Ctx | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const initial = useRef<LoadResult | null>(null)
  if (initial.current === null) initial.current = load()

  const [data, setData] = useState<AppData>(initial.current.data)
  const [authed, setAuthed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(AUTH_KEY) === '1'
    } catch {
      return false
    }
  })
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)
  const firstSave = useRef(true)
  const lastSaveError = useRef<string | null>(null)

  const toast = useCallback((text: string, tone: 'good' | 'bad' = 'good') => {
    const id = ++toastId.current
    setToasts((t) => [...t, { id, text, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'bad' ? 6000 : 2800)
  }, [])

  // Report a load problem exactly once (the ref survives StrictMode's
  // double-invoked effects in development).
  const reportedLoadError = useRef(false)
  useEffect(() => {
    const err = initial.current?.error
    if (err && !reportedLoadError.current) {
      reportedLoadError.current = true
      toast(err, 'bad')
    }
  }, [toast])

  useEffect(() => {
    // Don't rewrite storage with what we just read out of it.
    if (firstSave.current) {
      firstSave.current = false
      return
    }
    const err = save(data)
    // Only nag once per failure streak, not on every keystroke.
    if (err && err !== lastSaveError.current) toast(err, 'bad')
    lastSaveError.current = err
  }, [data, toast])

  /* Structured-clone the document before handing it to the mutator so
     callers can write plainly (`draft.students.push(...)`) without
     mutating the current state object in place. */
  const update = useCallback((fn: (draft: AppData) => void) => {
    setData((prev) => {
      const draft: AppData = JSON.parse(JSON.stringify(prev))
      fn(draft)
      return draft
    })
  }, [])

  /* Fee reminders are kept in step with the payment record automatically —
     there is no "generate" step to remember. This runs whenever the things
     it depends on change, and writes only when the plan is non-empty, so it
     settles after one pass instead of looping. */
  useEffect(() => {
    const plan = planFeeReminders(data)
    if (!isFeePlanEmpty(plan)) update((d) => applyFeePlan(d, plan))
  }, [data, update])

  const setSettings = useCallback(
    (patch: Partial<Settings>) => {
      update((d) => {
        d.settings = { ...d.settings, ...patch }
      })
    },
    [update],
  )

  const resetToDemo = useCallback(() => setData(buildSeedData()), [])
  const startFresh = useCallback(() => setData(buildEmptyData()), [])

  /* Screenshots live in IndexedDB, so a backup of the JSON alone would
     silently drop the payment evidence. They ride along under `images`. */
  const exportJSON = useCallback(
    async () => JSON.stringify({ ...data, images: await allImages() }, null, 2),
    [data],
  )

  const importJSON = useCallback((json: string) => {
    try {
      const parsed = JSON.parse(json) as AppData
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.batches)) {
        return { ok: false, message: 'That file is not a Match Point Pride backup.' }
      }
      const images = (parsed as AppData & { images?: Record<string, string> }).images
      if (images) {
        for (const [id, dataUrl] of Object.entries(images)) void putRaw(id, dataUrl)
      }
      delete (parsed as AppData & { images?: unknown }).images
      setData(normalise(parsed))
      return { ok: true, message: 'Backup restored.' }
    } catch {
      return { ok: false, message: 'Could not read that file — is it valid JSON?' }
    }
  }, [])

  const login = useCallback(
    (code: string) => {
      if (lockedForMs() > 0) return false

      const ok = code.trim() === (data.settings.passcode || '1234')
      if (ok) {
        writeAttempts({ count: 0, until: 0 })
        setAuthed(true)
        try {
          sessionStorage.setItem(AUTH_KEY, '1')
        } catch {
          /* session storage unavailable — stay logged in for this render only */
        }
        return true
      }

      const count = readAttempts().count + 1
      const wait = LOCKOUTS_MS[Math.min(count, LOCKOUTS_MS.length - 1)]
      writeAttempts({ count, until: wait ? Date.now() + wait : 0 })
      return false
    },
    [data.settings.passcode],
  )

  const logout = useCallback(() => {
    setAuthed(false)
    try {
      sessionStorage.removeItem(AUTH_KEY)
    } catch {
      /* nothing to clear */
    }
  }, [])

  const value = useMemo<Ctx>(
    () => ({
      data, update, setSettings, resetToDemo, startFresh,
      importJSON, exportJSON, authed, login, logout, toasts, toast,
    }),
    [data, update, setSettings, resetToDemo, startFresh, importJSON,
     exportJSON, authed, login, logout, toasts, toast],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): Ctx {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>')
  return ctx
}
