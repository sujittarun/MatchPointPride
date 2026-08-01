/* Regression suite. Runs the real modules — no mocks, no framework.
   npm test  */
import {
  addDays, currentMonthKey, dateLabelFull, daysBetween, daysInMonth, dueLabel,
  clampDay, fromISO, inr, initials, isSunday, lastMonths, monthDates, monthLabel,
  dueDateFor, daysToFirstFee, FIRST_FEE_MIN_GAP, FIRST_FEE_WARN_DAYS, firstDueDate,
  nextDueDate, ordinal, renewalAfterFeeDayChange,
  shiftMonth, toISO, todayISO, uid, weekday,
} from '../src/lib/format'
import {
  collectionRate, dashboard, expenseByCategory, moneyByMonth, monthTotals,
  renderReminderMessage, reminderStats, revenueBySource, smsLink,
  staffLifetime, staffMonthStats, workingDays, whatsappLink, tenureDays, wasEnrolledIn, studentProfile,
  monthsPhrase, paidForMonth, unpaidMonthsFor,
  findExisting, phoneKey, sameName, needsACall, blockedReminders, awaitingFirstPayment,
} from '../src/lib/selectors'
import { assemble, toStudents, toTransactions } from '../src/lib/mapping'
import { needsNamedUpiApps, payLink, upiLink, upiQuery } from '../src/lib/upi'
import type { BatchRow, EnrollmentRow, MemberRow } from '../src/lib/cloud'
import { buildEmptyData, buildSeedData } from '../src/lib/seed'
import * as vault from '../src/lib/vault'
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

/* ========= voided payments are not revenue =========
   void_payment does not delete — it sets status='void' and leaves the
   row. toTransactions used to map every row to positive revenue
   without ever reading status, so deleting a payment took the money
   out of nothing: the row stayed in the ledger at full value and no
   total moved. ================================================= */
{
  const pay = (id: number, amount: number, status: string | null) => ({
    id, member_id: 1, enrollment_id: 7, type: 'Coaching', kind: 'renewal',
    amount, mode: 'UPI', on_date: '2026-07-10',
    period_from: '2026-07-01', period_to: '2026-08-01',
    status, ref: null, note: null, proof_path: null,
  })

  const mixed = toTransactions([pay(1, 1000, 'paid'), pay(2, 2000, 'void')], [])
  eq('voided row is not listed', mixed.length, 1)
  eq('voided amount is not revenue', monthTotals(mixed, '2026-07').revenue, 1000)
  eq('...nor in the bar chart', moneyByMonth(mixed, ['2026-07'])[0].revenue, 1000)
  eq('...nor in the donut', revenueBySource(mixed, '2026-07')[0].value, 1000)

  // The owner's only payment was entered in error and voided.
  const onlyVoid = toTransactions([pay(2, 2000, 'void')], [])
  eq('a voided-only ledger is empty', onlyVoid.length, 0)
  eq('a voided-only month collected nothing', monthTotals(onlyVoid, '2026-07').revenue, 0)

  // Unverified money is not collected money.
  eq('pending_verification is not revenue',
     toTransactions([pay(3, 5000, 'pending_verification')], []).length, 0)

  // An allow-list, because the two failures are not symmetric: telling
  // the owner a parent has paid when they have not is the one mistake
  // this app must not make.
  eq('an unknown future status is excluded',
     toTransactions([pay(5, 9999, 'refunded_by_bank')], []).length, 0)
  eq('a null status is an old row, not a reversed one',
     toTransactions([pay(4, 750, null)], []).length, 1)

  // A student whose only payment was voided must not read as settled.
  const d: AppData = JSON.parse(JSON.stringify(buildEmptyData()))
  const bt = d.batches[0]
  d.students.push({ id: '1', name: 'V', batchId: bt.id, phone: '9', joinedOn: '2026-01-01',
                    monthlyFee: 2000, feeDueDay: 1, active: true })
  d.transactions = toTransactions([pay(2, 2000, 'void')], [])
  const cr = collectionRate(d, '2026-07')
  eq('voided payment does not count as collected', cr.collected, 0)
  eq('voided payment does not count as paid', cr.paid, 0)
}

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

/* The `normalise()` migration block that stood here is gone with the
   function. It exercised folding retired attendance states, filling
   missing collections and clamping the fee day — on a localStorage
   document that `load()` no longer reads. The test was the only caller
   left, which is the definition of a test holding dead code upright. */

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
  /* The default message no longer greets by name — the owner asked for
     it crisp, and a WhatsApp fee note that opens by naming the academy
     reads fine without one. `{guardian}` still resolves, so a custom
     message can use it; that is what this asserts now. */
  ok('message: {guardian} still resolves when a template asks for it',
     renderReminderMessage(d, { ...rem, message: 'Hi {guardian}, {amount} for {student}.' })
       .includes('Reddy family'))
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

/* -------- a student nobody dated ---------------------------------------
   `enrollments.joined_on` and `members.joined` are both nullable, so
   mapping can hand back a spell with `from: ''`. An empty string sorts
   before every real date, which used to mean "on the roll since the
   beginning of time": 46,232 days of tenure — a hundred and twenty-six
   years — and twelve months of arrears invented out of a missing field.

   Not knowing when someone joined is not knowing they joined long ago.
   An undated spell now covers no month and contributes no tenure. ---- */
