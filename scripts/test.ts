/* Regression suite. Runs the real modules — no mocks, no framework.
   npm test  */
import {
  addDays, currentMonthKey, dateLabelFull, daysBetween, daysInMonth, dueLabel,
  clampDay, fromISO, inr, initials, isSunday, lastMonths, monthDates, monthLabel,
  dueDateFor, nextDueDate, ordinal, shiftMonth, toISO, todayISO, uid, weekday,
} from '../src/lib/format'
import {
  collectionRate, dashboard, expenseByCategory, moneyByMonth, monthTotals,
  renderReminderMessage, reminderStats, revenueBySource, smsLink,
  staffLifetime, staffMonthStats, workingDays, whatsappLink,
  monthsPhrase, paidForMonth, unpaidMonthsFor,
  findExisting, phoneKey, sameName, needsACall, blockedReminders,
} from '../src/lib/selectors'
import { toStudents } from '../src/lib/mapping'
import type { EnrollmentRow, MemberRow } from '../src/lib/cloud'
import { buildEmptyData, buildSeedData } from '../src/lib/seed'
import { normalise } from '../src/lib/store'
import { parseCSV, studentsFromCSV, studentsToCSV } from '../src/lib/csv'
import type { AppData } from '../src/lib/types'

let pass = 0
const fails: string[] = []

function ok(name: string, cond: boolean, detail = '') {
  if (cond) pass++
  else fails.push(`${name}${detail ? ` — ${detail}` : ''}`)
}
function eq(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  ok(name, a === e, `got ${a}, expected ${e}`)
}
function finite(name: string, v: number) {
  ok(name, Number.isFinite(v), `got ${v}`)
}

/* ================= dates ================= */
eq('toISO/fromISO roundtrip', toISO(fromISO('2026-03-09')), '2026-03-09')
eq('fromISO is local midnight (no UTC drift)', fromISO('2026-01-01').getDate(), 1)
eq('daysInMonth Feb 2024 (leap)', daysInMonth('2024-02'), 29)
eq('daysInMonth Feb 2026', daysInMonth('2026-02'), 28)
eq('daysInMonth Dec', daysInMonth('2026-12'), 31)
eq('monthDates length', monthDates('2026-02').length, 28)
eq('monthDates first/last', [monthDates('2026-02')[0], monthDates('2026-02')[27]], ['2026-02-01', '2026-02-28'])
eq('shiftMonth back over year boundary', shiftMonth('2026-01', -1), '2025-12')
eq('shiftMonth fwd over year boundary', shiftMonth('2026-12', 1), '2027-01')
eq('shiftMonth -13', shiftMonth('2026-03', -13), '2025-02')
eq('lastMonths crosses year', lastMonths(3, '2026-02'), ['2025-12', '2026-01', '2026-02'])
eq('lastMonths(1)', lastMonths(1, '2026-07'), ['2026-07'])
eq('addDays over month end', addDays('2026-01-31', 1), '2026-02-01')
eq('addDays over year end', addDays('2026-12-31', 1), '2027-01-01')
eq('addDays negative', addDays('2026-03-01', -1), '2026-02-28')
eq('addDays leap', addDays('2024-02-28', 1), '2024-02-29')
eq('daysBetween', daysBetween('2026-01-01', '2026-01-31'), 30)
eq('daysBetween negative', daysBetween('2026-01-31', '2026-01-01'), -30)
eq('daysBetween across DST-ish boundary', daysBetween('2026-03-01', '2026-04-01'), 31)
eq('weekday known date', weekday('2026-07-28'), 'Tue')
eq('isSunday true', isSunday('2026-07-26'), true)
eq('isSunday false', isSunday('2026-07-28'), false)
eq('dueLabel today', dueLabel('2026-07-28', '2026-07-28'), 'Due today')
eq('dueLabel tomorrow', dueLabel('2026-07-29', '2026-07-28'), 'Due tomorrow')
eq('dueLabel overdue 1', dueLabel('2026-07-27', '2026-07-28'), '1 day overdue')
eq('dueLabel overdue n', dueLabel('2026-07-01', '2026-07-28'), '27 days overdue')
eq('monthLabel', monthLabel('2026-07'), 'Jul 2026')
eq('dateLabelFull', dateLabelFull('2026-07-05'), '5 Jul 2026')
ok('todayISO shape', /^\d{4}-\d{2}-\d{2}$/.test(todayISO()), todayISO())
eq('currentMonthKey matches todayISO', currentMonthKey(), todayISO().slice(0, 7))


/* ================= ordinals (fee due day) ================= */
eq('ordinal 1st', ordinal(1), '1st')
eq('ordinal 2nd', ordinal(2), '2nd')
eq('ordinal 3rd', ordinal(3), '3rd')
eq('ordinal 4th', ordinal(4), '4th')
eq('ordinal 11th not 11st', ordinal(11), '11th')
eq('ordinal 12th not 12nd', ordinal(12), '12th')
eq('ordinal 13th not 13rd', ordinal(13), '13th')
eq('ordinal 21st', ordinal(21), '21st')
eq('ordinal 22nd', ordinal(22), '22nd')
eq('ordinal 23rd', ordinal(23), '23rd')
eq('ordinal 28th', ordinal(28), '28th')
ok('ordinal: every valid fee day renders sanely',
  Array.from({length: 28}, (_, i) => ordinal(i + 1)).every((x) => /^\d{1,2}(st|nd|rd|th)$/.test(x)))


