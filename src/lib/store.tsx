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
import type { AppData } from './types'
import { buildEmptyData } from './seed'
import { todayISO, uid } from './format'
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
  updateMemberDetails as cloudUpdateMemberDetails,
  discontinue as cloudDiscontinue,
  reenroll as cloudReenroll,
  setRenewalOn as cloudSetRenewalOn,
  isSignedIn,
  loadEverything,
  refreshToken,
  resumeWith,
  signIn as cloudSignIn,
  signOut as cloudSignOut,
} from './cloud'
import * as vault from './vault'
import {
  DEMO,
  clearDemo,
  demoRecordFee,
  demoSaveStaff,
  demoSaveStudent,
  loadDemo,
  saveDemo,
} from './demo'
import { assemble } from './mapping'

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
   Persistence. There is none here — Postgres is the whole backend.

   This block used to say the opposite: "one JSON document in
   localStorage… this is the whole backend", written when it was true
   and left standing after the cutover, eighty lines above a `load()`
   that reads nothing from the device. A comment that describes the
   architecture the file no longer has is worse than no comment: it is
   the first thing the next reader trusts.

   Every read goes through cloud.ts and every write goes through one of
   the helpers below, straight to the database and straight back.

   `normalise()` went with it. Fifty-five lines that migrated older
   localStorage documents in place — folding retired attendance states,
   de-duplicating open fee reminders, backfilling spells from `joinedOn`,
   clamping the fee day. All of it operated on a document that `load()`
   stopped reading; the last thing calling it was its own test. Those
   migrations are the database's shape now, not this file's job.
   ------------------------------------------------------------------ */

interface LoadResult {
  data: AppData
  error?: string
}

/* Anyone who used the app before the cutover still has the old document
   sitting in localStorage — roughly 200KB of student names and parents'
   phone numbers that nothing will ever read again. Leaving it there is
   not neutral: it is personal data on a device, kept for no reason, and
   the point of this change was that it should not be there at all.
   Cleared once, on boot. */
function clearLegacyLocalData(): void {
  for (const k of ['mpp.data.v1', 'mpp.data.v1.corrupt']) {
    try {
      if (localStorage.getItem(k) !== null) localStorage.removeItem(k)
    } catch {
      /* storage blocked — nothing to clear, and nothing to break */
    }
  }
}

/* Nothing is read from the device any more. The app opens empty and
   fills from Postgres as soon as a session exists — see refresh(). An
   empty shell for that first paint is honest: there genuinely is no
   data yet, and a stale local copy would be a guess dressed as a fact. */
