/* Formatting + date helpers. All dates are handled as plain
   YYYY-MM-DD strings in local time — never as UTC Date objects —
   so a day never shifts across a timezone boundary. */

const RUPEE = '₹'

export function inr(n: number, opts: { compact?: boolean } = {}): string {
  const v = Math.round(n)
  if (opts.compact) {
    const a = Math.abs(v)
    if (a >= 1e7) return `${RUPEE}${trim(v / 1e7)}Cr`
    if (a >= 1e5) return `${RUPEE}${trim(v / 1e5)}L`
    if (a >= 1e3) return `${RUPEE}${trim(v / 1e3)}k`
  }
  return RUPEE + v.toLocaleString('en-IN')
}

function trim(n: number): string {
  return n.toFixed(n < 10 ? 1 : 0).replace(/\.0$/, '')
}

export function pct(n: number, digits = 0): string {
  if (!isFinite(n)) return '—'
  return `${n.toFixed(digits)}%`
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/* ---------------- dates ---------------- */

export function todayISO(): string {
  return toISO(new Date())
}

export function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Parse YYYY-MM-DD into a local-midnight Date. */
export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

export function currentMonthKey(): string {
  return todayISO().slice(0, 7)
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return `${MONTHS[(m ?? 1) - 1]} ${y}`
}

const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** "2026-06" → "June". Used in messages to parents, where "Jun" reads cheap. */
export function monthNameFull(key: string): string {
  const [, m] = key.split('-').map(Number)
  return MONTHS_FULL[(m ?? 1) - 1]
}

export function monthShort(key: string): string {
  const [, m] = key.split('-').map(Number)
  return MONTHS[(m ?? 1) - 1]
}

export function dateLabel(iso: string): string {
  const d = fromISO(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

export function dateLabelFull(iso: string): string {
  const d = fromISO(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function daysInMonth(key: string): number {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

/** Month keys ending at `endKey`, most recent last. */
export function lastMonths(n: number, endKey = currentMonthKey()): string[] {
  const [y, m] = endKey.split('-').map(Number)
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1)
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function addDays(iso: string, n: number): string {
  const d = fromISO(iso)
  d.setDate(d.getDate() + n)
  return toISO(d)
}

export function daysBetween(a: string, b: string): number {
  const ms = fromISO(b).getTime() - fromISO(a).getTime()
  return Math.round(ms / 86400000)
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function weekday(iso: string): string {
  return WEEKDAYS[fromISO(iso).getDay()]
}

export function isSunday(iso: string): boolean {
  return fromISO(iso).getDay() === 0
}

/** All YYYY-MM-DD dates in a month, in order. */
export function monthDates(key: string): string[] {
  const n = daysInMonth(key)
  return Array.from({ length: n }, (_, i) => `${key}-${String(i + 1).padStart(2, '0')}`)
}

/** Relative label for a due date: "3 days late", "Due today", "in 5 days". */
export function dueLabel(dueISO: string, today = todayISO()): string {
  const diff = daysBetween(today, dueISO)
  if (diff === 0) return 'Due today'
  if (diff === 1) return 'Due tomorrow'
  if (diff > 1) return `Due in ${diff} days`
  if (diff === -1) return '1 day overdue'
  return `${Math.abs(diff)} days overdue`
}

/* ---------------- numeric input guards ---------------- */

/** Largest amount a single entry may carry. Generous enough that no real
    academy figure hits it, tight enough to catch an extra typed digit. */
export const MAX_AMOUNT = 10_000_000 // ₹1 crore

/** Whole, non-negative number from free text. Blank/garbage becomes 0. */
export function nonNegative(v: string | number): number {
  const n = typeof v === 'number' ? v : Number(String(v).trim())
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.round(n))
}

/** Same, but 0 (or blank) means "not set". */
export function nonNegativeOrUndef(v: string | number): number | undefined {
  const n = nonNegative(v)
  return n > 0 ? n : undefined
}

/** 1 → "1st", 22 → "22nd", 13 → "13th". */
export function ordinal(n: number): string {
  const teens = n % 100
  if (teens >= 11 && teens <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

/**
 * A fee day as the owner enters it: 1–31. Months shorter than that are
 * handled when the date is actually built — see `dueDateFor` — rather than
 * by forbidding the 29th–31st, which are perfectly normal billing days.
 */
export function clampDay(v: string | number): number {
  const n = typeof v === 'number' ? v : Number(String(v).trim())
  if (!Number.isFinite(n)) return 1
  return Math.min(31, Math.max(1, Math.round(n)))
}

/**
 * Below this many days between joining and the first fee, the app says
 * so before you save.
 *
 * It used to SKIP a month instead, silently. That was a decision the
 * owner could not see, and it produced a run of answers that each
 * looked like a bug: a student joining on the 31st with a fee day of
 * the 29th billed in September; joining the 2nd on the 1st billed in
 * October. Every attempt to state the rule more precisely added another
 * branch and another wrong answer.
 *
 * Saying it out loud is both simpler and more honest. The date is now
 * always the fee day on or after joining — no hidden arithmetic — and
 * the owner is told when that is soon, which is the thing they actually
 * need to know: a parent who signed up on Tuesday may hear from us on
 * Friday.
 */
export const FIRST_FEE_WARN_DAYS = 20

/** How long after joining their first fee lands. */
export function daysToFirstFee(feeDay: number, joinedOn: string): number {
  return daysBetween(joinedOn, nextDueDate(feeDay, joinedOn))
}

/**
 * The next date a fee falls due: the billing day this month, or next
 * month if it has already gone by.
 *
 * `from` is the day billing STARTS — the day they joined or rejoined,
 * not today. Anchoring it to today instead is how a student brought
 * back on 15 June ended up with a renewal of 27 August: two and a half
 * months of training nobody was ever asked to pay for, and invisible,
 * because a renewal in the future never enters the chase ladder.
 *
 * Built from `dueDateFor` and plain string comparison, NOT from
 * `new Date(...).toISOString()`. That pattern looks harmless and is
 * wrong everywhere east of Greenwich: `new Date(y, m, d)` is local
 * midnight, and converting local midnight in IST to UTC lands at
 * 18:30 the PREVIOUS day, so every date it produced was a day early.
 * A student billed on the 1st was stored as due on the 31st of the
 * month before.
 */
export function nextDueDate(feeDay: number, from = todayISO()): string {
  const sameMonth = dueDateFor(from.slice(0, 7), feeDay)
  // On the day itself the fee is due that day, not a month later.
  return sameMonth >= from ? sameMonth : dueDateFor(shiftMonth(from.slice(0, 7), 1), feeDay)
}

/**
 * The date a fee actually falls due in a given month. A student billed on
 * the 31st is due on the 30th in April and the 28th in February — the same
 * way a monthly EMI or subscription behaves.
 */
export function dueDateFor(monthKey: string, feeDay: number): string {
  const last = daysInMonth(monthKey)
  const day = Math.min(clampDay(feeDay), last)
  return `${monthKey}-${String(day).padStart(2, '0')}`
}

/**
 * Where the renewal lands when the owner changes the billing DAY of a
 * student who already exists. `null` means write nothing.
 *
 * Changing the day must not change how much they owe. So the cycle they
 * are in stays the cycle they are in, and only the day inside it moves.
 *
 * This is the one piece of billing-date arithmetic still on this side of
 * the wire, and it is here rather than in `cloud.ts` so it can be tested
 * without a session. It exists at all only because `enrollments` has no
 * `fee_day` column: the billing day is stored implicitly, as the
 * day-of-month of `renewal_on`, so the only way to change it is to
 * rewrite the date. Give the column a home server-side and this function
 * and its caller both go away — along with the separate drift where
 * `record_fee_payment` rolls a 31st forward to the 28th in February and
 * then leaves it on the 28th for ever.
 */
export function renewalAfterFeeDayChange(a: {
  feeDay: number
  currentRenewalOn?: string
  joinedOn?: string
  /** Has any money arrived this spell? Decides which of the two rules applies. */
  settledThisSpell?: boolean
}): string | null {
  /* No current date means there is nothing to compare against, so "did
     this change?" cannot be answered and any value written is a guess.
     The Remove button proved it: callers that build this by hand pass a
     fee day because the type demands one, and no current date. */
  if (!a.feeDay || !a.currentRenewalOn) return null
  const currentDay = Number(a.currentRenewalOn.slice(8, 10))
  if (!Number.isFinite(currentDay) || currentDay === a.feeDay) return null

  let moved: string
  if (a.settledThisSpell) {
    /* Established and mid-cycle: never earlier than what they already
       owe, so correcting a typo cannot take days off time they paid for. */
    moved = nextDueDate(a.feeDay, a.currentRenewalOn)
  } else {
    /* Unpaid: same month, new day. NOT "re-derive from the joining
       date" — that is right only while joining is recent, and silently
       catastrophic once it is not. A student who joined eight months ago
       and never paid had their renewal rewritten 242 days into the past
       the moment their fee day was corrected, which put them past +15,
       where the ladder stops and hands over to manual. The app quietly
       stopped chasing the student the owner had just opened to chase. */
    moved = dueDateFor(a.currentRenewalOn.slice(0, 7), a.feeDay)
    /* One guard: the new day can fall before they joined — registered on
       the 2nd, billed on the 5th, moved to the 1st. A renewal that
       predates the enrolment is not a date, it is a contradiction. */
    if (a.joinedOn && moved < a.joinedOn) moved = nextDueDate(a.feeDay, a.joinedOn)
  }
  return moved === a.currentRenewalOn ? null : moved
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`
}
