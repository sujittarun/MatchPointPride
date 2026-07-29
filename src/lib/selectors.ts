import type {
  AppData,
  AttendanceRecord,
  AttendanceStatus,
  Batch,
  Reminder,
  Spell,
  Staff,
  Student,
  Transaction,
} from './types'
import {
  currentMonthKey,
  daysBetween,
  dueDateFor,
  isSunday,
  lastMonths,
  monthDates,
  monthNameFull,
  shiftMonth,
  todayISO,
  uid,
} from './format'
import { ACADEMY } from './academy'

/* ------------------------------------------------------------------
   Batches & students
   ------------------------------------------------------------------ */

export function studentsOf(data: AppData, batchId: string): Student[] {
  return data.students.filter((s) => s.batchId === batchId)
}

export function activeStudentsOf(data: AppData, batchId: string): Student[] {
  return data.students.filter((s) => s.batchId === batchId && s.active)
}

export function batchById(data: AppData, id: string | undefined): Batch | undefined {
  return id ? data.batches.find((b) => b.id === id) : undefined
}

export function studentById(data: AppData, id: string | undefined): Student | undefined {
  return id ? data.students.find((s) => s.id === id) : undefined
}

/** Expected monthly fee income if every active student pays. */
export function monthlyExpected(data: AppData): number {
  return data.students.filter((s) => s.active).reduce((a, s) => a + s.monthlyFee, 0)
}

/* ------------------------------------------------------------------
   Finance
   ------------------------------------------------------------------ */

export interface MonthMoney {
  key: string
  revenue: number
  expense: number
  net: number
}

export function moneyByMonth(txns: Transaction[], months: string[]): MonthMoney[] {
  const map = new Map<string, MonthMoney>()
  for (const k of months) map.set(k, { key: k, revenue: 0, expense: 0, net: 0 })
  for (const t of txns) {
    const k = t.date.slice(0, 7)
    const row = map.get(k)
    if (!row) continue
    if (t.type === 'revenue') row.revenue += t.amount
    else row.expense += t.amount
  }
  for (const row of map.values()) row.net = row.revenue - row.expense
  return months.map((k) => map.get(k)!)
}

export function monthTotals(txns: Transaction[], monthKey: string) {
  let revenue = 0
  let expense = 0
  for (const t of txns) {
    if (!t.date.startsWith(monthKey)) continue
    if (t.type === 'revenue') revenue += t.amount
    else expense += t.amount
  }
  return { revenue, expense, net: revenue - expense }
}

export function revenueBySource(txns: Transaction[], monthKey?: string) {
  const map = new Map<string, number>()
  for (const t of txns) {
    if (t.type !== 'revenue') continue
    if (monthKey && !t.date.startsWith(monthKey)) continue
    const label =
      t.source === 'student_fee' ? 'Student fees'
      : t.source === 'court_booking' ? 'Court bookings'
      : t.source === 'membership' ? 'Membership'
      : 'Other'
    map.set(label, (map.get(label) ?? 0) + t.amount)
  }
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
}

export function expenseByCategory(txns: Transaction[], monthKey?: string) {
  const map = new Map<string, number>()
  for (const t of txns) {
    if (t.type !== 'expense') continue
    if (monthKey && !t.date.startsWith(monthKey)) continue
    map.set(t.category, (map.get(t.category) ?? 0) + t.amount)
  }
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
}

/** Share of active students whose fee landed in the given month. */
export function collectionRate(data: AppData, monthKey: string) {
  const active = data.students.filter((s) => s.active)
  if (active.length === 0) return { paid: 0, total: 0, rate: 0, collected: 0, expected: 0 }
  const paid = new Set(
    data.transactions
      .filter((t) => t.source === 'student_fee' && t.studentId && paidForMonth(t) === monthKey)
      .map((t) => t.studentId!),
  )
  const paidActive = active.filter((s) => paid.has(s.id))
  const collected = paidActive.reduce((a, s) => a + s.monthlyFee, 0)
  const expected = active.reduce((a, s) => a + s.monthlyFee, 0)
  return {
    paid: paidActive.length,
    total: active.length,
    rate: (paidActive.length / active.length) * 100,
    collected,
    expected,
  }
}

