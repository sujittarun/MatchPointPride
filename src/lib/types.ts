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
  /** No fee rule prices this batch yet. */
  feePending?: boolean
  /**
   * Where this batch's fees are collected. Batches may share one UPI ID or
   * each have its own; the reminder message quotes whichever belongs to the
   * student's batch.
   */
  upiId?: string
  /** Name shown in the UPI app, quoted in the message so parents can check. */
  upiName?: string
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
   * it. Built by `mapping.ts` from the member's enrolment rows, so there is
   * always at least one entry for anyone the database returned.
   */
  spells?: Spell[]
  /** Digits only, no country code — used to build the WhatsApp link. */
  phone: string
  guardian?: string
  joinedOn: string
  monthlyFee: number
  /** No fee resolved anywhere in the chain — registered, price not settled. */
  feePending?: boolean
  /** Day of month the fee falls due (1-31; short months clamp to their last day). */
  feeDueDay: number
  /** The actual next due date, so a change to the day knows what it moves from. */
  renewalOn?: string
  active: boolean
  note?: string
  /**
   * Platform row ids. Present whenever the student came from Postgres,
   * which is always now — a write has to address the enrolment, and
   * looking it up by name would be a guess.
   */
  enrollmentId?: number
  memberId?: number
}

export type ReminderKind = 'fee' | 'renewal' | 'attendance' | 'custom'
export type ReminderStatus = 'pending' | 'sent' | 'paid' | 'cancelled'
export type ReminderChannel = 'whatsapp' | 'sms' | 'call'

/** Why the platform will not message this parent. From reminder_queue. */
export type BlockedReason =
  | 'missing_phone'
  | 'wrong_phone_number'
  | 'whatsapp_opted_out'
  | 'overdue_15_days'
  | 'fee_not_set'

export interface ReminderEvent {
  at: string
  action:
    | 'created'
    | 'sent'
    | 'resent'
    | 'paid'
    | 'cancelled'
    | 'reopened'
    | 'claimed'
    | 'proof'
  channel?: ReminderChannel
  note?: string
  /** Screenshot attached at this point in the timeline. */
  imageId?: string
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
   * Set when the platform will NOT message this parent. `overdue_15_days`
   * is the end of the ladder: automated chasing has stopped and a person
   * has to call. That is the one state nobody is told about unless the
   * app says so, which is why it is carried rather than collapsed.
   */
  blockedReason?: BlockedReason
  /** Days past the due date. Negative before it. */
  daysSince?: number
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
  /**
   * The parent says they have paid but no screenshot has arrived. Held open
   * deliberately: confirming without proof is how money goes missing.
   */
  awaitingProof?: boolean
  /** IndexedDB key of the payment screenshot, once one is attached. */
  proofImageId?: string
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
  /**
   * Joining fee, renewal, or a one-off. Straight from `payments.kind` —
   * the database already records which, and the Finance list was
   * throwing it away and showing every fee as the same anonymous
   * "Coaching".
   */
  feeKind?: 'renewal' | 'admission' | 'custom'
  note?: string
  /** Screenshot that evidences this payment, if one was supplied. */
  proofImageId?: string
  /** How the payment was confirmed when no screenshot arrived. */
  verifiedBy?: 'screenshot' | 'bank' | 'call' | 'cash'
  createdAt: string
}

/* There is no settings document.

   There used to be one, holding a single field: the PIN. It was never
   loaded from anywhere — every copy of it was the '1234' literal in
   seed.ts — and nothing that actually gates the app ever read it. The
   PIN is the key the session vault is encrypted with (see vault.ts),
   which is not data about the academy and does not belong in here.

   Everything else about the academy is fixed copy — see lib/academy.ts. */

export interface AppData {
  version: number
  batches: Batch[]
  students: Student[]
  reminders: Reminder[]
  staff: Staff[]
  attendance: AttendanceRecord[]
  transactions: Transaction[]
}
