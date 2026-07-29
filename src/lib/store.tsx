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
import { allImages, putRaw } from './images'
import { reportIssue } from './telemetry'
import {
  addExpense as cloudAddExpense,
  addRevenue as cloudAddRevenue,
  addStudent as cloudAddStudent,
  deleteBatch as cloudDeleteBatch,
  deleteStaff as cloudDeleteStaff,
  deleteExpense as cloudDeleteExpense,
  logReminderSent as cloudLogReminderSent,
  markStaffDay as cloudMarkStaffDay,
  voidPaymentById as cloudVoidPayment,
  recordPayment as cloudRecordPayment,
  saveBatch as cloudSaveBatch,
  saveStaff as cloudSaveStaff,
  updateStudent as cloudUpdateStudent,
  isSignedIn,
  loadEverything,
  refreshToken,
  resumeWith,
  signIn as cloudSignIn,
  signOut as cloudSignOut,
} from './cloud'
import * as vault from './vault'
import { assemble } from './mapping'

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

/* Nothing is read from the device any more. The app opens empty and
   fills from Postgres as soon as a session exists — see refresh(). An
   empty shell for that first paint is honest: there genuinely is no
   data yet, and a stale local copy would be a guess dressed as a fact. */
function load(): LoadResult {
  return { data: buildEmptyData() }
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
  login: (code: string) => Promise<boolean>
  /** First run on this device: email + password once, then a PIN. */
  enrol: (email: string, password: string, pin: string) => Promise<{ ok: boolean; message: string }>
  /** Has this device been set up? Decides which login screen shows. */
  enrolled: boolean
  logout: () => void
  toasts: Toast[]
  toast: (text: string, tone?: 'good' | 'bad') => void
  /** True while the tenant is being read from Postgres. */
  loading: boolean
  /** Non-null when the last read failed; the pages show stale data with a banner. */
  loadError: string | null
  saveBatch: (a: { id?: string; name: string; days: number[]; startTime: string; endTime: string; capacity?: number | null; fee: number }) => Promise<{ ok: boolean; message: string }>
  removeBatch: (id: string) => Promise<{ ok: boolean; message: string }>
  recordFee: (a: { enrollmentId: number; amount: number; onDate?: string; mode?: string; note?: string }) => Promise<{ ok: boolean; message: string }>
  addRevenue: (a: { label: string; amount: number; onDate: string; kind: 'Court' | 'Membership' | 'Coaching'; note?: string }) => Promise<{ ok: boolean; message: string }>
  addExpense: (a: { category: string; amount: number; onDate: string; note?: string }) => Promise<{ ok: boolean; message: string }>
  logReminderSent: (a: { enrollmentId: number; stage: string; amount: number | null; phone: string | null; body: string; channel: 'whatsapp' | 'sms' | 'call' }) => Promise<{ ok: boolean; message: string }>
  removeEntry: (a: { kind: 'payment' | 'expense'; id: number }) => Promise<{ ok: boolean; message: string }>
  saveStaff: (a: { id?: string; name: string; role: string; phone?: string; active?: boolean }) => Promise<{ ok: boolean; message: string }>
  removeStaff: (id: string) => Promise<{ ok: boolean; message: string }>
  markStaffDay: (a: { coachId: string; date: string; status: 'present' | 'absent' }) => Promise<{ ok: boolean; message: string }>
  /** Create or update a student, in Postgres. */
  saveStudent: (input: {
    id?: string
    memberId?: number
    enrollmentId?: number
    name: string
    phone: string
    guardian?: string
    batchId: string
    joinedOn: string
    feeDueDay: number
    customFee?: number | null
    active: boolean
    note?: string
  }) => Promise<{ ok: boolean; message: string }>
  /** Re-read everything. Called after any write, because the database
      may have changed more than the write did — a payment moves a
      renewal date and closes a reminder. */
  refresh: () => Promise<void>
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
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const centreId = useRef(0)
  const toastId = useRef(0)

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

  /* Pull the whole tenant from Postgres.

     Every number in here was computed by the database — fees by
     resolve_fee, who is due by reminder_queue. Nothing is recomputed on
     arrival; mapping.ts only reshapes. */
  const refresh = useCallback(async () => {
    if (!isSignedIn()) return
    try {
      setLoading(true)
      const raw = await loadEverything()
      centreId.current = raw.centreId
      setData((prev) => assemble({ ...raw, passcode: prev.settings.passcode }))
      setLoadError(null)
    } catch (err) {
      reportIssue('load', err)
      setLoadError(
        err instanceof Error ? err.message : 'Could not reach the academy database.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (authed) void refresh()
  }, [authed, refresh])

  /* The write-to-localStorage effect is gone.

     It was the last thing that could quietly lose work: a page mutated
     local state, this wrote it to the phone, and the next refresh()
     replaced it with whatever the database held. The edit vanished with
     no error at all. Postgres is the only store now — every mutation
     goes through one of the write helpers above and is read straight
     back.

     What still uses localStorage, and should: the sealed session vault,
     the PIN attempt ladder, and payment screenshots in IndexedDB. None
     of those are academy records. */

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

  /* The reminder replan that used to live here is gone. It walked the
     payment record on every state change and wrote reminders locally —
     a second implementation of the ladder, racing the real one. The
     queue now arrives from reminder_queue() with refresh(), so there is
     nothing to keep in step. */

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

  /* The PIN no longer proves anything by itself — it decrypts the
     Supabase refresh token this device was enrolled with, and that token
     is what the platform actually trusts. A wrong PIN fails to decrypt;
     there is no comparison to skip past. */
  const login = useCallback(
    async (code: string) => {
      if (lockedForMs() > 0) return false
      if (!vault.isEnrolled()) return false

      const token = await vault.unlock(code)
      if (token) {
        const rotated = await resumeWith(token)
        if (rotated) {
          // Supabase rotates on use; a vault holding the spent token
          // would lock the owner out tomorrow.
          await vault.reseal(code, rotated)
          writeAttempts({ count: 0, until: 0 })
          setAuthed(true)
          try {
            sessionStorage.setItem(AUTH_KEY, '1')
          } catch {
            /* session storage unavailable — logged in for this render only */
          }
          return true
        }
        // Right PIN, dead token: the session was revoked or expired.
        // Make him sign in again rather than counting it as a bad PIN.
        vault.forget()
        return false
      }

      const count = readAttempts().count + 1
      const wait = LOCKOUTS_MS[Math.min(count, LOCKOUTS_MS.length - 1)]
      writeAttempts({ count, until: wait ? Date.now() + wait : 0 })
      // Past the ladder, the device forgets itself. A short PIN is only
      // defensible because guessing has a hard stop.
      if (count >= LOCKOUTS_MS.length + 2) vault.forget()
      return false
    },
    [data.settings.passcode],
  )

  /* Student writes.

     These go to Postgres and then re-read everything, rather than
     patching the local copy. A write usually changes more than it
     says — a new enrolment appears in reminder_queue the moment its
     renewal date lands in range — and the only way to be sure the
     screen matches the database is to ask the database. */
  /* Every write goes through here: run it, re-read everything, and give
     the caller a plain yes or no. The re-read is not caution — a write
     routinely changes more than it says. Recording a fee moves a renewal
     date and drops a student out of the reminder queue, and the only way
     to be sure the screen agrees with the database is to ask it. */
  const write = useCallback(
    async (label: string, fn: () => Promise<unknown>) => {
      if (!isSignedIn()) return { ok: false, message: 'Not signed in to the academy database.' }
      try {
        await fn()
        await refresh()
        return { ok: true, message: '' }
      } catch (err) {
        reportIssue(label, err)
        return {
          ok: false,
          message: err instanceof Error ? err.message : 'Could not save to the academy database.',
        }
      }
    },
    [refresh],
  )

  const saveBatch = useCallback(
    (a: { id?: string; name: string; days: number[]; startTime: string; endTime: string; capacity?: number | null; fee: number }) =>
      write('save batch', () =>
        cloudSaveBatch({ ...a, id: a.id ? Number(a.id) : undefined, centreId: centreId.current }),
      ),
    [write],
  )

  const removeBatch = useCallback(
    (id: string) => write('delete batch', () => cloudDeleteBatch(Number(id))),
    [write],
  )

  /* Fees go through record_fee_payment and nothing else. It is the one
     write path: it rolls the renewal forward, writes the period the
     money covers, and closes the reminder, in one transaction. Inserting
     into payments directly would record the money and none of that. */
  const recordFee = useCallback(
    (a: { enrollmentId: number; amount: number; onDate?: string; mode?: string; note?: string }) =>
      write('record fee', () => cloudRecordPayment(a)),
    [write],
  )

  const addRevenue = useCallback(
    (a: { label: string; amount: number; onDate: string; kind: 'Court' | 'Membership' | 'Coaching'; note?: string }) =>
      write('add revenue', () => cloudAddRevenue(a)),
    [write],
  )

  const addExpense = useCallback(
    (a: { category: string; amount: number; onDate: string; note?: string }) =>
      write('add expense', () => cloudAddExpense(a)),
    [write],
  )

  const saveStaff = useCallback(
    (a: { id?: string; name: string; role: string; phone?: string; active?: boolean }) =>
      write('save staff', () => cloudSaveStaff({ ...a, id: a.id ? Number(a.id) : undefined })),
    [write],
  )

  const removeStaff = useCallback(
    (id: string) => write('delete staff', () => cloudDeleteStaff(Number(id))),
    [write],
  )

  const markStaffDay = useCallback(
    (a: { coachId: string; date: string; status: 'present' | 'absent' }) =>
      write('mark attendance', () => cloudMarkStaffDay(a)),
    [write],
  )

  const logReminderSent = useCallback(
    (a: { enrollmentId: number; stage: string; amount: number | null; phone: string | null; body: string; channel: 'whatsapp' | 'sms' | 'call' }) =>
      write('log reminder', () => cloudLogReminderSent(a)),
    [write],
  )

  const removeEntry = useCallback(
    (a: { kind: 'payment' | 'expense'; id: number }) =>
      write('delete entry', () =>
        a.kind === 'payment' ? cloudVoidPayment(a.id, 'removed by owner') : cloudDeleteExpense(a.id),
      ),
    [write],
  )

  const saveStudent = useCallback(
    async (input: {
      id?: string
      memberId?: number
      enrollmentId?: number
      name: string
      phone: string
      guardian?: string
      batchId: string
      joinedOn: string
      feeDueDay: number
      customFee?: number | null
      active: boolean
      note?: string
    }) => {
      if (!isSignedIn()) {
        return { ok: false, message: 'Not signed in to the academy database.' }
      }
      try {
        const batchId = Number(input.batchId)
        if (!batchId) return { ok: false, message: 'Pick a batch first.' }

        if (input.memberId && input.enrollmentId) {
          await cloudUpdateStudent({
            memberId: input.memberId,
            enrollmentId: input.enrollmentId,
            name: input.name,
            phone: input.phone,
            guardian: input.guardian,
            batchId,
            active: input.active,
            customFee: input.customFee ?? null,
            note: input.note,
          })
        } else {
          await cloudAddStudent({
            name: input.name,
            phone: input.phone,
            guardian: input.guardian,
            centreId: centreId.current,
            batchId,
            joinedOn: input.joinedOn,
            feeDueDay: input.feeDueDay,
            customFee: input.customFee ?? null,
            note: input.note,
          })
        }
        await refresh()
        return { ok: true, message: '' }
      } catch (err) {
        reportIssue('save student', err)
        return {
          ok: false,
          message: err instanceof Error ? err.message : 'Could not save to the academy database.',
        }
      }
    },
    [refresh],
  )

  /* One-time device setup: the only moment a password is involved. It
     is never stored — what is kept is the refresh token Supabase
     returns, sealed under the PIN. */
  const enrol = useCallback(
    async (email: string, password: string, pin: string) => {
      try {
        const s = await cloudSignIn(email, password)
        const token = refreshToken()
        if (!token) return { ok: false, message: 'Signed in but no session came back.' }
        await vault.enrol({ pin, refreshToken: token, email: s.email || email })
        writeAttempts({ count: 0, until: 0 })
        setAuthed(true)
        try {
          sessionStorage.setItem(AUTH_KEY, '1')
        } catch {
          /* fine */
        }
        return { ok: true, message: '' }
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : 'Could not sign in.',
        }
      }
    },
    [],
  )

  const logout = useCallback(() => {
    cloudSignOut()
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
      importJSON, exportJSON, authed, login, enrol, enrolled: vault.isEnrolled(), logout, toasts, toast,
      loading, loadError, refresh, saveStudent,
      saveBatch, removeBatch, recordFee, addRevenue, addExpense,
      saveStaff, removeStaff, markStaffDay, logReminderSent, removeEntry,
    }),
    [data, update, setSettings, resetToDemo, startFresh, importJSON,
     exportJSON, authed, login, enrol, logout, toasts, toast, loading, loadError, refresh, saveStudent,
     saveBatch, removeBatch, recordFee, addRevenue, addExpense,
     saveStaff, removeStaff, markStaffDay, logReminderSent, removeEntry],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): Ctx {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>')
  return ctx
}