/* ------------------------------------------------------------------
   Staff attendance
   ------------------------------------------------------------------ */

/** Working days in a month up to today. Sundays are the weekly off. */
export function workingDays(monthKey: string, upToToday = true): string[] {
  const today = todayISO()
  return monthDates(monthKey).filter(
    (d) => !isSunday(d) && (!upToToday || d <= today),
  )
}

export function attendanceMap(records: AttendanceRecord[]) {
  const map = new Map<string, AttendanceStatus>()
  for (const r of records) map.set(`${r.staffId}__${r.date}`, r.status)
  return map
}

export interface StaffMonthStats {
  staffId: string
  present: number
  absent: number
  marked: number
  workingDays: number
  /** Share of marked working days actually attended. */
  consistency: number
}

export function staffMonthStats(
  data: AppData,
  staffId: string,
  monthKey: string,
): StaffMonthStats {
  const days = workingDays(monthKey)
  const map = attendanceMap(data.attendance)
  let present = 0
  let absent = 0
  for (const d of days) {
    const st = map.get(`${staffId}__${d}`)
    if (st === 'present') present++
    else if (st === 'absent') absent++
  }
  const marked = present + absent
  return {
    staffId,
    present, absent, marked,
    workingDays: days.length,
    consistency: marked > 0 ? (present / marked) * 100 : 0,
  }
}

/** Consistency across the last `n` months, oldest first. */
export function staffTrend(data: AppData, staffId: string, n = 6) {
  return lastMonths(n).map((key) => {
    const s = staffMonthStats(data, staffId, key)
    return { key, value: s.consistency, marked: s.marked, absent: s.absent }
  })
}

/** All-time consistency, used for the "historically" view. */
export function staffLifetime(data: AppData, staffId: string) {
  const recs = data.attendance.filter((r) => r.staffId === staffId)
  let present = 0
  let absent = 0
  for (const r of recs) {
    if (r.status === 'present') present++
    else if (r.status === 'absent') absent++
  }
  const marked = present + absent
  return {
    present, absent, marked,
    consistency: marked > 0 ? (present / marked) * 100 : 0,
  }
}

export function todayAttendance(data: AppData, date: string) {
  const map = attendanceMap(data.attendance)
  return data.staff
    .filter((s) => s.active)
    .map((s) => ({ staff: s, status: map.get(`${s.id}__${date}`) }))
}

export function unmarkedToday(data: AppData, date = todayISO()): number {
  if (isSunday(date)) return 0
  return todayAttendance(data, date).filter((r) => !r.status).length
}

/* ------------------------------------------------------------------
   Reminders
   ------------------------------------------------------------------ */

/* ------------------------------------------------------------------
   Dues — derived, never "generated"

   Who owes what falls straight out of the payment record, so there is
   nothing for the owner to remember to press. A student is behind for a
   month when no student-fee payment is recorded *for* that month.
   ------------------------------------------------------------------ */

/** How far back unpaid months are chased. */
export const ARREARS_MONTHS = 6

/** The month a student-fee payment settles (older records lack forMonth). */
export function paidForMonth(t: Transaction): string {
  return t.forMonth ?? t.date.slice(0, 7)
}

/** Membership history, always at least one period. */
export function spellsOf(student: Student): Spell[] {
  if (student.spells?.length) return student.spells
  return [{ from: student.joinedOn, ...(student.active ? {} : { to: student.joinedOn }) }]
}

/** Was the student on the roll at any point during this month? */
export function wasEnrolledIn(student: Student, monthKey: string): boolean {
  return spellsOf(student).some(
    (sp) => sp.from.slice(0, 7) <= monthKey && (!sp.to || sp.to.slice(0, 7) >= monthKey),
  )
}

/** Total days on the roll, skipping any break between spells. */
export function tenureDays(student: Student, today = todayISO()): number {
  return spellsOf(student).reduce((total, sp) => {
    const end = sp.to && sp.to < today ? sp.to : today
    return total + Math.max(0, daysBetween(sp.from, end))
  }, 0)
}

