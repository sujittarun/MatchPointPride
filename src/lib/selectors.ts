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
  isSunday,
  lastMonths,
  monthDates,
  monthNameFull,
  shiftMonth,
  todayISO,
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
   Dues, arrears and the reminder ladder — DELETED.

   Roughly 230 lines lived here: unpaidMonthsFor, planFeeReminders,
   applyFeePlan, studentProfile's money totals, and ARREARS_MONTHS. They
   worked. They were also a second implementation of arithmetic the
   platform already owns, and the platform rule is not a style
   preference:

     Anything that computes money lives in Postgres.

   Each one had an owner on the other side:

     unpaidMonthsFor      apply_payment_coverage / payments.period_from
     planFeeReminders     reminder_queue  (-2 heads-up, 0 due, +5 first
                          chase, +7..14 daily, +15 STOP - manual only)
     applyFeePlan         the same, plus reminder_events
     ARREARS_MONTHS = 6   the ladder, which does not need a constant

   The reason this matters is not tidiness. A parent's WhatsApp message
   and the owner's screen quoted the same number only for as long as two
   separate implementations happened to agree. Now there is one.

   What replaced it: cloud.dueToday() returns reminder_queue() rows and
   mapping.toReminders() dresses them. If you need a figure that is not
   there, add it to the SQL function — not back into this file.
   ------------------------------------------------------------------ */


/* ------------------------------------------------------------------
   Reading back what the database decided.

   The line these helpers stay on the right side of: which months a
   payment COVERS is decided by record_fee_payment, which writes
   period_from and period_to. These functions only read that decision
   back and lay it out for the ledger grid. None of them works out what
   anyone owes — that answer is reminder_queue's, and it arrives via
   cloud.dueToday().
   ------------------------------------------------------------------ */

/** The month a fee payment settles, as the server recorded it. */
export function paidForMonth(t: Transaction): string {
  return t.forMonth ?? t.date.slice(0, 7)
}

/**
 * How many months back the "which month is this for?" dropdown offers.
 *
 * A UI affordance, NOT the chase window. How long the academy pursues
 * an unpaid month is the ladder's business and lives in the database;
 * this is only how far back the owner can attribute a payment he is
 * entering today.
 */
export const ATTRIBUTABLE_MONTHS = 6

/* ------------------------------------------------------------------
   Finding someone who is already on file.

   Both halves have to match. The number alone is not identity — a
   parent's phone carries every one of their children, so matching on it
   would offer to bring back the wrong child. The name alone is not
   identity either: two families produce two Aaravs soon enough.
   ------------------------------------------------------------------ */

/** Last ten digits, so +91 and 0-prefixes compare equal. */
export function phoneKey(phone: string): string {
  return (phone || '').replace(/\D/g, '').slice(-10)
}

/**
 * Forgiving on trailing words, strict on the boundary.
 *
 * A surname gets typed sometimes and not others, so "Aarav" has to find
 * "Aarav Sharma". But the match is on whole words — "Ram" must never
 * find "Ramesh", or bringing someone back would attach a returning
 * student to a stranger's fee history.
 */
export function sameName(a: string, b: string): boolean {
  const norm = (n: string) =>
    (n || '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim()
  const x = norm(a)
  const y = norm(b)
  if (!x || !y) return false
  return x === y || x.startsWith(`${y} `) || y.startsWith(`${x} `)
}

/** Students already on file under this name AND this number. */
export function findExisting(
  students: Student[],
  name: string,
  phone: string,
): Student[] {
  // Half a number is not a number, and a blank name matches everyone on
  // it — either would turn "still typing" into a confident wrong answer.
  const key = phoneKey(phone)
  if (key.length !== 10 || !name.trim()) return []
  return students.filter((s) => phoneKey(s.phone) === key && sameName(s.name, name))
}

/** Enrolment history, oldest first. Always at least one period. */
export function spellsOf(student: Student): Spell[] {
  if (student.spells?.length) return student.spells
  return [{ from: student.joinedOn, ...(student.active ? {} : { to: student.joinedOn }) }]
}

/** Was the student on the roll at any point during this month? */
export function wasEnrolledIn(student: Student, monthKey: string): boolean {
  return spellsOf(student).some((sp) => {
    const from = sp.from.slice(0, 7)
    const to = sp.to ? sp.to.slice(0, 7) : '9999-12'
    return monthKey >= from && monthKey <= to
  })
}

/** Days actually training, skipping any gap between spells. */
export function tenureDays(student: Student, today = todayISO()): number {
  return spellsOf(student).reduce(
    (total, sp) => total + Math.max(0, daysBetween(sp.from, sp.to ?? today)),
    0,
  )
}

/**
 * Months the student was enrolled for which no payment covers them.
 *
 * Derived from payment rows the server wrote, not from a rule about
 * what is owed. Bounded to a year because the ledger grid shows a year.
 */
export function unpaidMonthsFor(data: AppData, student: Student): string[] {
  const covered = new Set(
    data.transactions
      .filter((t) => t.type === 'revenue' && t.studentId === student.id)
      .map(paidForMonth),
  )
  const out: string[] = []
  const first = spellsOf(student)[0].from.slice(0, 7)
  for (let m = currentMonthKey(), i = 0; m >= first && i < 12; m = shiftMonth(m, -1), i++) {
    if (wasEnrolledIn(student, m) && !covered.has(m)) out.push(m)
  }
  return out.reverse()
}

export interface StudentProfile {
  student: Student
  batch: Batch | undefined
  spells: Spell[]
  tenureDays: number
  returned: boolean
  payments: Transaction[]
  totalPaid: number
  ledger: Array<{ month: string; enrolled: boolean; paid: boolean; amount: number; chased: boolean }>
  ledgerTruncated: boolean
  unpaidMonths: string[]
  owed: number
  remindersCount: number
  remindersSent: number
  from: string
  to: string | undefined
}

export function studentProfile(data: AppData, studentId: string): StudentProfile | null {
  const student = data.students.find((s) => s.id === studentId)
  if (!student) return null

  const payments = data.transactions
    .filter((t) => t.type === 'revenue' && t.studentId === studentId)
    .sort((a, b) => (a.date < b.date ? 1 : -1))

  const paidMonths = new Map<string, number>()
  for (const t of payments) {
    paidMonths.set(paidForMonth(t), (paidMonths.get(paidForMonth(t)) ?? 0) + t.amount)
  }

  const spells = spellsOf(student)
  const reminders = data.reminders.filter((r) => r.studentId === studentId)
  const unpaid = unpaidMonthsFor(data, student)

  const LEDGER_MONTHS = 12
  const firstMonth = spells[0].from.slice(0, 7)
  const months: string[] = []
  for (let m = currentMonthKey(); m >= firstMonth && months.length < LEDGER_MONTHS; m = shiftMonth(m, -1)) {
    months.push(m)
  }
  const chasedWindow = new Set(lastMonths(ATTRIBUTABLE_MONTHS))

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
    ledgerTruncated: firstMonth < months[months.length - 1],
    unpaidMonths: unpaid,
    // The figure the owner acts on comes from reminder_queue, which is
    // already in data.reminders. This is the ledger's own arithmetic for
    // the history view, and it is deliberately the same source.
    owed: (data.reminders.find((r) => r.studentId === studentId)?.amount ?? 0),
    remindersCount: reminders.length,
    remindersSent: reminders.filter((r) => r.sendCount > 0).length,
    from: spells[0].from,
    to: spells[spells.length - 1].to,
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
