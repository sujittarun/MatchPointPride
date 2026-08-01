/* ============================================================
   Demo mode — the login is switched OFF.

   Tapping "Academy login" goes straight to the dashboard with no
   credential of any kind, and every screen works: students and coaches
   can be added and edited, fees recorded, reminders read and sent to a
   real WhatsApp. Nothing touches Postgres.

   WHY IT IS BUILT THIS WAY

   The obvious version of "turn login off" — force `authed` true and
   carry on — gives an empty app. Every read is scoped by RLS to a
   Supabase session, so with no session the database returns nothing and
   the owner lands on an academy with no students. The other obvious
   version, keeping the session on disk so no one has to sign in, puts
   the refresh token back in localStorage: the exact exposure removed in
   "The vault encrypted a token that was lying in plaintext beside it".

   So demo mode uses generated data and a local store instead. No
   credential exists to leak, and the real database is untouched by
   anyone poking at the app.

   WHAT IS NOT REAL

   Money. `resolve_fee`, `record_fee_payment` and `reminder_queue` all
   live in Postgres and none of them run here — the seed generator makes
   plausible fees and a plausible queue, and recording a payment moves
   local rows. So demo figures are for looking at screens, never for
   deciding anything. The moment DEMO is false the app is wired to the
   real functions again and this file stops being reachable.

   TURNING IT OFF

   Set DEMO to false. That restores the PIN gate and the platform
   database, and `clearDemo()` drops the local store. Nothing else in
   the app changes shape: the demo branches sit at the top of the write
   helpers in store.tsx and simply stop being taken.
   ============================================================ */

import type { AppData, Student } from './types'
import { buildSeedData } from './seed'
import { dueDateFor, daysBetween, todayISO, uid } from './format'

/** The switch. false → real login, real database. */
export const DEMO = true

/* Deliberately not `mpp.data.v1`. That key was the old localStorage
   database and is actively deleted on boot; a demo store wearing its
   name would be wiped by that cleanup and, worse, would look like the
   thing this app spent a migration getting rid of. */
const DEMO_KEY = 'mpp.demo.v2'

/**
 * A live chase list, invented.
 *
 * `buildSeedData()` makes 47 reminders and every one is already `paid`
 * or `cancelled` — it was written to fill the six-month chart, not to
 * hand anyone something to send. In the real app the open list is
 * `reminder_queue()`'s answer, computed in Postgres on every read, and
 * none of that runs here.
 *
 * So this stands in for it, and ONLY for it. It is shaped like the real
 * ladder — quiet until −2, a heads-up, the due day, then chases from
 * +5, stopping at +15 where the platform hands over to a person — so
 * the screens show the states the owner will actually meet. It is not
 * the ladder, it does not decide anything, and nothing outside demo
 * mode can reach it.
 */
function demoQueue(d: AppData): AppData['reminders'] {
  const today = todayISO()
  const month = today.slice(0, 7)
  const paidThisMonth = new Set(
    d.transactions
      .filter((t) => t.type === 'revenue' && t.source === 'student_fee' && t.studentId)
      .filter((t) => (t.forMonth ?? t.date.slice(0, 7)) === month)
      .map((t) => t.studentId as string),
  )

  const open: AppData['reminders'] = []
  for (const s of d.students) {
    if (!s.active || paidThisMonth.has(s.id)) continue
    const due = dueDateFor(month, s.feeDueDay)
    const since = daysBetween(due, today)
    // The rungs the real queue returns; everything else is silence.
    const onLadder = since === -2 || since === 0 || (since >= 5 && since <= 14) || since >= 15
    if (!onLadder) continue
    open.push({
      id: `demo_${s.id}`,
      studentId: s.id,
      kind: 'fee',
      title: `${s.name} · ${since < 0 ? 'Due in 2 days' : since === 0 ? 'Due today' : `${since} days overdue`}`,
      message: '',
      dueDate: due,
      amount: s.monthlyFee,
      months: [month],
      // Past +15 the platform stops sending and asks for a phone call.
      status: since >= 15 ? 'cancelled' : 'pending',
      blockedReason: since >= 15 ? 'overdue_15_days' : undefined,
      daysSince: since,
      createdAt: due,
      sendCount: 0,
      history: [],
    } as never)
  }
  return open
}