const undated = toStudents(
  [member({ joined: null })],
  [enrol({ joined_on: null, renewal_on: null })],
  { 5: 2000 },
)
eq('undated: still a student, not dropped', undated.length, 1)
eq('undated: the missing date is not invented', undated[0].joinedOn, '')
eq('undated: tenure is zero, not a century', tenureDays(undated[0], '2026-07-31'), 0)
eq('undated: covers no month at all', wasEnrolledIn(undated[0], '2026-07'), false)
eq('undated: and no month long ago either', wasEnrolledIn(undated[0], '2020-01'), false)

{
  const d: AppData = JSON.parse(JSON.stringify(buildEmptyData()))
  d.students = JSON.parse(JSON.stringify(undated))
  eq('undated: no arrears are fabricated', unpaidMonthsFor(d, d.students[0]), [])
  const prof = studentProfile(d, d.students[0].id)
  eq('undated: the ledger is one row, not a year of blanks', prof?.ledger.length, 1)
  eq('undated: nothing in it reads as enrolled', prof?.ledger.every((r) => !r.enrolled), true)
  ok('undated: the ledger is not marked truncated', prof?.ledgerTruncated === false)
}

/* A member dated but with a null renewal still bills on the 1st, which
   is the documented fallback rather than an accident. */
eq('null renewal_on falls back to the 1st',
   toStudents([member()], [enrol({ renewal_on: null })], { 5: 2000 })[0].feeDueDay, 1)

/* An enrolment with no date of its own falls back to the member's
   joining date before it falls back to nothing — so `''` only happens
   when BOTH are null. Worth pinning: it is why the undated case above
   has to null the member row too, and it is the reason a missing
   `joined_on` is usually harmless. */
const memberDated = toStudents(
  [member({ joined: '2025-06-01' })],
  [enrol({ joined_on: null })],
  { 5: 2000 },
)
eq('an enrolment with no date borrows the member\'s',
   memberDated[0].spells?.[0].from, '2025-06-01')
eq('...and that date is the joining date', memberDated[0].joinedOn, '2025-06-01')

/* One dated spell and one undated: the dated one must still count, and
   the undated one must not drag the history back to the epoch. */
const halfDated = toStudents(
  [member({ joined: null })],
  [
    enrol({ id: 10, joined_on: null, status: 'discontinued', discontinued_on: '2026-03-01' }),
    enrol({ id: 11, joined_on: '2026-06-01', status: 'active' }),
  ],
  { 5: 2000 },
)
eq('half-dated: both spells kept', halfDated[0].spells?.length, 2)
eq('half-dated: the undated one is the empty one', halfDated[0].spells?.[0].from, '')
eq('half-dated: the dated spell still covers its month',
   wasEnrolledIn(halfDated[0], '2026-07'), true)
eq('half-dated: ...but the undated one covers nothing before it',
   wasEnrolledIn(halfDated[0], '2020-01'), false)
eq('half-dated: tenure counts only the dated one',
   tenureDays(halfDated[0], '2026-07-01'), 30)

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

/* The first fee is the billing day on or after joining. Nothing else.

   It used to skip a month when that day fell close, silently, and every
   attempt to state the rule more precisely produced another wrong
   answer: joined the 31st on a fee day of the 29th billed in September;
   joined the 2nd on the 1st billed in October; joined the 15th on the
   15th billed in August. The arithmetic was never the problem — a
   decision the owner could not see was.

   The date is plain now and the SHEET warns when it is soon. Every one
   of the cases reported wrong is the obvious answer below. */
eq('joined the 31st, fee day the 29th', nextDueDate(29, '2026-07-31'), '2026-08-29')
eq('joined the 2nd, fee day the 1st',   nextDueDate(1,  '2026-08-02'), '2026-09-01')
eq('joined the 15th, fee day the 15th', nextDueDate(15, '2026-06-15'), '2026-06-15')
eq('joined the 29th, fee day the 1st',  nextDueDate(1,  '2026-07-29'), '2026-08-01')
eq('joined the 5th, fee day the 1st',   nextDueDate(1,  '2026-07-05'), '2026-08-01')
eq('short month still clamps',          nextDueDate(31, '2026-01-28'), '2026-01-31')

/* Two numbers, two jobs. Under FIRST_FEE_MIN_GAP the date MOVES and
   there is nothing to warn about; between the two it stays and is
   mentioned; past FIRST_FEE_WARN_DAYS it is silent.

   These two used to assert a warning on a 3-day and a same-day gap.
   Both now move to the next month instead, which is the point: the
   cases absurd enough to warn about are the ones worth fixing rather
   than announcing. */
eq('three days out moves, so it is quiet',
   daysToFirstFee(1, '2026-07-29') < FIRST_FEE_WARN_DAYS, false)
