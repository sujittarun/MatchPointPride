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
import {
  addDays,
  dueDateFor,
  isSunday,
  lastMonths,
  monthDates,
  todayISO,
  uid,
} from './format'

/* Deterministic PRNG so the demo dataset looks identical on every
   first load (and so charts are stable while eyeballing the UI). */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const KID_NAMES = [
  'Aarav Reddy', 'Diya Sharma', 'Vihaan Rao', 'Ananya Kumar', 'Arjun Nair',
  'Ishita Patel', 'Rohan Verma', 'Saanvi Iyer', 'Kabir Menon', 'Myra Gupta',
  'Advik Chowdary', 'Anika Bose', 'Reyansh Joshi', 'Kiara Pillai', 'Neel Shetty',
  'Aadhya Raju', 'Vivaan Desai', 'Tara Krishnan', 'Shaurya Malhotra', 'Riya Naidu',
  'Dhruv Prasad', 'Meera Salian', 'Yuvan Hegde', 'Nitara Varma', 'Aryan Goud',
  'Pari Sinha', 'Krish Bhatia', 'Zara Qureshi', 'Ved Kulkarni', 'Amaira Jain',
]

const PRO_NAMES = [
  'Sai Charan', 'Harini Rao', 'Nikhil Teja', 'Sneha Reddy', 'Karthik M',
  'Pooja Ravi', 'Abhinav S',
]

const MEMBER_NAMES = [
  'Ramesh Babu', 'Lakshmi Devi', 'Suresh Kumar', 'Fatima Begum', 'Prakash Rao',
  'Anil Varma', 'Deepa Menon', 'Vinod Chandra', 'Sunita Agarwal', 'Mahesh Yadav',
  'Rajiv Khanna', 'Geetha Rani',
]

const STAFF_SEED: Array<Omit<Staff, 'id'>> = [
  { name: 'Venu', role: 'Head Coach', joinedOn: '2011-06-01', monthlySalary: 0, active: true, phone: '' },
  { name: 'Srikanth B', role: 'Assistant Coach', joinedOn: '2019-04-15', monthlySalary: 24000, active: true, phone: '' },
  { name: 'Pavani R', role: 'Junior Coach', joinedOn: '2022-01-10', monthlySalary: 18000, active: true, phone: '' },
  { name: 'Ramu', role: 'Court Maintenance', joinedOn: '2018-08-01', monthlySalary: 12000, active: true, phone: '' },
  { name: 'Kavitha', role: 'Front Desk', joinedOn: '2023-03-01', monthlySalary: 15000, active: true, phone: '' },
]

function makeBatches(): Batch[] {
  const now = new Date().toISOString()
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  const all = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return [
    {
      id: 'batch_k1', name: 'Kids Batch A', kind: 'kids', slot: '4:30 PM – 5:30 PM',
      days: weekdays, fee: 2000, capacity: 12, colorSlot: 1, createdAt: now,
      upiId: 'matchpointkids@ybl', upiName: 'Match Point Pride',
      note: 'Beginners, ages 6–9.',
    },
    {
      id: 'batch_k2', name: 'Kids Batch B', kind: 'kids', slot: '5:30 PM – 6:30 PM',
      days: weekdays, fee: 2000, capacity: 12, colorSlot: 2, createdAt: now,
      upiId: 'matchpointkids@ybl', upiName: 'Match Point Pride',
      note: 'Intermediate, ages 9–12.',
    },
    {
      id: 'batch_k3', name: 'Kids Batch C', kind: 'kids', slot: '6:30 PM – 7:30 PM',
      days: weekdays, fee: 2200, capacity: 12, colorSlot: 3, createdAt: now,
      upiId: 'matchpointkids@ybl', upiName: 'Match Point Pride',
      note: 'Advanced juniors.',
    },
    {
      id: 'batch_k4', name: 'Kids Batch D', kind: 'kids', slot: '6:30 AM – 7:30 AM',
      days: all, fee: 2200, capacity: 12, colorSlot: 4, createdAt: now,
      upiId: 'matchpointkids@ybl', upiName: 'Match Point Pride',
      note: 'Morning batch.',
    },
    {
      id: 'batch_pro', name: 'Professional Squad', kind: 'professional', slot: '5:30 AM – 8:00 AM',
      days: all, fee: 6000, capacity: 10, colorSlot: 5, createdAt: now,
      upiId: 'mppro@okaxis', upiName: 'MPP Academy',
      note: 'Tournament players. Fitness + court work.',
    },
    {
      id: 'batch_mem', name: 'Membership', kind: 'membership', fee: 1500,
      capacity: 40, colorSlot: 6, createdAt: now,
      upiId: 'mppcourts@okhdfcbank', upiName: 'MPP Courts',
      note: 'Open play. No fixed slot — members book courts as needed.',
    },
  ]
}

