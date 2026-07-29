/* ============================================================
   Academy details and public-page copy.

   This lives in code rather than in Settings on purpose: it is
   written once and then left alone, so putting it behind a form the
   owner has to scroll past every time was pure noise. Edit here,
   commit, and the deploy picks it up.
   ============================================================ */

export const ACADEMY = {
  name: 'Match Point Pride',
  ownerName: 'Venu',
  established: '2008',

  /** Hero headline — the second line carries the brand colour. */
  heroLine1: 'Every player starts somewhere.',
  heroLine2: 'Nobody stays there.',
  heroSub:
    'Structured badminton coaching in Hyderabad — from holding the racket properly ' +
    'to walking into a tournament draw.',

  /** The one place coaching credentials are stated on the public page. */
  coachingNote:
    'Small batches, grouped by level rather than age — and a standard on court set by ' +
    'someone who has played at national level.',

  /** The four stages a player moves through. */
  ladder: ['Basics', 'Rally', 'Match play', 'Tournament'],

  area: 'Narsingi',
  location: 'Alkapur Road 30 · beside Sam Houston Intl School · Narsingi, Hyderabad',
  courts: '7 indoor courts',
  hours: '5 AM – 1 AM',

  /** Set this to switch on the public WhatsApp enquiry buttons. */
  enquiryPhone: '' as string,
  countryCode: '91' as string,

  /** Placeholders: {student} {guardian} {amount} {months} {due} {batch} {slot} {academy} {owner} */
  reminderTemplate:
    'Hi {guardian}, a gentle reminder from {academy}. ' +
    "{student}'s {batch} fee for {months} comes to {amount}.",

  /**
   * Appended only when the student's batch has a UPI ID, so a batch without
   * one never sends a half-finished "pay to:" line. {upi} and {payee} come
   * from the batch.
   */
  upiLine: 'You can pay by UPI to {upi}{payee}. Please send a screenshot once done.',

  /** Always last. */
  reminderSignoff: 'Please ignore if already paid. — {owner}',
} as const