/** Unpaid months for one student, oldest first. */
export function unpaidMonthsFor(
  data: AppData,
  student: Student,
  upto = currentMonthKey(),
): string[] {
  if (!student.active) return []
  const paid = new Set(
    data.transactions
      .filter((t) => t.source === 'student_fee' && t.studentId === student.id)
      .map(paidForMonth),
  )
  return lastMonths(ARREARS_MONTHS, upto).filter(
    // Months they were away are not owed — a break is not a debt.
    (m) => wasEnrolledIn(student, m) && !paid.has(m),
  )
}

/* ------------------------------------------------------------------
   One student's whole story
   ------------------------------------------------------------------ */

export interface StudentProfile {
  student: Student
  batch?: Batch
  spells: Spell[]
  tenureDays: number
  /** True when they left and later came back. */
  returned: boolean
  payments: Transaction[]
  totalPaid: number
  /**
   * Recent months, newest first. `chased` marks the months inside the
   * arrears window — anything older is history, not a debt, and must not
   * be shown as if the academy is still chasing it.
   */
  ledger: Array<{
    month: string
    paid: boolean
    amount: number
    enrolled: boolean
    chased: boolean
  }>
  /** True when their time here started before the ledger window. */
  ledgerTruncated: boolean
  remindersSent: number
  remindersCount: number
  unpaidMonths: string[]
  owed: number
}

export function studentProfile(data: AppData, studentId: string): StudentProfile | null {
  const student = data.students.find((s) => s.id === studentId)
  if (!student) return null

  const payments = data.transactions
    .filter((t) => t.source === 'student_fee' && t.studentId === studentId)
    .sort((a, b) => (a.date < b.date ? 1 : -1))

  const paidMonths = new Map<string, number>()
  for (const t of payments) {
    paidMonths.set(paidForMonth(t), (paidMonths.get(paidForMonth(t)) ?? 0) + t.amount)
  }

  const spells = spellsOf(student)
  const reminders = data.reminders.filter((r) => r.studentId === studentId)
  const unpaid = unpaidMonthsFor(data, student)

  /* A year, which is three rows of the grid. Longer than that and the
     early tiles are mostly "no record" noise. */
  const LEDGER_MONTHS = 12
  const firstMonth = spells[0].from.slice(0, 7)
  const months: string[] = []
  for (
    let m = currentMonthKey();
    m >= firstMonth && months.length < LEDGER_MONTHS;
    m = shiftMonth(m, -1)
  ) {
    months.push(m)
  }
  const chasedWindow = new Set(lastMonths(ARREARS_MONTHS))

  return {
    student,
    batch: batchById(data, student.batchId),
    spells,
    tenureDays: tenureDays(student),
    returned: spells.length > 1,
    payments,
    totalPaid: payments.reduce((a, t) => a + t.amount, 0),
    ledger: months.map((month) => ({
      month,
      enrolled: wasEnrolledIn(student, month),
      paid: paidMonths.has(month),
      amount: paidMonths.get(month) ?? 0,
      chased: chasedWindow.has(month),
    })),
    ledgerTruncated: months.length > 0 && months[months.length - 1] > firstMonth,
    remindersSent: reminders.reduce((a, r) => a + r.sendCount, 0),
    remindersCount: reminders.length,
    unpaidMonths: unpaid,
    owed: unpaid.length * student.monthlyFee,
  }
}

export interface FeePlan {
  create: Reminder[]
  update: Array<{ id: string; months: string[]; amount: number; dueDate: string }>
  close: string[]
}

export function isFeePlanEmpty(p: FeePlan): boolean {
  return p.create.length === 0 && p.update.length === 0 && p.close.length === 0
}

/**
 * Work out what the fee reminders *should* be. Pure — apply it with
 * `applyFeePlan`. Returning a plan lets the caller skip writing to storage
 * when nothing has changed, which is the common case on every render.
 */