eq('...to the following month',  firstDueDate(1, '2026-07-29'), '2026-09-01')
eq('the same day moves too',
   daysToFirstFee(15, '2026-06-15') < FIRST_FEE_WARN_DAYS, false)
eq('...a clear month out',       firstDueDate(15, '2026-06-15'), '2026-07-15')
eq('twenty-nine days is quiet', daysToFirstFee(29, '2026-07-31') < FIRST_FEE_WARN_DAYS, false)
eq('thirty days is quiet',      daysToFirstFee(1,  '2026-08-02') < FIRST_FEE_WARN_DAYS, false)

/* -------- changing the billing day of a student who already exists ----
   Changing WHICH DAY they are billed must not change HOW MUCH they owe.
   Both bugs here were the same shape: a rule that is correct while the
   joining date is recent, applied to a student whose joining date is
   not. -------------------------------------------------------------- */
const feeDay = (a: Parameters<typeof renewalAfterFeeDayChange>[0]) => renewalAfterFeeDayChange(a)

eq('unpaid, joined days ago: new day, same month, min gap applied',
   feeDay({ feeDay: 1, currentRenewalOn: '2026-08-05', joinedOn: '2026-07-26', today: '2026-07-31' }),
   '2026-09-01')

// The 242-day backdate. Re-deriving from a joining date eight months old
// put them past +15, where the ladder stops — so the app silently gave up
// chasing exactly the student the owner had just opened to chase.
eq('unpaid, joined 8 months ago: does NOT backdate',
   feeDay({ feeDay: 1, currentRenewalOn: '2026-08-05', joinedOn: '2025-11-26', today: '2026-07-31' }),
   '2026-09-01')

eq('paid this spell: never earlier than what they already owe',
   feeDay({ feeDay: 1, currentRenewalOn: '2026-08-05', joinedOn: '2025-11-26', settledThisSpell: true }),
   '2026-09-01')

eq('new day precedes joining: next occurrence after joining',
   feeDay({ feeDay: 1, currentRenewalOn: '2026-08-05', joinedOn: '2026-08-02', today: '2026-07-31' }),
   '2026-09-01')

// A renewal that predates the enrolment is a contradiction, not a date.
ok('never lands before the joining date', (() => {
  for (let d = 1; d <= 31; d++) {
    const r = feeDay({ feeDay: d, currentRenewalOn: '2026-08-05', joinedOn: '2026-08-02' })
    if (r && r < '2026-08-02') return false
  }
  return true
})())

// Callers that build the input by hand pass a fee day and no current
// date. That must write nothing — it is how the Remove button used to
// rewrite renewal_on months into the past before discontinue_member ran.
eq('no current date: writes nothing',
   feeDay({ feeDay: 1, joinedOn: '2025-11-26' }), null)
eq('unchanged day: writes nothing',
   feeDay({ feeDay: 5, currentRenewalOn: '2026-08-05', joinedOn: '2025-11-26' }), null)
eq('no fee day: writes nothing',
   feeDay({ feeDay: 0, currentRenewalOn: '2026-08-05' }), null)

// February clamps 31 to 28, which is the day it already is — so moving a
// February renewal to "the 31st" is not a change and writes nothing.
eq('short month clamps to no-op',
   feeDay({ feeDay: 31, currentRenewalOn: '2026-02-28', joinedOn: '2026-01-10' }), null)

// Whatever it returns is a real date on the requested day, or the last
// day of a month too short to have one.
ok('always a valid date on the wanted day', (() => {
  for (let d = 1; d <= 31; d++) {
    for (const cur of ['2026-01-15', '2026-02-15', '2026-04-15', '2026-12-15']) {
      for (const settled of [true, false]) {
        const r = feeDay({ feeDay: d, currentRenewalOn: cur, joinedOn: '2025-01-01', settledThisSpell: settled })
        if (!r) continue
        if (!/^\d{4}-\d{2}-\d{2}$/.test(r)) return false
        const want = Math.min(d, daysInMonth(r.slice(0, 7)))
        if (Number(r.slice(8, 10)) !== want) return false
      }
    }
  }
  return true
})())
ok('the first fee lands on the fee day, clamped, and never before joining',
   ['2026-01-09','2026-02-20','2026-03-31','2026-07-29','2026-11-27'].every(function (j) {
     return [1, 5, 15, 28, 31].every(function (d) {
       const due = nextDueDate(d, j)
       return due >= j && Number(due.slice(8)) === Math.min(d, daysInMonth(due.slice(0, 7)))
     })
   }))

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

/* ================= coming back is joining again =================
   The rejoin path had drifted from the join path in two ways that only
   a full pass caught: money handed over on the way back was never
   recorded, and the seven-day skip was applied whether or not they
   paid — reintroducing, on the other path, the bug where a month's fee
   bought five weeks. Both must use the one rule above. */
ok('coming back uses the identical rule as joining',
   ['2026-01-09','2026-02-26','2026-07-29','2026-11-28'].every(function (d) {
     return [1, 5, 15, 28, 31].every(function (f) { return nextDueDate(f, d) >= d })
   }))