/* ================= fee due dates in short months ================= */
eq('due 5th in a normal month', dueDateFor('2026-07', 5), '2026-07-05')
eq('due 31st in a 31-day month', dueDateFor('2026-07', 31), '2026-07-31')
eq('due 31st in a 30-day month falls on the 30th', dueDateFor('2026-04', 31), '2026-04-30')
eq('due 31st in February falls on the 28th', dueDateFor('2026-02', 31), '2026-02-28')
eq('due 30th in a leap February falls on the 29th', dueDateFor('2024-02', 30), '2024-02-29')
eq('due 29th in a leap February is the 29th', dueDateFor('2024-02', 29), '2024-02-29')
eq('due 29th in a non-leap February falls on the 28th', dueDateFor('2026-02', 29), '2026-02-28')
eq('due day 0 becomes the 1st', dueDateFor('2026-07', 0), '2026-07-01')
eq('due day 99 becomes month end', dueDateFor('2026-07', 99), '2026-07-31')
ok('every fee day 1-31 yields a real date in every month of 2026',
  lastMonths(12, '2026-12').every((m) =>
    Array.from({ length: 31 }, (_, i) => dueDateFor(m, i + 1)).every((d) => {
      const day = Number(d.slice(8))
      return d.startsWith(m) && day >= 1 && day <= daysInMonth(m)
    })))
eq('clampDay now allows 31', clampDay(31), 31)
eq('clampDay still floors at 1', clampDay(0), 1)
eq('clampDay caps at 31', clampDay(45), 31)

/* ================= money / text ================= */
eq('inr zero', inr(0), '₹0')
eq('inr thousands uses Indian grouping', inr(150000), '₹1,50,000')
eq('inr compact k', inr(7900, { compact: true }), '₹7.9k')
eq('inr compact L', inr(170000, { compact: true }), '₹1.7L')
eq('inr compact Cr', inr(12000000, { compact: true }), '₹1.2Cr')
eq('inr compact below 1000', inr(999, { compact: true }), '₹999')
eq('inr negative', inr(-500), '₹-500')
eq('inr rounds', inr(99.6), '₹100')
eq('initials two words', initials('Aarav Reddy'), 'AR')
eq('initials one word', initials('Venu'), 'VE')
eq('initials extra spaces', initials('  Sai   Charan  '), 'SC')
eq('initials empty', initials('   '), '?')
eq('initials three words uses first+last', initials('A B C'), 'AC')
ok('uid unique-ish', new Set(Array.from({ length: 5000 }, () => uid())).size === 5000)

/* ================= links ================= */
eq('whatsapp 10-digit gets country code', whatsappLink('91', '9876543210', 'hi'), 'https://wa.me/919876543210?text=hi')
eq('whatsapp already has cc', whatsappLink('91', '919876543210', 'hi'), 'https://wa.me/919876543210?text=hi')
eq('whatsapp strips punctuation', whatsappLink('91', '+91 98765-43210', 'hi'), 'https://wa.me/919876543210?text=hi')
eq('whatsapp encodes message', whatsappLink('91', '9876543210', 'a b&c'), 'https://wa.me/919876543210?text=a%20b%26c')
ok('whatsapp empty phone does not throw', whatsappLink('91', '', 'x').startsWith('https://wa.me/91?'))
ok('sms link encodes', smsLink('9876543210', 'a b').includes('a%20b'))

/* ================= empty dataset (division-by-zero surface) ================= */
const empty: AppData = buildEmptyData()
const eDash = dashboard(empty)
finite('empty: revenue', eDash.revenue)
finite('empty: expense', eDash.expense)
finite('empty: net', eDash.net)
finite('empty: collection rate', eDash.collection.rate)
eq('empty: nobody present today', eDash.presentToday, 0)
finite('empty: reminder response rate', eDash.reminders.responseRate)
eq('empty: activeStudents', eDash.activeStudents, 0)
eq('empty: collection rate is 0 not NaN', eDash.collection.rate, 0)
eq('empty: outstanding', eDash.reminders.outstanding, 0)
eq('empty: batches preserved by startFresh', empty.batches.length, 6)
eq('empty: one staff seeded', empty.staff.length, 1)
const eStaff = staffMonthStats(empty, empty.staff[0].id, currentMonthKey())
eq('empty: unmarked staff consistency is 0', eStaff.consistency, 0)
finite('empty: lifetime consistency', staffLifetime(empty, empty.staff[0].id).consistency)
eq('empty: moneyByMonth zeros', moneyByMonth([], lastMonths(3)).map((m) => m.net), [0, 0, 0])
eq('empty: revenueBySource', revenueBySource([]), [])
eq('empty: expenseByCategory', expenseByCategory([]), [])
eq('empty: monthTotals', monthTotals([], '2026-07'), { revenue: 0, expense: 0, net: 0 })