export function planFeeReminders(data: AppData, upto = currentMonthKey()): FeePlan {
  const plan: FeePlan = { create: [], update: [], close: [] }
  const now = new Date().toISOString()

  for (const student of data.students) {
    const open = data.reminders.find(
      (r) =>
        r.studentId === student.id &&
        r.kind === 'fee' &&
        (r.status === 'pending' || r.status === 'sent'),
    )
    const months = unpaidMonthsFor(data, student, upto)

    if (months.length === 0) {
      if (open) plan.close.push(open.id)
      continue
    }

    const amount = months.length * student.monthlyFee
    const dueDate = dueDateFor(months[0], student.feeDueDay)

    if (!open) {
      const batch = batchById(data, student.batchId)
      plan.create.push({
        id: uid('rem'),
        studentId: student.id,
        kind: 'fee',
        title: `Fee — ${batch?.name ?? 'Batch'}`,
        message: '',
        dueDate,
        amount,
        months,
        status: 'pending',
        createdAt: now,
        sendCount: 0,
        history: [{ at: now, action: 'created' }],
      })
    } else if (
      (open.months ?? []).join() !== months.join() ||
      open.amount !== amount ||
      open.dueDate !== dueDate
    ) {
      plan.update.push({ id: open.id, months, amount, dueDate })
    }
  }
  return plan
}

export function applyFeePlan(draft: AppData, plan: FeePlan) {
  const now = new Date().toISOString()
  for (const r of plan.create) {
    /* Idempotent by design: the same plan can be applied more than once
       (React re-runs effects, two updates can race), and a student must
       never end up with two open fee reminders. */
    const already = draft.reminders.some(
      (x) =>
        x.studentId === r.studentId &&
        x.kind === 'fee' &&
        (x.status === 'pending' || x.status === 'sent'),
    )
    if (!already) draft.reminders.push(r)
  }
  for (const u of plan.update) {
    const r = draft.reminders.find((x) => x.id === u.id)
    if (!r) continue
    const grew = (r.months?.length ?? 0) < u.months.length
    r.months = u.months
    r.amount = u.amount
    r.dueDate = u.dueDate
    if (grew) {
      r.history.push({
        at: now,
        action: 'reopened',
        note: `Another month fell due — now covers ${u.months.length} months`,
      })
    }
  }
  for (const id of plan.close) {
    const r = draft.reminders.find((x) => x.id === id)
    if (!r) continue
    r.status = 'paid'
    r.history.push({ at: now, action: 'paid', note: 'Fees cleared' })
  }
}

export function openReminders(data: AppData): Reminder[] {
  return data.reminders.filter((r) => r.status === 'pending' || r.status === 'sent')
}

export function overdueReminders(data: AppData, today = todayISO()): Reminder[] {
  return openReminders(data).filter((r) => r.dueDate < today)
}

export function reminderStats(data: AppData) {
  const all = data.reminders
  const pending = all.filter((r) => r.status === 'pending').length
  const sent = all.filter((r) => r.status === 'sent').length
  const paid = all.filter((r) => r.status === 'paid').length
  const cancelled = all.filter((r) => r.status === 'cancelled').length
  const closed = paid + cancelled
  const everSent = all.filter((r) => r.sendCount > 0)
  const paidAfterSend = all.filter((r) => r.status === 'paid' && r.sendCount > 0).length
  return {
    total: all.length,
    pending, sent, paid, cancelled, closed,
    outstanding: all
      .filter((r) => r.status === 'pending' || r.status === 'sent')
      .reduce((a, r) => a + (r.amount ?? 0), 0),
    /** Of the reminders actually sent, how many ended in payment. */
    responseRate: everSent.length > 0 ? (paidAfterSend / everSent.length) * 100 : 0,
    totalSends: all.reduce((a, r) => a + r.sendCount, 0),
  }
}

