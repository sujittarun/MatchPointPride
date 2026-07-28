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

export interface Student {
  id: string
  name: string
  batchId: string
  /** Digits only, no country code — used to build the WhatsApp link. */
  phone: string
  guardian?: string
  joinedOn: string
  monthlyFee: number
  /** Day of month the fee falls due (1-28). */
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
  dueDate: string
  amount?: number
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
  /** YYYY-MM-DD */
  date: string
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

export interface Settings {
  academyName: string
  /** Hero headline, split so the second line can carry the accent colour. */
  heroLine1: string
  heroLine2: string
  heroSub: string
  /** The one place coaching credentials are stated, in the academy's voice. */
  coachingNote: string
  /** Used for the dashboard greeting, not shown on the public page. */
  ownerName: string
  location: string
  /** Two facts shown under the hero. */
  courts: string
  hours: string
  /** Drives the public "enquire on WhatsApp" button; hidden when blank. */
  phone: string
  email: string
  established: string
  /** Client-side gate only — see README § Security. */
  passcode: string
  countryCode: string
  reminderTemplate: string
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
