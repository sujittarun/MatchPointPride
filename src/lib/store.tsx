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

const KEY = 'mpp.data.v1'
const AUTH_KEY = 'mpp.auth.v1'

/* ------------------------------------------------------------------
   Persistence. One JSON document in localStorage.

   This is the whole backend. It is deliberate: the app is a static
   GitHub Pages site with no server, used by one person. The trade-off
   is real — data lives in this browser on this device, so Settings →
   Backup is the only thing standing between the academy and a wiped
   phone. Everything reads and writes through this module, so swapping
   in a hosted database later is a change to this file alone.
   ------------------------------------------------------------------ */

function load(): AppData {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return buildSeedData()
    const parsed = JSON.parse(raw) as AppData
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.batches)) {
      return buildSeedData()
    }
    // Fill in any settings key added after this document was written.
    parsed.settings = { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) }
    parsed.students ??= []
    parsed.reminders ??= []
    parsed.staff ??= []
    parsed.attendance ??= []
    parsed.transactions ??= []
    return parsed
  } catch {
    return buildSeedData()
  }
}

function save(data: AppData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch (err) {
    console.error('Could not save — storage may be full or blocked.', err)
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
  exportJSON: () => string
  authed: boolean
  login: (code: string) => boolean
  logout: () => void
  toasts: Toast[]
  toast: (text: string, tone?: 'good' | 'bad') => void
}

const StoreContext = createContext<Ctx | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(load)
  const [authed, setAuthed] = useState<boolean>(
    () => sessionStorage.getItem(AUTH_KEY) === '1',
  )
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)

  useEffect(() => {
    save(data)
  }, [data])

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

  const setSettings = useCallback(
    (patch: Partial<Settings>) => {
      update((d) => {
        d.settings = { ...d.settings, ...patch }
      })
    },
    [update],
  )

  const toast = useCallback((text: string, tone: 'good' | 'bad' = 'good') => {
    const id = ++toastId.current
    setToasts((t) => [...t, { id, text, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800)
  }, [])

  const resetToDemo = useCallback(() => setData(buildSeedData()), [])
  const startFresh = useCallback(() => setData(buildEmptyData()), [])

  const exportJSON = useCallback(() => JSON.stringify(data, null, 2), [data])

  const importJSON = useCallback((json: string) => {
    try {
      const parsed = JSON.parse(json) as AppData
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.batches)) {
        return { ok: false, message: 'That file is not a Match Point Pride backup.' }
      }
      parsed.settings = { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) }
      parsed.students ??= []
      parsed.reminders ??= []
      parsed.staff ??= []
      parsed.attendance ??= []
      parsed.transactions ??= []
      setData(parsed)
      return { ok: true, message: 'Backup restored.' }
    } catch {
      return { ok: false, message: 'Could not read that file — is it valid JSON?' }
    }
  }, [])

  const login = useCallback(
    (code: string) => {
      const ok = code.trim() === (data.settings.passcode || '1234')
      if (ok) {
        setAuthed(true)
        sessionStorage.setItem(AUTH_KEY, '1')
      }
      return ok
    },
    [data.settings.passcode],
  )

  const logout = useCallback(() => {
    setAuthed(false)
    sessionStorage.removeItem(AUTH_KEY)
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