/* ================= registered, never paid =================
   The renewal ladder chases a DATE. A student who joins on the 2nd with
   a fee day of the 1st has no date yet, so the ladder is blind to them
   and they train a month while the app says nothing. This is what
   catches them, and it measures from the current spell — someone who
   paid for two years, left, and came back owing again must count. */
const S_ = (id: string, from: string, active = true) => ({
  id, name:'S' + id, batchId:'1', phone:'9000000000', joinedOn:from, monthlyFee:2000,
  feeDueDay:1, active, spells:[{ from }],
}) as unknown as AppData['students'][number]
const T_ = (studentId: string, date: string) => ({
  id:'t' + studentId + date, type:'revenue', source:'student_fee', studentId, date,
  amount:2000, category:'Coaching', createdAt:date,
}) as unknown as AppData['transactions'][number]

const roll2 = {
  ...buildEmptyData(),
  students: [
    S_('a', '2026-07-01'),                    // joined weeks ago, never paid
    S_('b', '2026-07-27'),                    // joined 2 days ago — too soon to nag
    S_('c', '2026-07-01'),                    // joined and paid
    S_('d', '2026-07-01', false),             // left; not our problem
  ],
  transactions: [T_('c', '2026-07-02')],
} as unknown as AppData

eq('caught: on the roll a fortnight, nothing received',
   awaitingFirstPayment(roll2, '2026-07-29').map((s) => s.id), ['a'])
ok('two days in is not yet a problem',
   !awaitingFirstPayment(roll2, '2026-07-29').some((s) => s.id === 'b'))
ok('someone who paid is not on the list',
   !awaitingFirstPayment(roll2, '2026-07-29').some((s) => s.id === 'c'))
ok('someone who left is not on the list',
   !awaitingFirstPayment(roll2, '2026-07-29').some((s) => s.id === 'd'))
eq('day five is the line', awaitingFirstPayment(roll2, '2026-08-01').map((s) => s.id).sort(), ['a', 'b'])

/* A rejoiner owes their first fee again. Measuring from their oldest
   payment instead of from this spell would let a long-standing student
   come back and never be asked. */
const returner = {
  ...buildEmptyData(),
  students: [{ ...S_('r', '2024-01-01'), spells:[{ from:'2024-01-01', to:'2025-06-01' }, { from:'2026-07-01' }] }],
  transactions: [T_('r', '2024-02-01'), T_('r', '2025-05-01')],
} as unknown as AppData
eq('a returning student owes again, however much they paid before',
   awaitingFirstPayment(returner, '2026-07-29').map((s) => s.id), ['r'])
eq('and drops off the moment they pay for THIS spell',
   awaitingFirstPayment({ ...returner, transactions:[...returner.transactions, T_('r', '2026-07-06')] } as AppData,
     '2026-07-29').length, 0)

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
/* -------- the first fee: move it, or mention it ----------------------
   The owner's own three cases, registering on 31 July 2026. Under the
   minimum gap the date MOVES; between the gap and the warning it stays
   and is MENTIONED; past the warning it is silent. ------------------ */
eq('fee day 1 on the 31st skips to September',  firstDueDate(1,  '2026-07-31'), '2026-09-01')
eq('fee day 5 on the 31st skips to September',  firstDueDate(5,  '2026-07-31'), '2026-09-05')
eq('fee day 15 on the 31st stays in August',    firstDueDate(15, '2026-07-31'), '2026-08-15')
eq('fee day 29 on the 31st stays in August',    firstDueDate(29, '2026-07-31'), '2026-08-29')

eq('...and 1 is silent, having been moved',  daysToFirstFee(1,  '2026-07-31') < FIRST_FEE_WARN_DAYS, false)
eq('...and 5 is silent, having been moved',  daysToFirstFee(5,  '2026-07-31') < FIRST_FEE_WARN_DAYS, false)
eq('...and 15 warns',                        daysToFirstFee(15, '2026-07-31') < FIRST_FEE_WARN_DAYS, true)
eq('...and 29 is silent at 29 days',         daysToFirstFee(29, '2026-07-31') < FIRST_FEE_WARN_DAYS, false)

// Exhaustive: never sooner than the minimum, never before joining, and
// never further out than one clear cycle.
ok('first fee always clears the minimum gap', (() => {
  for (let y = 2026; y <= 2027; y++)
    for (let mo = 1; mo <= 12; mo++) {
      const key = `${y}-${String(mo).padStart(2, '0')}`
      for (let d = 1; d <= daysInMonth(key); d++) {
        const joined = `${key}-${String(d).padStart(2, '0')}`
        for (let day = 1; day <= 31; day++) {
          const due = firstDueDate(day, joined)
          const gap = daysBetween(joined, due)
          if (gap < FIRST_FEE_MIN_GAP) return false
          if (due < joined) return false
          if (gap > 62) return false
          const want = Math.min(day, daysInMonth(due.slice(0, 7)))
          if (Number(due.slice(8, 10)) !== want) return false
        }
      }
    }
  return true
})())