function makeStudents(batches: Batch[], rand: () => number): Student[] {
  const students: Student[] = []
  const today = todayISO()
  const push = (name: string, batch: Batch, i: number) => {
    students.push({
      id: uid('stu'),
      name,
      batchId: batch.id,
      phone: `9${String(400000000 + Math.floor(rand() * 99999999)).slice(0, 9)}`,
      guardian: batch.kind === 'kids' ? `${name.split(' ')[1] ?? name} family` : undefined,
      joinedOn: addDays(today, -Math.floor(rand() * 160) - 25),
      monthlyFee: batch.fee,
      feeDueDay: [1, 5, 10, 15][i % 4],
      active: rand() > 0.06,
    })
  }

  const kidBatches = batches.filter((b) => b.kind === 'kids')
  KID_NAMES.forEach((n, i) => push(n, kidBatches[i % kidBatches.length], i))

  const pro = batches.find((b) => b.kind === 'professional')!
  PRO_NAMES.forEach((n, i) => push(n, pro, i))

  const mem = batches.find((b) => b.kind === 'membership')!
  MEMBER_NAMES.forEach((n, i) => push(n, mem, i))

  return students
}

function makeStaff(): Staff[] {
  return STAFF_SEED.map((s) => ({ ...s, id: uid('stf') }))
}

/* 6 months of attendance. Sundays are off (no record). Each staff
   member gets their own reliability so the consistency chart has
   something real to say. */
function makeAttendance(staff: Staff[], rand: () => number): AttendanceRecord[] {
  const out: AttendanceRecord[] = []
  const months = lastMonths(6)
  const today = todayISO()
  const reliability: Record<string, number> = {}
  staff.forEach((s, i) => {
    reliability[s.id] = [0.985, 0.94, 0.9, 0.86, 0.96][i % 5]
  })

  for (const m of months) {
    for (const date of monthDates(m)) {
      if (date > today) continue
      if (isSunday(date)) continue
      for (const s of staff) {
        const status: AttendanceStatus = rand() < reliability[s.id] ? 'present' : 'absent'
        out.push({ id: `${s.id}__${date}`, staffId: s.id, date, status })
      }
    }
  }
  return out
}

function makeTransactions(
  students: Student[],
  batches: Batch[],
  staff: Staff[],
  rand: () => number,
): Transaction[] {
  const out: Transaction[] = []
  const months = lastMonths(6)
  const today = todayISO()
  const now = new Date().toISOString()

  /* Most students are up to date; a handful are genuinely behind by one
     or two months, so the arrears handling has something real to show. */
  const behind = new Map<string, number>()
  for (const s of students) {
    const r = rand()
    behind.set(s.id, r > 0.94 ? 2 : r > 0.86 ? 1 : 0)
  }

  for (const [mi, m] of months.entries()) {
    // --- student fees ---
    for (const s of students) {
      if (!s.active) continue
      // nobody pays for a month before they joined
      if (m < s.joinedOn.slice(0, 7)) continue
      // the last `owed` months are the ones they haven't settled
      if (mi >= months.length - (behind.get(s.id) ?? 0)) continue
      const date = dueDateFor(m, s.feeDueDay + Math.floor(rand() * 6))
      if (date > today) continue
      const batch = batches.find((b) => b.id === s.batchId)
      out.push({
        id: uid('txn'), type: 'revenue', date, forMonth: m, amount: s.monthlyFee,
        category: 'Student Fee', source: 'student_fee',
        studentId: s.id, batchId: s.batchId,
        note: batch ? batch.name : undefined, createdAt: now,
      })
    }

    // --- court bookings: a bulk daily figure most days ---
    for (const date of monthDates(m)) {
      if (date > today) continue
      if (rand() > 0.78) continue
      out.push({
        id: uid('txn'), type: 'revenue', date,
        amount: 500 * (3 + Math.floor(rand() * 8)),
        category: 'Court Booking', source: 'court_booking',
        bookingMode: 'daily', note: 'Hourly court bookings',
        createdAt: now,
      })
    }

    // --- expenses ---
    const fixed: Array<[string, number]> = [
      ['Rent', 38000],
      ['Electricity & Water', 8000 + Math.floor(rand() * 4000)],
      ['Shuttles & Equipment', 12000 + Math.floor(rand() * 9000)],
      ['Court Maintenance', 3000 + Math.floor(rand() * 5000)],
    ]
    for (const [cat, amt] of fixed) {
      const date = `${m}-0${1 + Math.floor(rand() * 5)}`
      if (date > today) continue
      out.push({
        id: uid('txn'), type: 'expense', date, amount: amt,
        category: cat, createdAt: now,
      })
    }

    const salaryDate = `${m}-05`
    if (salaryDate <= today) {
      const total = staff.reduce((a, s) => a + (s.monthlySalary ?? 0), 0)
      if (total > 0) {
        out.push({
          id: uid('txn'), type: 'expense', date: salaryDate, amount: total,
          category: 'Salaries', note: 'Monthly staff salaries', createdAt: now,
        })
      }
    }

    if (rand() > 0.6) {
      const date = `${m}-${String(10 + Math.floor(rand() * 15)).padStart(2, '0')}`
      if (date <= today) {
        out.push({
          id: uid('txn'), type: 'expense', date,
          amount: 4000 + Math.floor(rand() * 9000),
          category: rand() > 0.5 ? 'Marketing' : 'Tournament', createdAt: now,
        })
      }
    }
  }

  return out.sort((a, b) => (a.date < b.date ? 1 : -1))
}

