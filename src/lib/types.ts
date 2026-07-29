/* Domain model for Match Point Pride. Everything is stored as one
   JSON document in localStorage — see storage.ts. */

export type BatchKind = 'kids' | 'professional' | 'membership'

export interface Batch {
  id: string
  name: string
  kind: BatchKind
  /** Optional — e.g. "4:30 PM – 6:00 PM". Batches can exist without a slot. */
  slot?: string
  /** Optional day codes: Mon, Tue, … */
  days?: string[]
  coachId?: string
  /** Default monthly fee suggested when adding a student to this batch. */
  fee: number
  capacity?: number
  /** Index 1-6 into the validated categorical series palette. */
  colorSlot: number
  note?: string
  createdAt: string
}

/** One stretch of time a student was training. */
export interface Spell {
  /** YYYY-MM-DD they joined, or rejoined. */
  from: string
  /** YYYY-MM-DD they stopped. Absent while they are still training. */
  to?: string
}

export interface Student {
  id: string
  name: string
  batchId: string
  /**
   * Every period they have been with the academy, oldest first. Someone who
   * left and came back has two, so tenure skips the gap instead of counting
   * it. Always at least one entry after `normalise`.
   */
  spells?: Spell[]
  /** Digits only, no country code — used to build the WhatsApp link. */
  phone: string
  guardian?: string
  joinedOn: string
  monthlyFee: number
  /** Day of month the fee falls due (1-31; short months clamp to their last day). */
  feeDueDay: number
  active: boolean
  note?: string
}

export type ReminderKind = 'fee' | 'renewal' | 'attendance' | 'custom'
export type ReminderStatus = 'pending' | 'sent' | 'paid' | 'cancelled'
export type ReminderChannel = 'whatsapp' | 'sms' | 'call'

export interface ReminderEvent {
  at: string
  action: 'created' | 'sent' | 'resent' | 'paid' | 'cancelled' | 'reopened'
  channel?: ReminderChannel
  note?: string
}

export interface Reminder {
  id: string
  studentId: string
  kind: ReminderKind
  title: string
  message: string
  /** Oldest unpaid month's due date, so the longest overdue sorts first. */
  dueDate: string
  amount?: number
  /**
   * Unpaid months this fee reminder covers (YYYY-MM, oldest first). A
   * student behind by two months gets ONE reminder naming both, not two
   * separate chases.
   */
  months?: string[]
  status: ReminderStatus
  createdAt: string
  lastSentAt?: string
  sendCount: number
  history: ReminderEvent[]
}

export interface Staff {
  id: string
  name: string
  role: string
  phone?: string
  joinedOn: string
  monthlySalary?: number
  active: boolean
}

/** Deliberately just two states — the academy marks a day worked or not. */
export type AttendanceStatus = 'present' | 'absent'

export interface AttendanceRecord {
  /** `${staffId}__${date}` — one record per staff per day. */
  id: string
  staffId: string
  /** YYYY-MM-DD */
  date: string
  status: AttendanceStatus
  note?: string
}

export type TxnType = 'revenue' | 'expense'
export type RevenueSource = 'student_fee' | 'court_booking' | 'membership' | 'other'
export type BookingMode = 'individual' | 'daily' | 'monthly'

export const EXPENSE_CATEGORIES = [
  'Rent',
  'Salaries',
  'Shuttles & Equipment',
  'Court Maintenance',
  'Electricity & Water',
  'Marketing',
  'Tournament',
  'Other',
] as const

export interface Transaction {
  id: string
  type: TxnType
  /** YYYY-MM-DD — when the money actually moved. */
  date: string
  /**
   * For a student fee, the month the payment is *for* (YYYY-MM), which is
   * not always the month it arrived in — someone can clear June's fee in
   * July. Cash-flow reporting uses `date`; "has June been paid?" uses this.
   * Older records without it fall back to the month of `date`.
   */
  forMonth?: string
  amount: number
  /** Expense category, or a revenue label. */
  category: string
  source?: RevenueSource
  bookingMode?: BookingMode
  studentId?: string
  batchId?: string
  note?: string
  createdAt: string
}

/* Everything else about the academy is fixed copy — see lib/academy.ts.
   The only thing worth changing from a phone is the PIN. */
export interface Settings {
  /** Client-side gate only — see README § Security. */
  passcode: string
}

export interface AppData {
  version: number
  settings: Settings
  batches: Batch[]
  students: Student[]
  reminders: Reminder[]
  staff: Staff[]
  attendance: AttendanceRecord[]
  transactions: Transaction[]
}