// Registering and then editing to the same day must agree. Two screens
// that disagree about one student is the whole class of bug this had.
ok('editing to a day agrees with registering on it', (() => {
  const joined = '2026-07-31', today = '2026-07-31'
  for (let day = 1; day <= 28; day++) {
    const atRegistration = firstDueDate(day, joined)
    const seed = firstDueDate(day === 1 ? 2 : 1, joined)
    const edited = renewalAfterFeeDayChange({ feeDay: day, currentRenewalOn: seed, joinedOn: joined, today })
    if (edited && daysBetween(today, edited) < FIRST_FEE_MIN_GAP) return false
    if (edited && edited < joined) return false
    if (!atRegistration) return false
  }
  return true
})())

/* A student who starts next month. The gap that matters is the one
   after they JOIN, not the one after the owner happened to fill the
   form in — measuring from today alone let a September starter be
   billed two days into their first week because the form was filled in
   July, while registering the same student produced October. */
eq('a future starter: registering with the 5th',
   firstDueDate(5, '2026-09-03'), '2026-10-05')
eq('...and editing to the 5th lands in the same place',
   renewalAfterFeeDayChange({
     feeDay: 5, currentRenewalOn: '2026-09-03', joinedOn: '2026-09-03', today: '2026-07-31',
   }), '2026-10-05')

ok('every future start agrees, whichever screen set it', (() => {
  const today = '2026-07-31'
  for (let off = 1; off <= 90; off++) {
    const joined = addDays(today, off)
    for (let day = 1; day <= 28; day++) {
      const atRegistration = firstDueDate(day, joined)
      const seed = firstDueDate(day === 1 ? 2 : 1, joined)
      const edited = renewalAfterFeeDayChange({
        feeDay: day, currentRenewalOn: seed, joinedOn: joined, today,
      }) ?? seed
      if (daysBetween(joined, atRegistration) < FIRST_FEE_MIN_GAP) return false
      if (daysBetween(joined, edited) < FIRST_FEE_MIN_GAP) return false
      if (edited < joined) return false
    }
  }
  return true
})())