/* ================= seeded dataset sanity ================= */
const seed = buildSeedData()
const sDash = dashboard(seed)
finite('seed: net', sDash.net)
ok('seed: collection rate 0..100', sDash.collection.rate >= 0 && sDash.collection.rate <= 100, String(sDash.collection.rate))
ok('seed: present today never exceeds active staff', sDash.presentToday <= sDash.activeStaff, sDash.presentToday + '/' + sDash.activeStaff)
ok('seed: response rate 0..100', sDash.reminders.responseRate >= 0 && sDash.reminders.responseRate <= 100, String(sDash.reminders.responseRate))
ok('seed: has 6 batches', seed.batches.length === 6)
ok('seed: every student maps to a real batch',
  seed.students.every((s) => seed.batches.some((b) => b.id === s.batchId)))
ok('seed: every reminder maps to a real student',
  seed.reminders.every((r) => seed.students.some((s) => s.id === r.studentId)))
ok('seed: every attendance maps to real staff',
  seed.attendance.every((a) => seed.staff.some((s) => s.id === a.staffId)))
ok('seed: no attendance on Sundays', seed.attendance.every((a) => !isSunday(a.date)))
ok('seed: no attendance in the future', seed.attendance.every((a) => a.date <= todayISO()))
ok('seed: no transactions in the future', seed.transactions.every((t) => t.date <= todayISO()))
ok('seed: no duplicate attendance ids',
  new Set(seed.attendance.map((a) => a.id)).size === seed.attendance.length)
ok('seed: no duplicate txn ids',
  new Set(seed.transactions.map((t) => t.id)).size === seed.transactions.length)
ok('seed: no duplicate student ids',
  new Set(seed.students.map((s) => s.id)).size === seed.students.length)
ok('seed: fee due days within 1..28',
  seed.students.every((s) => s.feeDueDay >= 1 && s.feeDueDay <= 28))
ok('seed: all amounts positive', seed.transactions.every((t) => t.amount > 0))

/* ================= collectionRate semantics ================= */
{
  const d: AppData = JSON.parse(JSON.stringify(buildEmptyData()))
  const b = d.batches[0]
  d.students.push(
    { id: 'a', name: 'A', batchId: b.id, phone: '1', joinedOn: '2026-01-01', monthlyFee: 1000, feeDueDay: 1, active: true },
    { id: 'b', name: 'B', batchId: b.id, phone: '2', joinedOn: '2026-01-01', monthlyFee: 2000, feeDueDay: 1, active: true },
    { id: 'c', name: 'C', batchId: b.id, phone: '3', joinedOn: '2026-01-01', monthlyFee: 5000, feeDueDay: 1, active: false },
  )
  const m = currentMonthKey()
  d.transactions.push({
    id: 't1', type: 'revenue', date: `${m}-05`, amount: 1000, category: 'Student Fee',
    source: 'student_fee', studentId: 'a', createdAt: '', })
  const cr = collectionRate(d, m)
  eq('collectionRate: paid count', cr.paid, 1)
  eq('collectionRate: total excludes inactive', cr.total, 2)
  eq('collectionRate: expected excludes inactive', cr.expected, 3000)
  eq('collectionRate: collected', cr.collected, 1000)
  eq('collectionRate: rate', Math.round(cr.rate), 50)

  // inactive student pays anyway -> should not exceed 100%
  d.transactions.push({
    id: 't2', type: 'revenue', date: `${m}-06`, amount: 5000, category: 'Student Fee',
    source: 'student_fee', studentId: 'c', createdAt: '' })
  const cr2 = collectionRate(d, m)
  ok('collectionRate: inactive payer does not push rate over 100', cr2.rate <= 100, String(cr2.rate))
  eq('collectionRate: still 1 of 2 active paid', [cr2.paid, cr2.total], [1, 2])

  // duplicate payment for same student must not double-count the payer
  d.transactions.push({
    id: 't3', type: 'revenue', date: `${m}-07`, amount: 1000, category: 'Student Fee',
    source: 'student_fee', studentId: 'a', createdAt: '' })
  const cr3 = collectionRate(d, m)
  eq('collectionRate: duplicate payment does not double-count payer', cr3.paid, 1)
}