function load(): LoadResult {
  clearLegacyLocalData()
  // Turning DEMO off drops the sample academy with it, so a device that
  // was demoed does not keep a store nothing will ever read again.
  if (!DEMO) clearDemo()
  // Login is off: open on generated data rather than an empty shell,
  // because with no session the database would return nothing anyway.
  if (DEMO) return { data: loadDemo() }
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
  authed: boolean
  login: (code: string) => Promise<boolean>
  /** First run on this device: email + password once, then a PIN. */
  enrol: (email: string, password: string, pin: string) => Promise<{ ok: boolean; message: string }>
  /** Has this device been set up? Decides which login screen shows. */
  enrolled: boolean
  logout: () => void
  /** Login is off (`demo.ts`): step in with no credential at all. */
  enterDemo: () => void
  toasts: Toast[]
  toast: (text: string, tone?: 'good' | 'bad') => void
  /** True while the tenant is being read from Postgres. */
  loading: boolean
  /** Non-null when the last read failed; the pages show stale data with a banner. */
  loadError: string | null
  saveBatch: (a: { id?: string; name: string; days: number[]; startTime: string; endTime: string; capacity?: number | null; fee: number }) => Promise<{ ok: boolean; message: string }>
  removeBatch: (id: string) => Promise<{ ok: boolean; message: string }>
  recordFee: (a: { enrollmentId: number; amount: number; onDate?: string; mode?: string; note?: string }) => Promise<{ ok: boolean; message: string; paymentId?: number }>
  addRevenue: (a: { label: string; amount: number; onDate: string; kind: 'Court' | 'Membership' | 'Coaching'; note?: string }) => Promise<{ ok: boolean; message: string }>
  addExpense: (a: { category: string; amount: number; onDate: string; note?: string }) => Promise<{ ok: boolean; message: string }>
  logReminderSent: (a: { enrollmentId: number; stage: string; amount: number | null; phone: string | null; body: string; channel: 'whatsapp' | 'sms' | 'call' }) => Promise<{ ok: boolean; message: string }>
  removeEntry: (a: { kind: 'payment' | 'expense'; id: number }) => Promise<{ ok: boolean; message: string }>
  saveStaff: (a: { id?: string; name: string; role: string; phone?: string; active?: boolean }) => Promise<{ ok: boolean; message: string }>
  removeStaff: (id: string) => Promise<{ ok: boolean; message: string }>
  markStaffDay: (a: { coachId: string; date: string; status: 'present' | 'absent' }) => Promise<{ ok: boolean; message: string }>
  /**
   * Create, edit, discontinue or bring back a student, in Postgres.
   *
   * Which of the four it is comes from the ids: no memberId is a new
   * person; a memberId with no enrollmentId is someone returning; both
   * is an edit. `active: false` on an edit discontinues them, whatever
   * they were before.
   */
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
    /** Their current due date, so changing the fee day knows what it moves. */
    currentRenewalOn?: string
    /**
     * What they handed over on the day, if anything. Zero means they
     * walked in without paying — the app says so rather than assuming.
     */
    paidNow?: number
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
  /* Signed in means "there is a session in memory", not "a flag says so".
     They used to be separate: the flag lived in sessionStorage and the
     session in localStorage, so they could disagree — and once the
     session stopped being persisted, a surviving flag would have opened
     the app with no session behind it, which reads as an academy with
     no students rather than as a locked door. Deriving it removes the
     pair that could disagree instead of keeping them in step. */
  const [authed, setAuthed] = useState<boolean>(() => (DEMO ? false : isSignedIn()))
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
    // Nothing to re-read: the demo store IS the source of truth, and a
    // fetch here would replace it with the empty result RLS returns to
    // a caller holding no session.
    if (DEMO) return
    if (!isSignedIn()) return
    try {
      setLoading(true)
      const raw = await loadEverything()
      centreId.current = raw.centreId
      setData(assemble(raw))
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

  /* Demo writes are local, so they have to be kept somewhere or a
     reload throws away the scenario the owner just set up. A clearly
     demo-named key, dropped the moment DEMO goes false. */
  useEffect(() => {
    if (DEMO) saveDemo(data)
  }, [data])

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
    // Nothing from `data` here: the PIN is the vault key, not a field
    // in the document. This list used to name `data.settings.passcode`,
    // which rebuilt the callback on every load for a value it no longer
    // read.
    [],
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
    (a: { id?: string; name: string; days: number[]; startTime: string; endTime: string; capacity?: number | null; fee: number }) => {
      if (DEMO) {
        update((d) => {
          const hit = a.id ? d.batches.find((b) => b.id === a.id) : undefined
          if (hit) Object.assign(hit, a)
          else d.batches.push({ ...a, id: uid('bat') } as never)
        })
        return Promise.resolve({ ok: true, message: '' })
      }
      return write('save batch', () =>
        cloudSaveBatch({ ...a, id: a.id ? Number(a.id) : undefined, centreId: centreId.current }),
      )
    },
    [write, update],
  )

  const removeBatch = useCallback(
    (id: string) => {
      if (DEMO) {
        update((d) => {
          d.batches = d.batches.filter((b) => b.id !== id)
        })
        return Promise.resolve({ ok: true, message: '' })
      }
      return write('delete batch', () => cloudDeleteBatch(Number(id)))
    },
    [write, update],
  )

  /* Fees go through record_fee_payment and nothing else. It is the one
     write path: it rolls the renewal forward, writes the period the
     money covers, and closes the reminder, in one transaction. Inserting
     into payments directly would record the money and none of that. */
  /* Returns the payment id as well, because the screenshot object is
     keyed on it — the attachment cannot be named until the money exists. */
  const recordFee = useCallback(
    async (a: { enrollmentId: number; amount: number; onDate?: string; mode?: string; note?: string }) => {
      if (DEMO) {
        update((d) => demoRecordFee(d, {
          enrollmentId: a.enrollmentId, amount: a.amount,
          onDate: a.onDate ?? todayISO(), note: a.note,
        }))
        return { ok: true, message: '' }
      }
      if (!isSignedIn()) return { ok: false, message: 'Not signed in to the academy database.' }
      try {
        const out = await cloudRecordPayment(a)
        await refresh()
        return { ok: true, message: '', paymentId: out?.payment_id }
      } catch (err) {
        reportIssue('record fee', err)
        return {
          ok: false,
          message: err instanceof Error ? err.message : 'Could not save to the academy database.',
        }
      }
    },
    [refresh, update],
  )

  const addRevenue = useCallback(
    (a: { label: string; amount: number; onDate: string; kind: 'Court' | 'Membership' | 'Coaching'; note?: string }) => {
      if (DEMO) {
        update((d) => {
          d.transactions.push({
            id: uid('rev'), type: 'revenue', date: a.onDate, forMonth: a.onDate.slice(0, 7),
            amount: a.amount, category: a.kind, source: a.kind === 'Court' ? 'court_booking'
              : a.kind === 'Membership' ? 'membership' : 'other',
            note: a.note, createdAt: a.onDate,
          } as never)
        })
        return Promise.resolve({ ok: true, message: '' })
      }
      return write('add revenue', () => cloudAddRevenue(a))
    },
    [write, update],
  )

  const addExpense = useCallback(
    (a: { category: string; amount: number; onDate: string; note?: string }) => {
      if (DEMO) {
        update((d) => {
          d.transactions.push({
            id: uid('exp'), type: 'expense', date: a.onDate, amount: a.amount,
            category: a.category, note: a.note, createdAt: a.onDate,
          } as never)
        })
        return Promise.resolve({ ok: true, message: '' })
      }
      return write('add expense', () => cloudAddExpense(a))
    },
    [write, update],
  )

  const saveStaff = useCallback(
    (a: { id?: string; name: string; role: string; phone?: string; active?: boolean }) => {
      if (DEMO) {
        update((d) => demoSaveStaff(d, a))
        return Promise.resolve({ ok: true, message: '' })
      }
      return write('save staff', () => cloudSaveStaff({ ...a, id: a.id ? Number(a.id) : undefined }))
    },
    [write, update],
  )

  const removeStaff = useCallback(
    (id: string) => {
      if (DEMO) {
        update((d) => {
          d.staff = d.staff.filter((s) => s.id !== id)
        })
        return Promise.resolve({ ok: true, message: '' })
      }
      return write('delete staff', () => cloudDeleteStaff(Number(id)))
    },
    [write, update],
  )

  const markStaffDay = useCallback(
    (a: { coachId: string; date: string; status: 'present' | 'absent' }) => {
      if (DEMO) {
        update((d) => {
          const hit = d.attendance.find((r) => r.staffId === a.coachId && r.date === a.date)
          if (hit) hit.status = a.status
          else d.attendance.push({ staffId: a.coachId, date: a.date, status: a.status } as never)
        })
        return Promise.resolve({ ok: true, message: '' })
      }
      return write('mark attendance', () => cloudMarkStaffDay(a))
    },
    [write, update],
  )

  const logReminderSent = useCallback(
    (a: { enrollmentId: number; stage: string; amount: number | null; phone: string | null; body: string; channel: 'whatsapp' | 'sms' | 'call' }) => {
      // The WhatsApp message still goes out for real; only the audit row
      // has nowhere to land.
      if (DEMO) return Promise.resolve({ ok: true, message: '' })
      return write('log reminder', () => cloudLogReminderSent(a))
    },
    [write],
  )

  const removeEntry = useCallback(
    (a: { kind: 'payment' | 'expense'; id: number }) => {
      if (DEMO) {
        const prefix = a.kind === 'payment' ? 'pay_' : 'exp_'
        update((d) => {
          d.transactions = d.transactions.filter(
            (t) => t.id !== String(a.id) && t.id !== prefix + a.id,
          )
        })
        return Promise.resolve({ ok: true, message: '' })
      }
      return write('delete entry', () =>
        a.kind === 'payment' ? cloudVoidPayment(a.id, 'removed by owner') : cloudDeleteExpense(a.id),
      )
    },
    [write, update],
  )

  /* Has anything been paid since this spell began?
     Measured from the spell, not from their first ever payment: a
     student who trained for two years, left, and came back is unpaid
     again, and their fee day should re-derive like anyone starting. */
  const paidThisSpell = useCallback(
    (d: AppData, studentId: string | undefined, from: string | undefined) => {
      if (!studentId || !from) return false
      return d.transactions.some(
        (t) => t.type === 'revenue' && t.source === 'student_fee' &&
               t.studentId === studentId && t.date >= from,
      )
    },
    [],
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
      currentRenewalOn?: string
      paidNow?: number
      note?: string
    }) => {
      if (DEMO) {
        /* Add, edit and discontinue, locally. The four-way routing the
           real path does off memberId/enrollmentId does not apply: there
           are no enrolment rows here, so a student is just a row. */
        update((d) => demoSaveStudent(d, input))
        return { ok: true, message: '' }
      }
      if (!isSignedIn()) {
        return { ok: false, message: 'Not signed in to the academy database.' }
      }
      try {
        const batchId = Number(input.batchId)
        if (!batchId) return { ok: false, message: 'Pick a batch first.' }

        if (input.memberId && input.enrollmentId) {
          /* Details always; the spell only when it actually changes.
             Leaving and returning are not field edits — each opens or
             closes a spell across two tables, so each is its own call. */
          await cloudUpdateStudent({
            memberId: input.memberId,
            enrollmentId: input.enrollmentId,
            name: input.name,
            phone: input.phone,
            guardian: input.guardian,
            batchId,
            customFee: input.customFee ?? null,
            note: input.note,
            feeDueDay: input.feeDueDay,
            currentRenewalOn: input.currentRenewalOn,
            /* Which fee-day rule applies turns on whether any money has
               arrived in this spell. The store is the only place that
               knows both the student and the payment record, so it
               decides here rather than leaving cloud.ts to guess. */
            joinedOn: input.joinedOn,
            settledThisSpell: paidThisSpell(data, input.id, input.joinedOn),
          })
          /* Not gated on a previous status. The Remove button, the CSV
             import and the student page all call this with active:false
             and nothing else, so a gate that needed one more field meant
             every one of them silently did nothing — the student was
             "removed" and stayed on the roll. discontinue_member is
             idempotent, so calling it on someone already gone closes
             nothing and writes no timeline row. */
          if (!input.active) {
            await cloudDiscontinue({ memberId: input.memberId })
          }
        } else if (input.memberId) {
          /* A returning student: same person, new spell. Knowing the
             member and creating another one anyway is what strands their
             history, so this branch is on the id alone — there is no
             path from here that inserts a second member row.

             Coming back is the same three acts as joining, and for a
             while this branch did only one of them: the details typed
             on the way in were dropped, and money handed over on the
             day was never recorded at all. */
          await cloudUpdateMemberDetails({
            memberId: input.memberId,
            name: input.name,
            phone: input.phone,
            guardian: input.guardian,
            note: input.note,
          })
          const back = await cloudReenroll({
            memberId: input.memberId,
            centreId: centreId.current,
            batchId,
            feeDueDay: input.feeDueDay,
            joinedOn: input.joinedOn,
            customFee: input.customFee ?? null,
          })
          if (input.paidNow && input.paidNow > 0) {
            await cloudRecordPayment({ enrollmentId: back.enrollment_id, amount: input.paidNow })
            // the first payment settles the opening stretch; it must not
            // push the billing day the owner just chose
            await cloudSetRenewalOn(back.enrollment_id, back.renewal_on)
          }
        } else {
          const made = await cloudAddStudent({
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
          /* Registering and paying are two things, and the second one is
             optional. If money changed hands it goes through the same
             record_fee_payment as every other rupee — never an insert,
             so the renewal rolls and the timeline is written exactly as
             it would be for a payment taken next month. Nothing paid
             leaves them plainly unpaid, which the app then shows. */
          if (input.paidNow && input.paidNow > 0) {
            await cloudRecordPayment({ enrollmentId: made.enrollmentId, amount: input.paidNow })
            await cloudSetRenewalOn(made.enrollmentId, made.renewalOn)
          }
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
    [refresh, paidThisSpell, data],
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
  }, [])

  /* No PIN, no password, no session — the data is already local. Only
     reachable while DEMO is true; with it false the landing goes back to
     opening the PIN sheet and this is never called. */
  const enterDemo = useCallback(() => {
    if (DEMO) setAuthed(true)
  }, [])

  const value = useMemo<Ctx>(
    () => ({
      data, update,
      authed, login, enrol, enrolled: vault.isEnrolled(), logout, enterDemo, toasts, toast,
      loading, loadError, refresh, saveStudent,
      saveBatch, removeBatch, recordFee, addRevenue, addExpense,
      saveStaff, removeStaff, markStaffDay, logReminderSent, removeEntry,
    }),
    [data, update,
     authed, login, enrol, logout, enterDemo, toasts, toast, loading, loadError, refresh, saveStudent,
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