/* ================= the whole document, assembled ====================
   `assemble()` is what StoreProvider actually hands every page: ten
   arrays of database rows in, one AppData out. Nothing tested it, and
   it is the seam where a change to one row type becomes a blank screen.

   It reshapes and nothing more — every number in here was decided by
   Postgres. The assertions are about SHAPE and JOINS, because deciding
   is not this file's job. ------------------------------------------ */
{
  const batches: BatchRow[] = [
    { id: 5, centre_id: 1, code: 'K1', name: 'Kids 6-9 AM', sport: 'badminton',
      days: [1, 3, 5], start_time: '06:00:00', end_time: '07:00:00', capacity: 12, active: true },
    { id: 6, centre_id: 1, code: 'M1', name: 'Membership', sport: 'badminton',
      days: null, start_time: null, end_time: null, capacity: null, active: true },
  ]
  const members: MemberRow[] = [
    { id: 1, name: 'Aarav Sharma', phone: null, parent_name: 'Sunita',
      parent_phone: '+91 98765 43210', joined: '2026-01-05', status: 'active', notes: null },
    { id: 2, name: 'Diya Rao', phone: '9000000002', parent_name: null,
      parent_phone: null, joined: '2026-02-01', status: 'active', notes: 'left-handed' },
    // A member with no enrolment is not a student yet.
    { id: 3, name: 'Not Enrolled', phone: '9000000003', parent_name: null,
      parent_phone: null, joined: '2026-03-01', status: 'active', notes: null },
  ]
  const enrolments: EnrollmentRow[] = [
    { id: 10, member_id: 1, centre_id: 1, batch_id: 5, sport: 'badminton', plan_months: 1,
      custom_amount: null, joined_on: '2026-01-05', renewal_on: '2026-08-05',
      status: 'active', discontinued_on: null },
    { id: 11, member_id: 2, centre_id: 1, batch_id: 6, sport: 'badminton', plan_months: 1,
      custom_amount: 3500, joined_on: '2026-02-01', renewal_on: '2026-08-15',
      status: 'active', discontinued_on: null },
  ]
  const doc = assemble({
    batches,
    fees: { 5: 2000, 6: 4000 },
    upi: { '5': { upi: '7732077327@ybl', payee: 'Match Point Badminton Academy' } },
    members,
    enrolments,
    coaches: [{ id: 1, name: 'Coach R', role: 'coach', phone: '9000000009', active: true }],
    payments: [
      { id: 100, member_id: 1, enrollment_id: 10, type: 'revenue', kind: 'student_fee',
        amount: 2000, mode: 'upi', on_date: '2026-07-05', period_from: '2026-07-01',
        period_to: '2026-07-31', status: 'paid', ref: null, note: null, proof_path: null },
      // 'paid', not the 'confirmed' this fixture used to invent. There is no
      // check constraint on payments.status — it is free text defaulting to
      // 'paid' — so a made-up value parses, stores and reads back happily, and
      // a fixture using one tests nothing that can happen.
    ],
    expenses: [{ id: 200, category: 'rent', payee: 'Landlord', detail: null,
                 amount: 15000, mode: 'bank', on_date: '2026-07-01' }],
    // 'staff' is the kind cloud.ts writes; anything else is another
    // module's attendance and is not this app's to render.
    attendance: [
      { date: '2026-07-28', kind: 'staff', person_id: '1', present: true },
      { date: '2026-07-28', kind: 'student', person_id: '1', present: true },
    ],
    due: [
      { enrollment_id: 10, member_id: 1, member_name: 'Aarav Sharma', parent_name: 'Sunita',
        phone: '9876543210', centre: 'Pride', batch: 'Kids 6-9 AM', sport: 'badminton',
        due_date: '2026-08-05', days_since: 0, stage: 'due', amount: 2000, months: 1 },
    ],
  })

  eq('assemble: two students, the un-enrolled member skipped', doc.students.length, 2)
  eq('assemble: both batches kept', doc.batches.length, 2)
  eq('assemble: the batch fee came from resolve_fee, not arithmetic',
     doc.students.find((x) => x.name === 'Aarav Sharma')?.monthlyFee, 2000)
  eq('assemble: an enrolment override beats the batch fee',
     doc.students.find((x) => x.name === 'Diya Rao')?.monthlyFee, 3500)
  /* The parent's number wins over the student's, punctuation and all
     stripped. The +91 is KEPT rather than normalised away, which is
     safe in both directions: `phoneKey` matches on the last ten digits,
     and `whatsappLink` only prepends a country code to a number that
     does not already carry one. */
  const aarav = doc.students.find((x) => x.name === 'Aarav Sharma')!
  eq('assemble: the parent phone wins, digits only', aarav.phone, '919876543210')
  eq('assemble: ...and still matches the bare ten digits',
     phoneKey(aarav.phone), phoneKey('98765 43210'))
  ok('assemble: ...and does not get a second country code',
     whatsappLink('91', aarav.phone, 'hi').startsWith('https://wa.me/919876543210?'))
  eq('assemble: the student\'s own number is used when there is no parent',
     doc.students.find((x) => x.name === 'Diya Rao')?.phone, '9000000002')
  eq('assemble: the fee day comes off renewal_on',
     doc.students.find((x) => x.name === 'Aarav Sharma')?.feeDueDay, 5)
  eq('assemble: one reminder, from reminder_queue', doc.reminders.length, 1)
  eq('assemble: the reminder is joined to its student',
     doc.reminders[0].studentId, doc.students.find((x) => x.name === 'Aarav Sharma')?.id)
  eq('assemble: the amount is the queue\'s, untouched', doc.reminders[0].amount, 2000)
  eq('assemble: revenue and expense both land', doc.transactions.length, 2)
  eq('assemble: one coach', doc.staff.length, 1)
  eq('assemble: staff attendance carried, student attendance not', doc.attendance.length, 1)
  eq('assemble: ...and it reads as present', doc.attendance[0].status, 'present')
  ok('assemble: no settings document is produced',
     !Object.prototype.hasOwnProperty.call(doc, 'settings'))

  /* The empty tenant: a brand new academy, nothing entered yet. Every
     page has to render this without a crash — it is what the owner sees
     for the first minute after signing in. */
  const blank = assemble({
    batches: [], fees: {}, upi: {}, members: [], enrolments: [], coaches: [],
    payments: [], expenses: [], attendance: [], due: [],
  })
  eq('assemble: an empty tenant is empty, not undefined',
     [blank.students.length, blank.batches.length, blank.reminders.length,
      blank.staff.length, blank.transactions.length, blank.attendance.length],
     [0, 0, 0, 0, 0, 0])
  const blankDash = dashboard(blank)
  eq('assemble: dashboard survives an empty tenant', blankDash.activeStudents, 0)
  eq('assemble: ...with nothing overdue', blankDash.overdue, 0)
  finite('assemble: ...and a finite net', blankDash.net)
  eq('assemble: collection rate on nobody is 0, not NaN',
     collectionRate(blank, currentMonthKey()).rate, 0)
  finite('assemble: reminder stats on nothing', reminderStats(blank).responseRate)
}

/* ================= the session vault =================================

   These run for real: Node has WebCrypto, so `enrol`, `unlock` and
   `changePin` do the actual 600k-iteration PBKDF2 and the actual AES-GCM
   seal. Only `localStorage` is missing, and it is a Map with four
   methods, so shimming it tests the module rather than replacing it.

   This is the code that shipped a silent success — "PIN updated." over a
   vault that had not changed — so the assertions that matter are the
   negative ones: after any operation, does the PIN that should NOT work
   actually fail to open it? ------------------------------------------ */

/** The salt currently on disk, so a change of it can be asserted. */
function sealSalt(): string {
  return JSON.parse(localStorage.getItem('mpp.vault.v1') ?? '{}').salt ?? ''
}

function installLocalStorage(): void {
  const m = new Map<string, string>()
  ;(globalThis as any).localStorage = {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  }
}