/* ================= staff attendance math (present/absent only) ================= */
{
  const d: AppData = JSON.parse(JSON.stringify(buildEmptyData()))
  const sid = d.staff[0].id
  const m = shiftMonth(currentMonthKey(), -1) // fully elapsed month
  const days = workingDays(m)
  ok('workingDays excludes Sundays', days.every((x) => !isSunday(x)))
  eq('workingDays count sane', days.length > 20 && days.length < 28, true)

  d.attendance.push({ id: `${sid}__${days[0]}`, staffId: sid, date: days[0], status: 'present' })
  d.attendance.push({ id: `${sid}__${days[1]}`, staffId: sid, date: days[1], status: 'absent' })
  const s1 = staffMonthStats(d, sid, m)
  eq('attendance: 1 present 1 absent -> 50%', Math.round(s1.consistency), 50)
  eq('attendance: marked counts only marked days', s1.marked, 2)
  eq('attendance: unmarked days do not count against consistency', s1.workingDays > s1.marked, true)

  d.attendance.push({ id: `${sid}__${days[2]}`, staffId: sid, date: days[2], status: 'present' })
  d.attendance.push({ id: `${sid}__${days[3]}`, staffId: sid, date: days[3], status: 'present' })
  const s2 = staffMonthStats(d, sid, m)
  eq('attendance: 3 of 4 present -> 75%', Math.round(s2.consistency), 75)
  ok('attendance: consistency never exceeds 100', s2.consistency <= 100)
  eq('attendance: present tally', s2.present, 3)
  eq('attendance: absent tally', s2.absent, 1)

  // a record on a Sunday must be ignored by month stats
  const sunday = monthDates(m).find(isSunday)!
  d.attendance.push({ id: `${sid}__${sunday}`, staffId: sid, date: sunday, status: 'present' })
  const s3 = staffMonthStats(d, sid, m)
  eq('attendance: Sunday record excluded from marked', s3.marked, 4)

  const lt = staffLifetime(d, sid)
  eq('lifetime: counts every record including Sunday', lt.marked, 5)
  ok('lifetime: consistency in range', lt.consistency > 0 && lt.consistency <= 100)

  // all-absent month must be 0%, not NaN
  const d2: AppData = JSON.parse(JSON.stringify(buildEmptyData()))
  const sid2 = d2.staff[0].id
  d2.attendance.push({ id: `${sid2}__${days[0]}`, staffId: sid2, date: days[0], status: 'absent' })
  eq('attendance: all-absent month is 0%', staffMonthStats(d2, sid2, m).consistency, 0)
}

/* ================= migration of retired attendance states ================= */
{
  const legacy: any = JSON.parse(JSON.stringify(buildEmptyData()))
  const sid = legacy.staff[0].id
  legacy.attendance = [
    { id: `${sid}__2026-06-01`, staffId: sid, date: '2026-06-01', status: 'half' },
    { id: `${sid}__2026-06-02`, staffId: sid, date: '2026-06-02', status: 'leave' },
    { id: `${sid}__2026-06-03`, staffId: sid, date: '2026-06-03', status: 'present' },
  ]
  legacy.students = [
    { id: 'x', name: 'X', batchId: legacy.batches[0].id, phone: '9', joinedOn: '2026-01-01', monthlyFee: 100, feeDueDay: 31, active: true },
    { id: 'y', name: 'Y', batchId: legacy.batches[0].id, phone: '9', joinedOn: '2026-01-01', monthlyFee: 100, feeDueDay: 0, active: true },
  ]
  const out = normalise(legacy)
  eq('migration: half -> present', out.attendance[0].status, 'present')
  eq('migration: leave -> absent', out.attendance[1].status, 'absent')
  eq('migration: present untouched', out.attendance[2].status, 'present')
  ok('migration: only two states remain',
    out.attendance.every((a: any) => a.status === 'present' || a.status === 'absent'))
  eq('migration: fee day 31 is allowed', out.students[0].feeDueDay, 31)
  eq('migration: fee day 0 clamped to 1', out.students[1].feeDueDay, 1)

  // a document missing whole collections must not explode
  const sparse: any = { version: 1, batches: [] }
  const fixed = normalise(sparse)
  eq('migration: missing collections filled', [fixed.students.length, fixed.reminders.length, fixed.staff.length, fixed.attendance.length, fixed.transactions.length], [0, 0, 0, 0, 0])
  ok('migration: settings defaulted', fixed.settings.passcode === '1234')
}

/* ================= reminder stats ================= */
{
  const d: AppData = JSON.parse(JSON.stringify(buildEmptyData()))
  eq('reminderStats: empty response rate', reminderStats(d).responseRate, 0)
  eq('reminderStats: empty outstanding', reminderStats(d).outstanding, 0)

  d.students.push({ id: 's1', name: 'S', batchId: d.batches[0].id, phone: '9', joinedOn: '2026-01-01', monthlyFee: 100, feeDueDay: 1, active: true })
  const mk = (id: string, status: any, sendCount: number, amount: number) => ({
    id, studentId: 's1', kind: 'fee' as const, title: 't', message: '', dueDate: '2026-07-01',
    amount, status, createdAt: '2026-07-01T00:00:00.000Z', sendCount,
    history: [{ at: '2026-07-01T00:00:00.000Z', action: 'created' as const }],
  })
  d.reminders.push(mk('r1', 'paid', 1, 100))     // sent -> paid
  d.reminders.push(mk('r2', 'cancelled', 1, 100)) // sent -> not paid
  d.reminders.push(mk('r3', 'paid', 0, 100))      // paid without ever sending
  d.reminders.push(mk('r4', 'pending', 0, 250))   // open
  d.reminders.push(mk('r5', 'sent', 1, 300))      // open, sent
  const rs = reminderStats(d)
  eq('reminderStats: outstanding = pending + sent only', rs.outstanding, 550)
  eq('reminderStats: response rate over reminders actually sent', Math.round(rs.responseRate), 33)
  eq('reminderStats: totals', [rs.pending, rs.sent, rs.paid, rs.cancelled], [1, 1, 2, 1])
}