/** Reminder sends per month, for the tracking chart. */
export function reminderActivity(data: AppData, n = 6) {
  const months = lastMonths(n)
  const sent = new Map<string, number>()
  const paidM = new Map<string, number>()
  for (const k of months) {
    sent.set(k, 0)
    paidM.set(k, 0)
  }
  for (const r of data.reminders) {
    for (const e of r.history) {
      const k = e.at.slice(0, 7)
      if (e.action === 'sent' || e.action === 'resent') {
        if (sent.has(k)) sent.set(k, sent.get(k)! + 1)
      } else if (e.action === 'paid') {
        if (paidM.has(k)) paidM.set(k, paidM.get(k)! + 1)
      }
    }
  }
  return months.map((key) => ({ key, sent: sent.get(key)!, paid: paidM.get(key)! }))
}

/* ------------------------------------------------------------------
   Dashboard roll-up
   ------------------------------------------------------------------ */

export function dashboard(data: AppData) {
  const thisMonth = currentMonthKey()
  const totals = monthTotals(data.transactions, thisMonth)
  const collection = collectionRate(data, thisMonth)
  const rem = reminderStats(data)
  const activeStudents = data.students.filter((s) => s.active).length
  const activeStaff = data.staff.filter((s) => s.active).length

  /** Who is actually on the floor today — an operational number, not a
      historical percentage. */
  const presentToday = todayAttendance(data, todayISO()).filter(
    (r) => r.status === 'present',
  ).length

  return {
    thisMonth,
    ...totals,
    collection,
    reminders: rem,
    activeStudents,
    activeStaff,
    presentToday,
    overdue: overdueReminders(data).length,
    unmarked: unmarkedToday(data),
  }
}

/* ------------------------------------------------------------------
   Reminder message rendering
   ------------------------------------------------------------------ */

/** ["2026-06","2026-07"] → "June and July". Two months read as one ask. */
export function monthsPhrase(months: string[] | undefined): string {
  const names = (months ?? []).map(monthNameFull)
  if (names.length === 0) return 'this month'
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

export function renderReminderMessage(
  data: AppData,
  reminder: Reminder,
): string {
  const student = studentById(data, reminder.studentId)
  const batch = batchById(data, student?.batchId)
  const due = reminder.dueDate
  const [y, m, d] = due.split('-')
  /* Built in parts so the UPI sentence can be dropped entirely when the
     batch has no UPI ID, rather than leaving a dangling "pay to:". */
  let template: string
  if (reminder.message?.trim()) {
    template = reminder.message
  } else {
    const parts = [ACADEMY.reminderTemplate]
    if (batch?.upiId) parts.push(ACADEMY.upiLine)
    parts.push(ACADEMY.reminderSignoff)
    template = parts.join(' ')
  }

  return template
    .replace(/\{upi\}/g, batch?.upiId ?? '')
    .replace(/\{payee\}/g, batch?.upiName ? ` (${batch.upiName})` : '')
    .replace(/\{months\}/g, monthsPhrase(reminder.months))
    .replace(/\{guardian\}/g, student?.guardian || student?.name || 'there')
    .replace(/\{student\}/g, student?.name ?? 'your ward')
    .replace(/\{academy\}/g, ACADEMY.name)
    .replace(/\{owner\}/g, ACADEMY.ownerName)
    .replace(/\{batch\}/g, batch?.name ?? 'the batch')
    .replace(/\{amount\}/g, reminder.amount ? `₹${reminder.amount.toLocaleString('en-IN')}` : 'the fee')
    .replace(/\{due\}/g, `${d}/${m}/${y}`)
    .replace(/\{slot\}/g, batch?.slot ?? '')
}

export function whatsappLink(
  countryCode: string,
  phone: string,
  message: string,
): string {
  const digits = (phone || '').replace(/\D/g, '')
  const cc = (countryCode || '91').replace(/\D/g, '')
  const full = digits.length > 10 ? digits : cc + digits
  return `https://wa.me/${full}?text=${encodeURIComponent(message)}`
}

export function smsLink(phone: string, message: string): string {
  return `sms:${(phone || '').replace(/\s/g, '')}?&body=${encodeURIComponent(message)}`
}

export function staffById(data: AppData, id: string): Staff | undefined {
  return data.staff.find((s) => s.id === id)
}
