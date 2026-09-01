/* ============================================================
   UPI links, and the link that carries a fee to a parent.

   Nothing here decides an amount or an account. It formats what it is
   given — `resolve_upi()` picks the account and `reminder_queue()` says
   what is owed, both server-side, and both already resolved by the time
   anything in this file runs.
   ============================================================ */

import { ACADEMY as A } from './academy'

export type PayDetails = {
  /** Rupees. 0 means "let the payer type it". */
  amount: number
  /** Who the money is for, shown on the page. Never sent to the bank. */
  student?: string
  /** The account, resolved server-side. */
  upi: string
  payee: string
  /** "August", or "August–October" for a multi-month payment. */
  months?: string
}

/**
 * The query half of a UPI intent, shared by every app scheme.
 *
 * `am` is omitted entirely when the amount is zero rather than sent as
 * "0.00" — a UPI intent carrying an explicit zero is rejected by some
 * apps and silently prefilled as zero by others, and neither is what a
 * parent with an unpriced fee should meet.
 */
export function upiQuery(d: PayDetails): string {
  const note = d.months ? `${A.name} fee · ${d.months}` : `${A.name} fee`
  return [
    `pa=${encodeURIComponent(d.upi)}`,
    `pn=${encodeURIComponent(d.payee)}`,
    `tn=${encodeURIComponent(note)}`,
    d.amount > 0 ? `am=${d.amount.toFixed(2)}` : '',
    'cu=INR',
  ]
    .filter(Boolean)
    .join('&')
}

/**
 * The app schemes.
 *
 * `upi://` is an Android convention: the OS resolves it to the UPI app
 * chooser. iOS has no such registry — following `upi://` there does
 * nothing at all, with no app and no error — so on Apple hardware the
 * page offers these named schemes instead. That is why this is a map
 * and not a single string.
 */
export const UPI_SCHEMES = {
  any: 'upi://pay?',
  phonepe: 'phonepe://pay?',
  gpay: 'gpay://upi/pay?',
  paytm: 'paytmmp://pay?',
  bhim: 'bhim://upi/pay?',
} as const

export type UpiApp = keyof typeof UPI_SCHEMES

export function upiLink(app: UpiApp, d: PayDetails): string {
  return UPI_SCHEMES[app] + upiQuery(d)
}

/**
 * The absolute link a parent taps in WhatsApp.
 *
 * Absolute because it leaves the device: `import.meta.env.BASE_URL` is
 * `./` in the Android build, so a link built from it would only resolve
 * on the phone that composed it.
 */
export function payLink(d: PayDetails): string {
  /* Only what the PAGE cannot work out for itself.

     The link was 122 characters of a 403-character message — a third of
     it — because it repeated the student, the month and the payee, all
     three of which the message says in plain words directly above it. A
     parent does not read a query string to find out whose fee it is.

     `a` and `u` always: the amount and the account are the two things
     the page cannot default. `p` only when the batch collects to a
     payee that is NOT the academy's own, because Pay.tsx already falls
     back to it — sending it every time was 20 characters to say what
     the page assumed anyway. */
  const q = new URLSearchParams()
  if (d.amount > 0) q.set('a', String(Math.round(d.amount)))
  q.set('u', d.upi)
  if (d.payee && d.payee !== A.billing.payee) q.set('p', d.payee)
  return `${A.siteUrl.replace(/\/+$/, '')}/#/pay?${q.toString()}`
}

/**
 * Does this device need named UPI apps instead of the generic scheme?
 *
 * The iPad check is the `MacIntel` + touch points pair, because iPadOS
 * reports itself as a Mac and would otherwise be handed an Android-only
 * URL scheme that does nothing.
 */
export function needsNamedUpiApps(nav: {
  userAgent: string
  platform: string
  maxTouchPoints: number
}): boolean {
  return (
    /iPad|iPhone|iPod/.test(nav.userAgent) ||
    (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
  )
}