/* ================= message rendering ================= */
{
  const d: AppData = JSON.parse(JSON.stringify(buildEmptyData()))
  d.students.push({ id: 's1', name: 'Aarav Reddy', batchId: d.batches[0].id, phone: '9876543210', guardian: 'Reddy family', joinedOn: '2026-01-01', monthlyFee: 2000, feeDueDay: 5, active: true })
  const rem: any = { id: 'r', studentId: 's1', kind: 'fee', title: 't', message: '', dueDate: '2026-07-05', amount: 2000, months: ['2026-07'], status: 'pending', createdAt: '', sendCount: 0, history: [] }
  const msg = renderReminderMessage(d, rem)
  ok('message: substitutes student', msg.includes('Aarav Reddy'))
  ok('message: substitutes guardian', msg.includes('Reddy family'))
  ok('message: substitutes amount', msg.includes('₹2,000'))
  ok('message: names the month owed', msg.includes('July'), msg)
  ok('message: no leftover placeholders', !/\{[a-z]+\}/.test(msg), msg)

  // reminder whose student was deleted must not throw
  const orphan: any = { ...rem, studentId: 'gone' }
  let threw = false
  let omsg = ''
  try { omsg = renderReminderMessage(d, orphan) } catch { threw = true }
  ok('message: orphan reminder does not throw', !threw)
  ok('message: orphan has no leftover placeholders', !threw && !/\{[a-z]+\}/.test(omsg), omsg)
}

/* ================= aggregation ================= */
{
  const txns: any[] = [
    { id: '1', type: 'revenue', date: '2026-07-01', amount: 100, category: 'Student Fee', source: 'student_fee', createdAt: '' },
    { id: '2', type: 'revenue', date: '2026-07-02', amount: 300, category: 'Court Booking', source: 'court_booking', createdAt: '' },
    { id: '3', type: 'expense', date: '2026-07-03', amount: 50, category: 'Rent', createdAt: '' },
    { id: '4', type: 'expense', date: '2026-06-30', amount: 999, category: 'Rent', createdAt: '' },
  ]
  eq('monthTotals scopes to month', monthTotals(txns, '2026-07'), { revenue: 400, expense: 50, net: 350 })
  eq('revenueBySource sorted desc', revenueBySource(txns, '2026-07').map((r) => r.label), ['Court bookings', 'Student fees'])
  eq('expenseByCategory scoped', expenseByCategory(txns, '2026-07'), [{ label: 'Rent', value: 50 }])
  const mm = moneyByMonth(txns, ['2026-06', '2026-07'])
  eq('moneyByMonth per-month net', mm.map((m) => m.net), [-999, 350])
  eq('moneyByMonth ignores months not requested', moneyByMonth(txns, ['2026-05']).map((m) => m.revenue), [0])
}