async function vaultScenarios(): Promise<void> {
  installLocalStorage()

  const TOKEN = 'refresh-token-aaaa.bbbb.cccc'
  const EMAIL = 'staff@matchpointpride.in'

  /* --- the ordinary day: enrol once, unlock every morning ----------- */
  localStorage.clear()
  ok('vault: nothing enrolled to begin with', vault.isEnrolled() === false)
  eq('vault: no email before enrolment', vault.enrolledEmail(), null)

  await vault.enrol({ pin: '4417', refreshToken: TOKEN, email: EMAIL })
  ok('vault: enrolled', vault.isEnrolled() === true)
  eq('vault: remembers the account', vault.enrolledEmail(), EMAIL)
  eq('vault: remembers 4 digits', vault.pinLength(), 4)
  eq('vault: the right PIN returns the token', await vault.unlock('4417'), TOKEN)
  eq('vault: a wrong PIN returns null', await vault.unlock('4418'), null)
  eq('vault: a shorter PIN returns null', await vault.unlock('441'), null)
  eq('vault: an empty PIN returns null', await vault.unlock(''), null)

  /* The token is never stored in the clear. If it were, the PIN would be
     decoration on a plaintext credential sitting in localStorage. */
  ok('vault: the raw token is nowhere in storage',
     !(localStorage.getItem('mpp.vault.v1') ?? '').includes(TOKEN))

  /* --- rotation: Supabase spends the token on every use ------------- */
  const ROTATED = 'refresh-token-dddd.eeee.ffff'
  await vault.reseal('4417', ROTATED)
  eq('vault: reseal stores the new token', await vault.unlock('4417'), ROTATED)
  eq('vault: reseal keeps the same PIN', await vault.unlock('4418'), null)
  eq('vault: reseal keeps the length', vault.pinLength(), 4)
  eq('vault: reseal keeps the account', vault.enrolledEmail(), EMAIL)

  /* --- changing the PIN: the bug this file exists for --------------- */
  const saltBeforeChange = sealSalt()
  eq('changePin: the right current PIN succeeds', await vault.changePin('4417', '9091'), true)
  eq('changePin: the NEW pin opens the vault', await vault.unlock('9091'), ROTATED)
  // The assertion that would have caught the shipped bug. The old code
  // wrote a field nothing read, so the vault stayed sealed under 4417
  // and this would have returned the token.
  eq('changePin: the OLD pin no longer opens it', await vault.unlock('4417'), null)
  eq('changePin: the account is unchanged', vault.enrolledEmail(), EMAIL)
  // The other half of going through `enrol`: a new PIN gets a new salt,
  // so two vaults sealed with the same PIN never share a derived key.
  ok('changePin: draws a fresh salt', sealSalt() !== saltBeforeChange)

  /* --- a wrong current PIN must change nothing ---------------------- */
  eq('changePin: a wrong current PIN fails', await vault.changePin('0000', '1234'), false)
  eq('changePin: ...and the PIN it rejected does not work', await vault.unlock('1234'), null)
  eq('changePin: ...and the real PIN still does', await vault.unlock('9091'), ROTATED)

  /* --- 4 -> 6 digits, which the old screen could not do at all ------ */
  eq('changePin: 4 digits to 6 succeeds', await vault.changePin('9091', '246810'), true)
  eq('changePin: the keypad now draws 6 boxes', vault.pinLength(), 6)
  eq('changePin: the 6-digit PIN opens it', await vault.unlock('246810'), ROTATED)
  eq('changePin: the old 4-digit PIN does not', await vault.unlock('9091'), null)
  // Back down again, so the length genuinely tracks the PIN.
  eq('changePin: 6 digits back to 4', await vault.changePin('246810', '5566'), true)
  eq('changePin: the keypad draws 4 again', vault.pinLength(), 4)

  /* Each seal must use a fresh IV. Reusing one under the same key is the
     classic AES-GCM failure, and it is invisible from the outside — the
     app works perfectly either way. */
  const ivs = new Set<string>()
  for (let i = 0; i < 6; i++) {
    await vault.reseal('5566', `token-${i}`)
    ivs.add(JSON.parse(localStorage.getItem('mpp.vault.v1')!).iv)
  }
  eq('vault: every reseal draws a fresh IV', ivs.size, 6)

  const salts = new Set<string>()
  for (let i = 0; i < 4; i++) {
    localStorage.clear()
    await vault.enrol({ pin: '4417', refreshToken: TOKEN, email: EMAIL })
    salts.add(JSON.parse(localStorage.getItem('mpp.vault.v1')!).salt)
  }
  eq('vault: every enrolment draws a fresh salt', salts.size, 4)

  /* --- nothing enrolled: every path must decline, not throw --------- */
  localStorage.clear()
  eq('vault: unlock with no vault is null', await vault.unlock('4417'), null)
  eq('vault: changePin with no vault is false', await vault.changePin('4417', '9091'), false)
  ok('vault: reseal with no vault is a no-op', await vault.reseal('4417', TOKEN) === undefined)
  ok('vault: still not enrolled', vault.isEnrolled() === false)
  eq('vault: pinLength falls back to 4', vault.pinLength(), 4)

  /* --- forget(), which the attempt ladder calls past the cap -------- */
  await vault.enrol({ pin: '4417', refreshToken: TOKEN, email: EMAIL })
  vault.forget()
  ok('vault: forget un-enrols', vault.isEnrolled() === false)
  eq('vault: forget leaves nothing to unlock', await vault.unlock('4417'), null)

  /* --- corrupt storage must deny, not explode ---------------------- */
  localStorage.setItem('mpp.vault.v1', 'not json at all')
  ok('vault: unreadable vault reads as not enrolled', vault.isEnrolled() === false)
  eq('vault: unreadable vault does not unlock', await vault.unlock('4417'), null)

  localStorage.setItem('mpp.vault.v1', JSON.stringify({ v: 1, len: 4, salt: 'x', iv: 'y', blob: '', email: EMAIL }))
  ok('vault: an empty blob reads as not enrolled', vault.isEnrolled() === false)

  await vault.enrol({ pin: '4417', refreshToken: TOKEN, email: EMAIL })
  const good = JSON.parse(localStorage.getItem('mpp.vault.v1')!)
  localStorage.setItem('mpp.vault.v1', JSON.stringify({ ...good, blob: good.blob.slice(0, -4) + 'AAAA' }))
  eq('vault: a tampered blob fails the tag check', await vault.unlock('4417'), null)
  eq('vault: ...and changePin refuses it too', await vault.changePin('4417', '9091'), false)
}

