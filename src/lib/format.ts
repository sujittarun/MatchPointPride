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
 * The date a fee actually falls due in a given month. A student billed on
 * the 31st is due on the 30th in April and the 28th in February — the same
 * way a monthly EMI or subscription behaves.
 */
export function dueDateFor(monthKey: string, feeDay: number): string {
  const last = daysInMonth(monthKey)
  const day = Math.min(clampDay(feeDay), last)
  return `${monthKey}-${String(day).padStart(2, '0')}`
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`
}