/* ================= student spreadsheet ================= */
{
  // --- parser edge cases ---
  eq('csv: simple row', parseCSV('a,b,c'), [['a', 'b', 'c']])
  eq('csv: quoted comma', parseCSV('"Reddy, A",b'), [['Reddy, A', 'b']])
  eq('csv: escaped quote', parseCSV('"say ""hi""",b'), [['say "hi"', 'b']])
  eq('csv: embedded newline', parseCSV('"line1\nline2",b'), [['line1\nline2', 'b']])
  eq('csv: CRLF rows', parseCSV('a,b\r\nc,d'), [['a', 'b'], ['c', 'd']])
  eq('csv: BOM stripped', parseCSV('﻿a,b'), [['a', 'b']])
  eq('csv: blank rows dropped', parseCSV('a,b\n\n\nc,d'), [['a', 'b'], ['c', 'd']])
  eq('csv: trailing empty cell kept', parseCSV('a,'), [['a', '']])

  // --- round trip ---
  const seeded = buildSeedData()
  const text = studentsToCSV(seeded)
  const parsed = parseCSV(text)
  eq('csv: header row', parsed[0][0], 'Name')
  eq('csv: one row per student', parsed.length - 1, seeded.students.length)

  /* The parser is what still exists. It used to hand back a patch for a
     local draft; now it hands back rows and Settings writes each one to
     Postgres, so these assert on the parse, not on a mutated document. */
  const fresh: AppData = JSON.parse(JSON.stringify(buildEmptyData()))
  const rep = studentsFromCSV(text, fresh)
  eq('csv: round trip parses everyone', rep.rows?.length ?? 0, seeded.students.length)
  eq('csv: nothing skipped on round trip', rep.skipped.length, 0)
  eq('csv: all added, none updated', [rep.added, rep.updated], [seeded.students.length, 0])

  const tricky = seeded.students.find((s) => s.name.includes(' '))!
  ok('csv: a real name round-trips', (rep.rows ?? []).some((r) => r.name === tricky.name))

  // --- bad input ---
  const empty: AppData = JSON.parse(JSON.stringify(buildEmptyData()))
  eq('csv: header only is rejected', studentsFromCSV('Name,Batch', empty).ok, false)
  eq('csv: garbage is rejected', studentsFromCSV('total nonsense', empty).ok, false)
  eq('csv: missing required columns rejected',
    studentsFromCSV('Foo,Bar\n1,2', empty).message.includes('Name'), true)

  // unknown batch is reported, not invented
  const unknown = studentsFromCSV('Name,Batch\nAsha,Nonexistent Batch', empty)
  eq('csv: unknown batch skipped', unknown.skipped.length, 1)
  eq('csv: unknown batch reason', unknown.skipped[0].why.includes('no batch called'), true)
  eq('csv: no batch invented', empty.batches.length, 6)

  // minimal row uses batch defaults
  const b0 = empty.batches[0]
  const minimal = studentsFromCSV(`Name,Batch\nAsha,${b0.name}`, empty)
  const asha = (minimal.rows ?? []).find((r) => r.name === 'Asha')!
  eq('csv: minimal row parsed', !!asha, true)
  eq('csv: fee defaults to the batch fee', asha.monthlyFee, b0.fee)
  eq('csv: defaults to active', asha.active, true)
  eq('csv: due day defaults to 1', asha.feeDueDay, 1)

  // dirty values are cleaned, not trusted
  const dirty = studentsFromCSV(
    `Name,Batch,Monthly Fee,Fee Due Day,Status,Phone\n` +
    `Bela,${b0.name},"₹2,500",99,Inactive, 98765 43210 `,
    empty,
  )
  const bela = (dirty.rows ?? []).find((r) => r.name === 'Bela')!
  eq('csv: currency text parsed to number', bela.monthlyFee, 2500)
  eq('csv: out-of-range due day clamped to 31', bela.feeDueDay, 31)
  eq('csv: Inactive status honoured', bela.active, false)
  eq('csv: phone whitespace stripped', bela.phone, '9876543210')

  // negative fee in a sheet must not become negative data
  const neg = studentsFromCSV(`Name,Batch,Monthly Fee\nCarl,${b0.name},-900`, empty)
  eq('csv: negative fee clamped to 0', (neg.rows ?? []).find((r) => r.name === 'Carl')!.monthlyFee, 0)

  // duplicate rows inside one file
  const dup = studentsFromCSV(`Name,Batch\nDia,${b0.name}\nDia,${b0.name}`, empty)
  eq('csv: in-file duplicate skipped', dup.skipped.filter((x) => x.why.includes('duplicate')).length, 1)
  eq('csv: only one of the pair imported', dup.added, 1)

  // blank name row
  const blank = studentsFromCSV(`Name,Batch\n,${b0.name}`, empty)
  eq('csv: blank name skipped', blank.skipped[0].why, 'no name')

  // batch matching ignores case and padding
  const loose = studentsFromCSV(`Name,Batch\nEve,   ${b0.name.toUpperCase()}   `, empty)
  eq('csv: batch match is case and space tolerant', loose.skipped.length, 0)
}


/* ================= arrears and the reminder ladder =================

   These assertions are gone, and deliberately not replaced with
   client-side equivalents.

   They tested unpaidMonthsFor, planFeeReminders and applyFeePlan —
   which computed, in TypeScript, who owed what and when to chase them.
   That logic now belongs to Postgres (reminder_queue, resolve_fee,
   record_fee_payment), so testing it here would mean re-implementing it
   here, which is precisely the duplication this change removed.

   The equivalent proofs run as SQL, inside the migrations, against the
   real database and rolled back:

     0008  full life cycle — resolve_fee 1200 from the batch rule,
           reminder_queue stage overdue at day 5, record_fee_payment
           rolling the renewal forward, the student leaving the queue
     0017  the same fixture again, so a tenant guard cannot be added
           without proving it did not break what it protects
     0019  one student at each rung of the ladder in the seed data

   A migration that fails those assertions cannot be applied.
   ================================================================= */

/* ================= month phrasing ================= */
eq('phrase: one month', monthsPhrase(['2026-07']), 'July')
eq('phrase: two months reads as one ask', monthsPhrase(['2026-06', '2026-07']), 'June and July')
eq('phrase: three months', monthsPhrase(['2026-05', '2026-06', '2026-07']), 'May, June and July')
eq('phrase: none', monthsPhrase([]), 'this month')
eq('phrase: undefined', monthsPhrase(undefined), 'this month')

/* ================= leaving and coming back =================
   One member, many enrolments. Each enrolment is a spell, and the gap
   between two of them is the months a student was away — which is what
   makes tenure honest and what the profile renders as "Rejoined".
   The alternative, a second member row per return, strands their fee
   history on an id nothing reads any more. */
const member = (over: Partial<MemberRow> = {}): MemberRow => ({
  id: 1, name: 'Aarav Sharma', phone: null, parent_name: 'Sunita',
  parent_phone: '9876543210', joined: '2025-06-01', status: 'active',
  notes: null, ...over,
})
const enrol = (over: Partial<EnrollmentRow> = {}): EnrollmentRow => ({
  id: 10, member_id: 1, centre_id: 1, batch_id: 5, sport: 'badminton',
  plan_months: 1, custom_amount: null, joined_on: '2025-06-01',
  renewal_on: '2026-08-01', status: 'active', discontinued_on: null, ...over,
})

