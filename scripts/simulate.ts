/* End-to-end life-cycle simulation, run against the real app modules.
   Prints a readable timeline and asserts the numbers along the way. */
import {
  addDays, currentMonthKey, dateLabelFull, inr, isSunday, monthDates,
  monthLabel, shiftMonth, todayISO,
} from '../src/lib/format'
import {
  applyFeePlan, planFeeReminders, staffMonthStats, studentProfile,
  unpaidMonthsFor, monthsPhrase, renderReminderMessage, collectionRate,
} from '../src/lib/selectors'
import { buildEmptyData } from '../src/lib/seed'
import { normalise } from '../src/lib/store'
import type { AppData } from '../src/lib/types'

let pass = 0
const fails: string[] = []
const check = (name: string, cond: boolean, detail = '') => {
  if (cond) pass++
  else fails.push(`${name}${detail ? ` — ${detail}` : ''}`)
}
const eq = (name: string, a: unknown, b: unknown) =>
  check(name, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`)

const log = (s = '') => console.log(s)
const NOW = currentMonthKey()
const M = (n: number) => shiftMonth(NOW, n)

/* ================================================================
   Set the stage
   ================================================================ */
const d: AppData = normalise(JSON.parse(JSON.stringify(buildEmptyData())))
const kidsA = d.batches.find((b) => b.name === 'Kids Batch A')!
const kidsC = d.batches.find((b) => b.name === 'Kids Batch C')!
const coach = d.staff[0]

const JOIN = `${M(-4)}-05`
const LEFT = `${M(-2)}-30`
const REJOIN = `${M(0)}-01`

d.students.push({
  id: 'kid', name: 'Aarav Reddy', batchId: kidsA.id, phone: '9876543210',
  guardian: 'Reddy family', joinedOn: JOIN, spells: [{ from: JOIN }],
  monthlyFee: 2000, feeDueDay: 5, active: true,
})
const kid = () => d.students.find((s) => s.id === 'kid')!

log('═══ MATCH POINT PRIDE — LIFE-CYCLE SIMULATION ═══')
log(`today is ${dateLabelFull(todayISO())}`)
log()
log(`1. ${dateLabelFull(JOIN)} — Aarav Reddy joins ${kidsA.name}, ₹2,000/mo, fee due on the 5th.`)

/* ================================================================
   Staff attendance, marked daily
   ================================================================ */
const attMonth = M(-1)
let marked = 0
for (const day of monthDates(attMonth)) {
  if (isSunday(day) || day > todayISO()) continue
  // absent on two days, present otherwise
  const absent = day.endsWith('-11') || day.endsWith('-19')
  d.attendance.push({
    id: `${coach.id}__${day}`, staffId: coach.id, date: day,
    status: absent ? 'absent' : 'present',
  })
  marked++
}
const att = staffMonthStats(d, coach.id, attMonth)
log()
log(`2. ${monthLabel(attMonth)} — ${coach.name}'s attendance marked every working day.`)
log(`   ${att.present} present · ${att.absent} absent · consistency ${att.consistency.toFixed(0)}%`)
eq('attendance: every working day marked', att.marked, marked)
eq('attendance: two absences recorded', att.absent, 2)
check('attendance: Sundays excluded', att.marked < monthDates(attMonth).length)

/* ================================================================
   Month 1 + 2 — pays on time
   ================================================================ */
const pay = (forMonth: string, on: string) =>
  d.transactions.push({
    id: `t_${forMonth}`, type: 'revenue', date: on, forMonth, amount: 2000,
    category: 'Student Fee', source: 'student_fee', studentId: 'kid',
    batchId: kid().batchId, createdAt: on,
  })

pay(M(-4), `${M(-4)}-05`)
pay(M(-3), `${M(-3)}-04`)
log()
log(`3. Pays ${monthLabel(M(-4))} and ${monthLabel(M(-3))} on time.`)
eq('nothing owed after paying on time',
  unpaidMonthsFor(d, kid(), M(-3)), [])

/* ================================================================
   Month 3 — forgets. Reminder appears, but only once it is due.
   ================================================================ */
const missed = M(-2)
log()
log(`4. ${monthLabel(missed)} — forgets to pay.`)

// before the due day
const beforeDue = `${missed}-03`
let plan = planFeeReminders(d, missed)
applyFeePlan(d, plan)
const rem = () => d.reminders.find((r) => r.studentId === 'kid' && r.kind === 'fee')!
log(`   Reminder created automatically, dated ${dateLabelFull(rem().dueDate)}.`)
log(`   On ${dateLabelFull(beforeDue)} (before the due day) it is NOT in "Due now".`)
check('reminder exists before the due day', !!rem())
check('but is not yet "due"', !(rem().dueDate <= beforeDue))
eq('reminder is dated on the fee due day', rem().dueDate, `${missed}-05`)

// after the due day it becomes chaseable
const afterDue = `${missed}-08`
check('after the due day it shows in "Due now"', rem().dueDate <= afterDue)
log(`   On ${dateLabelFull(afterDue)} it becomes overdue and appears in "Due now".`)

// send twice
const send = (at: string) => {
  const r = rem()
  r.sendCount += 1
  r.lastSentAt = at
  r.status = 'sent'
  r.history.push({ at, action: r.sendCount === 1 ? 'sent' : 'resent', channel: 'whatsapp' })
}
send(`${missed}-08T10:00:00.000Z`)
log(`   WhatsApp sent: "${renderReminderMessage(d, rem())}"`)
send(`${missed}-15T10:00:00.000Z`)
log(`   No response — sent again on the 15th. Send count is now ${rem().sendCount}.`)
eq('two sends logged', rem().sendCount, 2)

// pays late
pay(missed, `${missed}-18`)
plan = planFeeReminders(d, missed)
applyFeePlan(d, plan)
log(`   Pays late on the 18th. Reminder closes itself.`)
eq('reminder closed once paid', rem().status, 'paid')
eq('nothing owed for that month now', unpaidMonthsFor(d, kid(), missed), [])

/* ================================================================
   Discontinues, then comes back a month later
   ================================================================ */
kid().active = false
kid().spells![0].to = LEFT
log()
log(`5. ${dateLabelFull(LEFT)} — discontinues after 3 months.`)
eq('an inactive student owes nothing', unpaidMonthsFor(d, kid(), M(-1)), [])
eq('and gets no reminder', planFeeReminders(d, M(-1)).create.length, 0)

log(`6. ${monthLabel(M(-1))} — away for a month. Not billed.`)

kid().active = true
kid().spells!.push({ from: REJOIN })
log(`7. ${dateLabelFull(REJOIN)} — rejoins.`)

plan = planFeeReminders(d, NOW)
applyFeePlan(d, plan)
const owed = unpaidMonthsFor(d, kid(), NOW)
log(`   Now owes: ${monthsPhrase(owed)} only — the month away is not a debt.`)
check('the month away is NOT owed', !owed.includes(M(-1)), owed.join(','))
eq('only the current month is owed', owed, [NOW])

/* ================================================================
   Move to another batch — nothing lost
   ================================================================ */
const beforeMove = studentProfile(d, 'kid')!
kid().batchId = kidsC.id
const afterMove = studentProfile(d, 'kid')!
log()
log(`8. Moved from ${kidsA.name} to ${kidsC.name}.`)
log(`   Payments kept: ${beforeMove.payments.length} → ${afterMove.payments.length}`)
log(`   Total paid kept: ${inr(beforeMove.totalPaid)} → ${inr(afterMove.totalPaid)}`)
eq('payments survive the move', afterMove.payments.length, beforeMove.payments.length)
eq('total paid survives the move', afterMove.totalPaid, beforeMove.totalPaid)
eq('reminders survive the move', afterMove.remindersSent, beforeMove.remindersSent)
eq('tenure survives the move', afterMove.tenureDays, beforeMove.tenureDays)
eq('now in the new batch', afterMove.batch!.name, kidsC.name)
check('old payments still record the batch they were earned in',
  d.transactions.filter((t) => t.studentId === 'kid').every((t) => t.batchId === kidsA.id))

/* ================================================================
   The profile the owner sees
   ================================================================ */
const p = studentProfile(d, 'kid')!
log()
log('═══ WHAT THE STUDENT PAGE SHOWS ═══')
log(`  With the academy : ${p.tenureDays} days across ${p.spells.length} spells`)
log(`  Total paid       : ${inr(p.totalPaid)} over ${p.payments.length} payments`)
log(`  Reminders sent   : ${p.remindersSent} (across ${p.remindersCount} reminder)`)
log(`  Currently owes   : ${inr(p.owed)} — ${monthsPhrase(p.unpaidMonths)}`)
log(`  Rejoined         : ${p.returned ? 'yes' : 'no'}`)
log()
log('  Month by month:')
for (const row of [...p.ledger].reverse()) {
  const state = !row.enrolled ? 'away' : row.paid ? `paid ${inr(row.amount)}` : 'UNPAID'
  log(`    ${monthLabel(row.month).padEnd(9)} ${state}`)
}

const gapDays = 30
eq('three payments total', p.payments.length, 3)
eq('total paid is 3 x fee', p.totalPaid, 6000)
eq('two spells recorded', p.spells.length, 2)
check('flagged as rejoined', p.returned)
check('tenure excludes the gap', p.tenureDays < Math.abs(
  Math.round((Date.parse(todayISO()) - Date.parse(JOIN)) / 86400000)) - gapDays + 5)
eq('reminders sent counted', p.remindersSent, 2)
eq('owes exactly one month', p.owed, 2000)

/* collection rate for the current month sees him as unpaid */
const cr = collectionRate(d, NOW)
eq('collection: he is the one active student and has not paid', [cr.paid, cr.total], [0, 1])

log()
log(`  PASS ${pass}   FAIL ${fails.length}`)
if (fails.length) {
  log('  FAILURES:')
  for (const f of fails) log('   ✗ ' + f)
  process.exit(1)
}
void addDays