/** Seeded once, then whatever the owner has done to it since. */
export function loadDemo(): AppData {
  try {
    const raw = localStorage.getItem(DEMO_KEY)
    if (raw) {
      const d = JSON.parse(raw) as AppData
      if (d?.batches?.length) return d
    }
  } catch {
    /* unreadable — fall through and start fresh */
  }
  const fresh = buildSeedData()
  /* Every screen that writes money guards on `enrollmentId` first —
     "that student is not enrolled in the database yet" — because in the
     real app a Student without one is a row mapping.ts could not join
     to an enrolment. The seed has no enrolments at all, so without this
     Record payment, the fee sheet and the batch roll all refuse to do
     anything, silently enough to look like the demo is broken. */
  fresh.students.forEach((s, i) => {
    ;(s as { enrollmentId?: number }).enrollmentId = i + 1
  })
  // The seeded reminders are all history. Add the open ones, or the
  // Reminders screen opens on "0 open" with nothing to try.
  fresh.reminders = [...fresh.reminders, ...demoQueue(fresh)]
  saveDemo(fresh)
  return fresh
}

export function saveDemo(d: AppData): void {
  try {
    localStorage.setItem(DEMO_KEY, JSON.stringify(d))
  } catch {
    /* storage full or blocked — the session still works in memory */
  }
}

export function clearDemo(): void {
  try {
    localStorage.removeItem(DEMO_KEY)
  } catch {
    /* nothing to clear */
  }
}

/* ---------------- local writes ----------------
   Each one is the smallest change that keeps the screens honest with
   each other. Recording a fee, for instance, also has to drop the
   reminder — otherwise the owner records a payment and the student
   stays in the chase list, which is the one thing the real
   `record_fee_payment` exists to prevent. */

export function demoSaveStudent(
  d: AppData,
  input: {
    id?: string
    name: string
    phone: string
    guardian?: string
    batchId: string
    joinedOn: string
    feeDueDay: number
    customFee?: number | null
    active: boolean
    paidNow?: number
  },
): void {
  const batch = d.batches.find((b) => b.id === input.batchId)
  const fee = input.customFee ?? batch?.fee ?? 0
  const existing = input.id ? d.students.find((s) => s.id === input.id) : undefined

  if (existing) {
    Object.assign(existing, {
      name: input.name,
      phone: input.phone,
      guardian: input.guardian,
      batchId: input.batchId,
      joinedOn: input.joinedOn,
      feeDueDay: input.feeDueDay,
      monthlyFee: fee,
      active: input.active,
    })
    // Discontinuing has to take them out of the chase, same as the
    // database does by dropping them from reminder_queue.
    if (!input.active) d.reminders = d.reminders.filter((r) => r.studentId !== existing.id)
    return
  }

  const student: Student = {
    id: uid('stu'),
    name: input.name,
    phone: input.phone,
    guardian: input.guardian,
    batchId: input.batchId,
    joinedOn: input.joinedOn,
    feeDueDay: input.feeDueDay,
    monthlyFee: fee,
    active: input.active,
    enrollmentId: Math.max(0, ...d.students.map(
      (s) => (s as { enrollmentId?: number }).enrollmentId ?? 0)) + 1,
  } as Student
  d.students.push(student)

  if (input.paidNow && input.paidNow > 0) {
    d.transactions.push({
      id: uid('pay'),
      type: 'revenue',
      date: input.joinedOn,
      forMonth: input.joinedOn.slice(0, 7),
      amount: input.paidNow,
      category: 'Coaching',
      source: 'student_fee',
      studentId: student.id,
      createdAt: input.joinedOn,
    } as never)
  }
}

export function demoRecordFee(
  d: AppData,
  a: { enrollmentId: number; amount: number; onDate: string; note?: string },
): void {
  const student = d.students.find(
    (s) => (s as { enrollmentId?: number }).enrollmentId === a.enrollmentId,
  )
  if (!student) return
  const studentId = student.id
  d.transactions.push({
    id: uid('pay'),
    type: 'revenue',
    date: a.onDate,
    forMonth: a.onDate.slice(0, 7),
    amount: a.amount,
    category: 'Coaching',
    source: 'student_fee',
    studentId,
    note: a.note,
    createdAt: a.onDate,
  } as never)
  // The fee is paid, so the chase ends — what record_fee_payment does
  // server-side by closing the reminder.
  d.reminders = d.reminders.filter(
    (r) => !(r.studentId === studentId && r.status === 'pending'),
  )
}

export function demoSaveStaff(
  d: AppData,
  a: { id?: string; name: string; role: string; phone?: string; active?: boolean },
): void {
  const existing = a.id ? d.staff.find((s) => s.id === a.id) : undefined
  if (existing) {
    Object.assign(existing, {
      name: a.name,
      role: a.role,
      phone: a.phone,
      active: a.active ?? existing.active,
    })
    return
  }
  d.staff.push({
    id: uid('stf'),
    name: a.name,
    role: a.role,
    phone: a.phone,
    active: a.active ?? true,
  } as never)
}