const rejoined = toStudents(
  [member()],
  [
    enrol({ id: 10, joined_on: '2025-06-01', discontinued_on: '2026-04-12', status: 'discontinued' }),
    enrol({ id: 11, joined_on: '2026-07-01', status: 'active' }),
  ],
  { 5: 2000 },
)
eq('rejoin: one student, not two', rejoined.length, 1)
eq('rejoin: both spells kept', rejoined[0].spells?.length, 2)
eq('rejoin: spells oldest first', rejoined[0].spells?.[0].from, '2025-06-01')
eq('rejoin: the closed spell keeps its end date', rejoined[0].spells?.[0].to, '2026-04-12')
eq('rejoin: the live spell is open', rejoined[0].spells?.[1].to, undefined)
eq('rejoin: reads as active', rejoined[0].active, true)
eq('rejoin: the live enrolment is the one writes address', rejoined[0].enrollmentId, 11)

const gone = toStudents(
  [member({ status: 'discontinued' })],
  [enrol({ discontinued_on: '2026-04-12', status: 'discontinued' })],
  { 5: 2000 },
)
eq('left: reads as inactive', gone[0].active, false)
eq('left: the spell is closed', gone[0].spells?.[0].to, '2026-04-12')

eq('a member with no enrolment is not a student yet',
   toStudents([member()], [], { 5: 2000 }).length, 0)

/* Two live enrolments cannot happen — reenroll_member refuses to create
   the second — but if one ever did, picking must be deterministic
   rather than order-of-arrival. */
const twoLive = toStudents(
  [member()],
  [enrol({ id: 10, joined_on: '2025-06-01' }), enrol({ id: 11, joined_on: '2026-07-01' })],
  { 5: 2000 },
)
eq('two live enrolments: the earlier one wins, not the last read', twoLive[0].enrollmentId, 10)

/* ================= the next date a fee falls due =================
   This is what a new student's renewal_on is set to, and what the
   reminder ladder counts days from. It got two things wrong at once:

   1. It built the date with new Date(y, m, d).toISOString(), which is
      local midnight converted to UTC — 18:30 the PREVIOUS day in IST.
      Every renewal was stored a day early, so a student billed on the
      1st was written as due on the 31st of the month before, and one
      billed on the 27th came out as the 26th.
   2. It clamped the billing day to 28, silently, so the 30th and 31st
      became the 28th for good — while the form promised "the last day
      in shorter months".

   Both are invisible from a keyboard in London, which is why they are
   pinned here with an explicit "today" rather than the clock. */
eq('due later this month', nextDueDate(31, '2026-07-29'), '2026-07-31')
eq('the billing day has gone by, so next month', nextDueDate(1, '2026-07-29'), '2026-08-01')
eq('NOT the 31st of the month before', nextDueDate(1, '2026-07-29') > '2026-07-31', true)
eq('due today counts as due today', nextDueDate(29, '2026-07-29'), '2026-07-29')
eq('the 27th is the 27th, not the 26th', nextDueDate(27, '2026-07-28'), '2026-08-27')
eq('the 26th this month while it is still the 25th', nextDueDate(26, '2026-07-25'), '2026-07-26')
eq('billed on the 31st, in a 30-day month', nextDueDate(31, '2026-09-01'), '2026-09-30')
eq('billed on the 31st, in February', nextDueDate(31, '2026-02-01'), '2026-02-28')
eq('billed on the 30th is NOT silently the 28th', nextDueDate(30, '2026-07-01'), '2026-07-30')
eq('rolls across a year boundary', nextDueDate(5, '2026-12-31'), '2027-01-05')
eq('leap February', nextDueDate(31, '2024-02-01'), '2024-02-29')

/* The rejoin boundary. `from` is the day billing starts — the day they
   came back — NOT today. Anchored to today instead, a student brought
   back on 15 June got a renewal of 27 August: two and a half months
   free, and silent, because a renewal in the future never reaches the
   chase ladder at all. */
eq('backdated return bills from the return, not from today',
   nextDueDate(27, '2026-06-15'), '2026-06-27')
eq('returning after the billing day waits for next month',
   nextDueDate(27, '2026-06-28'), '2026-07-27')
eq('returning ON the billing day is due that day',
   nextDueDate(27, '2026-06-27'), '2026-06-27')
eq('a backdated return into a short month still clamps',
   nextDueDate(31, '2026-02-01'), '2026-02-28')
eq('a return dated in the future bills from the future date',
   nextDueDate(10, '2026-09-05'), '2026-09-10')
ok('a backdated return lands in the past, so the ladder can see it',
   nextDueDate(27, '2026-06-15') < '2026-07-29')

/* Moving an existing student's billing day.
   Anchored to what they currently owe, never to today, so correcting a
   fee day can only ever push the next due date later. Pulling it
   earlier would turn a paid-up student overdue and invent a chase out
   of an admin correction. */
