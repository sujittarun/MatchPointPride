/* ============================================================
   Platform rows -> the shape the pages already speak.

   The eight pages and every chart are fine; the violation was never
   the UI, it was that the numbers were computed here. So the rows come
   back from Postgres and get folded into the same `AppData` the pages
   have always read, and nothing in src/pages changes.

   ONE RULE for this file: it may reshape, it may not decide. Renaming
   a column is reshaping. Working out what somebody owes is deciding,
   and that answer arrives already made, from reminder_queue().
   ============================================================ */

import type {
  AppData,
  AttendanceRecord,
  Batch,
  Reminder,
  Staff,
  Student,
  Transaction,
} from './types'
import type {
  BatchRow,
  CoachRow,
  DueRow,
  EnrollmentRow,
  ExpenseRow,
  MemberRow,
  PaymentRow,
} from './cloud'

/** ISO day numbers back to the labels the batch editor shows. */
const DAY_NAME: Record<number, string> = {
  1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun',
}

function hhmmTo12(t: string | null): string | null {
  if (!t) return null
  const [hRaw, m] = t.split(':')
  const h = parseInt(hRaw, 10)
  const ap = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m} ${ap}`
}

function slotLabel(b: BatchRow): string | undefined {
  const from = hhmmTo12(b.start_time)
  const to = hhmmTo12(b.end_time)
  // Open play is stored as the venue's opening hours because the shared
  // table requires a slot. Showing "5:00 AM – 11:59 PM" as if it were a
  // class would be a lie, so it shows nothing.
  if (!from || !to) return undefined
  if (b.start_time === '05:00:00' && b.end_time === '23:59:00') return undefined
  return `${from} – ${to}`
}

/** MPP groups batches three ways; the platform does not, so infer it. */
function batchKind(b: BatchRow): Batch['kind'] {
  const n = b.name.toLowerCase()
  if (n.includes('member')) return 'membership'
  if (n.includes('pro') || n.includes('squad')) return 'professional'
  return 'kids'
}

export function toBatches(
  rows: BatchRow[],
  fees: Record<number, number>,
  upi: Record<string, { upi: string; payee: string }>,
): Batch[] {
  return rows.map((b, i) => {
    const u = upi[b.code]
    return {
      id: String(b.id),
      name: b.name,
      kind: batchKind(b),
      slot: slotLabel(b),
      days: (b.days ?? []).map((d) => DAY_NAME[d]).filter(Boolean),
      fee: fees[b.id] ?? 0,
      capacity: b.capacity ?? undefined,
      colorSlot: (i % 6) + 1,
      upiId: u?.upi,
      upiName: u?.payee,
      createdAt: new Date().toISOString(),
    }
  })
}

export function toStaff(rows: CoachRow[]): Staff[] {
  return rows.map((c) => ({
    id: String(c.id),
    name: c.name,
    role: c.role,
    phone: c.phone ?? undefined,
    joinedOn: '',
    active: c.active,
  }))
}

/**
 * A student is a member joined to their enrolment. The enrolment is the
 * row that carries the money, so a member without one is not a student
 * yet and is skipped rather than shown with a zero fee.
 */
export function toStudents(
  members: MemberRow[],
  enrolments: EnrollmentRow[],
  fees: Record<number, number>,
): Student[] {
  const byMember = new Map<number, EnrollmentRow>()
  for (const e of enrolments) {
    const prev = byMember.get(e.member_id)
    // Someone who rejoined has more than one; the live one wins.
    if (!prev || (prev.status !== 'active' && e.status === 'active')) byMember.set(e.member_id, e)
  }

  const out: Student[] = []
  for (const m of members) {
    const e = byMember.get(m.id)
    if (!e) continue
    const active = e.status === 'active' && m.status !== 'discontinued'
    out.push({
      id: String(m.id),
      name: m.name,
      batchId: e.batch_id === null ? '' : String(e.batch_id),
      phone: (m.parent_phone || m.phone || '').replace(/\D/g, ''),
      guardian: m.parent_name ?? undefined,
      joinedOn: e.joined_on ?? m.joined ?? '',
      // The fee shown is the batch's resolved amount, or the enrolment's
      // own override — both computed by resolve_fee, never here.
      monthlyFee: e.custom_amount ?? (e.batch_id ? (fees[e.batch_id] ?? 0) : 0),
      feeDueDay: e.renewal_on ? Number(e.renewal_on.slice(8, 10)) : 1,
      active,
      note: m.notes ?? undefined,
      spells: [
        {
          from: e.joined_on ?? m.joined ?? '',
          ...(e.discontinued_on ? { to: e.discontinued_on } : {}),
        },
      ],
      // Carried so writes can address the right rows without a lookup.
      enrollmentId: e.id,
      memberId: m.id,
    })
  }
  return out
}

/**
 * Reminders are NOT built here. Each one is a row of reminder_queue(),
 * which decided who is due, at which rung of the ladder, and for how
 * much. This only dresses that answer in the shape the page renders.
 */
export function toReminders(due: DueRow[], students: Student[]): Reminder[] {
  const byEnrolment = new Map<number, Student>()
  for (const s of students) {
    if (s.enrollmentId != null) byEnrolment.set(s.enrollmentId, s)
  }

  return due.map((d) => {
    const s = byEnrolment.get(d.enrollment_id)
    const stageLabel =
      d.stage === 'heads_up' ? 'Due in 2 days' : d.stage === 'due' ? 'Due today' : `${d.days_since} days overdue`
    return {
      id: `rq_${d.enrollment_id}`,
      studentId: s?.id ?? String(d.member_id),
      kind: 'fee',
      title: `${d.member_name} · ${stageLabel}`,
      message: '',
      dueDate: d.due_date,
      amount: d.amount ?? undefined,
      months: [d.due_date.slice(0, 7)],
      // The platform stops at +15 and hands over to a person. Surfacing
      // that as a normal pending reminder would invite the owner to keep
      // firing automated chases past the point the ladder says stop.
      status: d.blocked_reason ? 'cancelled' : d.already_sent ? 'sent' : 'pending',
      createdAt: d.due_date,
      lastSentAt: d.last_sent_at ?? undefined,
      sendCount: d.already_sent ? 1 : 0,
      history: [],
    }
  })
}

export function toTransactions(payments: PaymentRow[], expenses: ExpenseRow[]): Transaction[] {
  const rev: Transaction[] = payments.map((p) => ({
    id: `pay_${p.id}`,
    type: 'revenue',
    date: p.on_date,
    forMonth: p.period_from ? p.period_from.slice(0, 7) : p.on_date.slice(0, 7),
    amount: Number(p.amount),
    category: p.type || 'Coaching',
    source:
      p.type === 'Court' ? 'court_booking' : p.type === 'Membership' ? 'membership'
        : p.enrollment_id ? 'student_fee' : 'other',
    studentId: p.member_id ? String(p.member_id) : undefined,
    note: p.note ?? undefined,
    // The object key, not a URL: links to a private bucket expire, so
    // one is asked for at the moment it is shown.
    proofImageId: p.proof_path ?? undefined,
    createdAt: p.on_date,
  }))

  const exp: Transaction[] = expenses.map((e) => ({
    id: `exp_${e.id}`,
    type: 'expense',
    date: e.on_date ?? '',
    amount: Number(e.amount),
    category: e.category,
    note: e.detail ?? undefined,
    createdAt: e.on_date ?? '',
  }))

  return [...rev, ...exp].sort((a, b) => (a.date < b.date ? 1 : -1))
}

export type AttendanceRow = {
  date: string
  kind: string
  person_id: string
  present: boolean
}

export function toAttendance(rows: AttendanceRow[]): AttendanceRecord[] {
  return rows
    .filter((a) => a.kind === 'staff')
    .map((a) => ({
      id: `${a.person_id}__${a.date}`,
      staffId: a.person_id,
      date: a.date,
      status: a.present ? 'present' : 'absent',
    }))
}

/** Everything above, assembled into what StoreProvider hands the pages. */
export function assemble(a: {
  batches: BatchRow[]
  fees: Record<number, number>
  upi: Record<string, { upi: string; payee: string }>
  members: MemberRow[]
  enrolments: EnrollmentRow[]
  coaches: CoachRow[]
  payments: PaymentRow[]
  expenses: ExpenseRow[]
  attendance: AttendanceRow[]
  due: DueRow[]
  passcode: string
}): AppData {
  const batches = toBatches(a.batches, a.fees, a.upi)
  const students = toStudents(a.members, a.enrolments, a.fees)
  return {
    version: 2,
    settings: { passcode: a.passcode },
    batches,
    students,
    reminders: toReminders(a.due, students),
    staff: toStaff(a.coaches),
    attendance: toAttendance(a.attendance),
    transactions: toTransactions(a.payments, a.expenses),
  }
}