/* ================= report ================= */
function report(): void {
  console.log(`\n  PASS ${pass}   FAIL ${fails.length}\n`)
  if (fails.length) {
    console.log('  FAILURES:')
    for (const f of fails) console.log('   ✗ ' + f)
    process.exit(1)
  }
}

/* ================= UPI links and the pay link =================
   The payment page computes nothing, so everything worth asserting is
   in how the link is FORMED and whether it survives the trip through
   WhatsApp and back. ========================================= */
{
  const d = { amount: 2200, student: 'Aadhya Raju', upi: '7732077327@ybl',
              payee: 'Match Point Badminton Academy', months: 'August' }

  const q = upiQuery(d)
  ok('upiQuery: payee address', q.includes('pa=7732077327%40ybl'))
  ok('upiQuery: payee name', q.includes('pn=Match%20Point%20Badminton%20Academy'))
  ok('upiQuery: amount to two places', q.includes('am=2200.00'))
  ok('upiQuery: currency', q.includes('cu=INR'))
  ok('upiQuery: note names the month', decodeURIComponent(q).includes('August'))

  // A UPI intent carrying an explicit zero is rejected by some apps and
  // silently prefilled as zero by others. Omit it and let them ask.
  ok('upiQuery: no am= when the amount is unknown',
     !upiQuery({ ...d, amount: 0 }).includes('am='))

  // Android resolves upi://; iOS does not register it at all, which is
  // why the named schemes exist.
  // startsWith, not a slice of a hand-counted length — the first version
  // of this asserted slice(0,15) against a 14-character scheme and failed
  // on the test rather than the code.
  ok('scheme: any',     upiLink('any', d).startsWith('upi://pay?'))
  ok('scheme: phonepe', upiLink('phonepe', d).startsWith('phonepe://pay?'))
  ok('scheme: gpay',    upiLink('gpay', d).startsWith('gpay://upi/pay?'))
  ok('scheme: paytm',   upiLink('paytm', d).startsWith('paytmmp://pay?'))
  ok('scheme: bhim',    upiLink('bhim', d).startsWith('bhim://upi/pay?'))

  // Apple hardware needs named apps. iPadOS reports itself as a Mac, so
  // the touch-point pair is the only way to catch an iPad.
  ok('iPhone needs named apps',
     needsNamedUpiApps({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', platform: 'iPhone', maxTouchPoints: 5 }))
  ok('iPad reporting as MacIntel needs named apps',
     needsNamedUpiApps({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 }))
  ok('a real Mac does not',
     !needsNamedUpiApps({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 0 }))
  ok('Android does not',
     !needsNamedUpiApps({ userAgent: 'Mozilla/5.0 (Linux; Android 14)', platform: 'Linux armv8l', maxTouchPoints: 5 }))

  // The link leaves the device, so it must be absolute — a relative one
  // built from BASE_URL would only resolve on the phone that sent it.
  const link = payLink(d)
  ok('payLink is absolute', link.startsWith('https://'))
  ok('payLink hits the pay route', link.includes('/#/pay?'))

  // Round trip: what the reminder writes is what the page reads.
  const parsed = new URLSearchParams(link.slice(link.indexOf('?') + 1))
  eq('round trip: amount', parsed.get('a'), '2200')
  eq('round trip: student', parsed.get('n'), 'Aadhya Raju')
  eq('round trip: upi', parsed.get('u'), '7732077327@ybl')
  eq('round trip: payee', parsed.get('p'), 'Match Point Badminton Academy')
  eq('round trip: months', parsed.get('m'), 'August')

  eq('payLink omits a zero amount', new URLSearchParams(
       payLink({ ...d, amount: 0 }).split('?')[1]).get('a'), null)
}

/* The synchronous assertions above have already run. The vault is async
   because WebCrypto is, so the report waits for it. */
vaultScenarios().then(report, (err) => {
  console.error('\n  vault scenarios threw:', err)
  process.exit(1)
})