eq('later day in the same cycle', nextDueDate(15, '2026-08-01'), '2026-08-15')
eq('earlier day waits for the next cycle', nextDueDate(5, '2026-08-20'), '2026-09-05')
eq('the same day is no change at all', nextDueDate(1, '2026-08-01'), '2026-08-01')
ok('moving the billing day never pulls a due date backwards',
   [1, 5, 12, 20, 28, 31].every((d) => nextDueDate(d, '2026-08-14') >= '2026-08-14'))

/* ================= the students the ladder gave up on =================
   Past +15 days the platform stops messaging and hands over to a
   person. That handover used to go nowhere: the reminder dropped out of
   every list, so the longer someone owed, the less visible they became.
   needsACall is what Home surfaces instead. */
const withBlocks = {
  ...buildEmptyData(),
  reminders: [
    { id: 'a', studentId: '1', kind: 'fee', title: '', message: '', dueDate: '2026-07-01',
      status: 'cancelled', createdAt: '', sendCount: 0, history: [],
      blockedReason: 'overdue_15_days', daysSince: 28 },
    { id: 'b', studentId: '2', kind: 'fee', title: '', message: '', dueDate: '2026-07-10',
      status: 'cancelled', createdAt: '', sendCount: 0, history: [],
      blockedReason: 'overdue_15_days', daysSince: 19 },
    { id: 'c', studentId: '3', kind: 'fee', title: '', message: '', dueDate: '2026-07-20',
      status: 'cancelled', createdAt: '', sendCount: 0, history: [],
      blockedReason: 'missing_phone', daysSince: 9 },
    { id: 'd', studentId: '4', kind: 'fee', title: '', message: '', dueDate: '2026-07-29',
      status: 'pending', createdAt: '', sendCount: 0, history: [], daysSince: 0 },
  ],
} as unknown as AppData

eq('only the ones the ladder stopped on', needsACall(withBlocks).map((r) => r.id), ['a', 'b'])
eq('longest overdue first — those are the ones to ring',
   needsACall(withBlocks).map((r) => r.daysSince), [28, 19])
ok('a student merely due today is not on the call list',
   !needsACall(withBlocks).some((r) => r.id === 'd'))
ok('a missing phone is blocked but is not "stopped chasing"',
   !needsACall(withBlocks).some((r) => r.id === 'c'))
eq('every blocked reason is still reachable somewhere',
   blockedReminders(withBlocks).map((r) => r.id), ['a', 'b', 'c'])

/* ================= finding someone already on file =================
   Name AND number. A parent's phone carries all their children, so a
   number-only match would offer to bring back the wrong one. */
eq('phoneKey strips +91', phoneKey('+91 98765 43210'), '9876543210')
eq('phoneKey strips a leading 0', phoneKey('09876543210'), '9876543210')
eq('phoneKey of a short number stays short', phoneKey('12345'), '12345')

ok('sameName exact', sameName('Aarav Sharma', 'Aarav Sharma'))
ok('sameName ignores case and spacing', sameName('  aarav   SHARMA ', 'Aarav Sharma'))
ok('sameName finds the surname when only a first name was typed',
   sameName('Aarav Sharma', 'Aarav'))
ok('sameName works the other way round', sameName('Aarav', 'Aarav Sharma'))
ok('sameName does NOT match across a word boundary', !sameName('Ramesh', 'Ram'))
ok('sameName does not match a different child', !sameName('Diya Sharma', 'Aarav Sharma'))
ok('sameName rejects an empty name', !sameName('', 'Aarav'))

const roll = [
  { id: 'a', name: 'Aarav Sharma', phone: '9876543210', active: false },
  { id: 'b', name: 'Diya Sharma', phone: '9876543210', active: true },
  { id: 'c', name: 'Aarav Reddy', phone: '9000000001', active: true },
] as unknown as Parameters<typeof findExisting>[0]

eq('siblings: the number alone does not decide',
   findExisting(roll, 'Aarav', '9876543210').map((s) => s.id), ['a'])
eq('the other sibling on the same number',
   findExisting(roll, 'Diya', '9876543210').map((s) => s.id), ['b'])
eq('same name, different number is a different person',
   findExisting(roll, 'Aarav Sharma', '9000000001').map((s) => s.id), [])
eq('a genuinely new child on a parent number matches nobody',
   findExisting(roll, 'Kabir', '9876543210').map((s) => s.id), [])
eq('an incomplete number never matches',
   findExisting(roll, 'Aarav', '98765').map((s) => s.id), [])
eq('an empty name never matches',
   findExisting(roll, '   ', '9876543210').map((s) => s.id), [])
eq('+91 and the bare number are the same person',
   findExisting(roll, 'Aarav Sharma', '+91 98765 43210').map((s) => s.id), ['a'])

/* ================= report ================= */
console.log(`\n  PASS ${pass}   FAIL ${fails.length}\n`)
if (fails.length) {
  console.log('  FAILURES:')
  for (const f of fails) console.log('   ✗ ' + f)
  process.exit(1)
}
