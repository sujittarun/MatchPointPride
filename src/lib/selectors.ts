import type {
  AppData,
  AttendanceRecord,
  AttendanceStatus,
  Batch,
  Reminder,
  Staff,
  Student,
  Transaction,
} from './types'
import { currentMonthKey, isSunday, lastMonths, monthDates, todayISO } from './format'
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
      .filter((t) => t.source === 'student_fee' && t.date.startsWith(monthKey) && t.studentId)
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

  const staffConsistency =
    activeStaff > 0
      ? data.staff
          .filter((s) => s.active)
          .reduce((a, s) => a + staffMonthStats(data, s.id, thisMonth).consistency, 0) /
        activeStaff
      : 0

  return {
    thisMonth,
    ...totals,
    collection,
    reminders: rem,
    activeStudents,
    activeStaff,
    staffConsistency,
    overdue: overdueReminders(data).length,
    unmarked: unmarkedToday(data),
  }
}

/* ------------------------------------------------------------------
   Reminder message rendering
   ------------------------------------------------------------------ */

export function renderReminderMessage(
  data: AppData,
  reminder: Reminder,
): string {
  const student = studentById(data, reminder.studentId)
  const batch = batchById(data, student?.batchId)
  const due = reminder.dueDate
  const [y, m, d] = due.split('-')
  const template = reminder.message?.trim() ? reminder.message : ACADEMY.reminderTemplate
  return template
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