function makeReminders(
  students: Student[],
  batches: Batch[],
  rand: () => number,
): Reminder[] {
  const out: Reminder[] = []

  /* --- history: past months where a reminder was sent and then paid,
     so the tracking chart has something real to show. --- */
  const active = students.filter((s) => s.active)
  for (const m of lastMonths(6).slice(0, -1)) {
    for (const s of active) {
      if (rand() > 0.2) continue
      const batch = batches.find((b) => b.id === s.batchId)
      const due = dueDateFor(m, s.feeDueDay)
      const dueDay = due.slice(8)
      const sentDay = dueDateFor(m, s.feeDueDay + 2).slice(8)
      const sentAt = `${m}-${sentDay}T10:30:00.000Z`
      const resent = rand() > 0.72
      const paidDay = dueDateFor(m, s.feeDueDay + (resent ? 8 : 4)).slice(8)
      const paidAt = `${m}-${paidDay}T17:15:00.000Z`

      const history: Reminder['history'] = [
        { at: `${m}-${dueDay}T09:00:00.000Z`, action: 'created' },
        { at: sentAt, action: 'sent', channel: 'whatsapp' },
      ]
      if (resent) {
        const reDay = dueDateFor(m, s.feeDueDay + 6).slice(8)
        history.push({ at: `${m}-${reDay}T11:00:00.000Z`, action: 'resent', channel: 'whatsapp' })
      }
      // Not every reminder lands — some get written off.
      const lapsed = rand() > 0.87
      history.push(
        lapsed
          ? { at: paidAt, action: 'cancelled', note: 'Student left the batch' }
          : { at: paidAt, action: 'paid' },
      )

      out.push({
        id: uid('rem'),
        studentId: s.id,
        kind: 'fee',
        title: `Monthly fee — ${batch?.name ?? 'Batch'}`,
        message: '',
        dueDate: due,
        amount: s.monthlyFee,
        months: [m],
        status: lapsed ? 'cancelled' : 'paid',
        createdAt: `${m}-${dueDay}T09:00:00.000Z`,
        lastSentAt: sentAt,
        sendCount: resent ? 2 : 1,
        history,
      })
    }
  }

  /* Open reminders are not seeded — the app derives them from unpaid
     months as soon as it loads. */

  return out
}

export function buildSeedData(): AppData {
  const rand = rng(20260728)
  const batches = makeBatches()
  const students = makeStudents(batches, rand)
  const staff = makeStaff()
  const attendance = makeAttendance(staff, rand)
  const transactions = makeTransactions(students, batches, staff, rand)
  const reminders = makeReminders(students, batches, rand)

  return {
    version: 1,
    batches,
    students,
    reminders,
    staff,
    attendance,
    transactions,
  }
}

/** A clean slate: the six batches the academy actually runs, nothing else. */
export function buildEmptyData(): AppData {
  return {
    version: 1,
    batches: makeBatches(),
    students: [],
    reminders: [],
    staff: [{ ...STAFF_SEED[0], id: uid('stf') }],
    attendance: [],
    transactions: [],
  }
}
