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

  /**
   * Hero headline — the second line carries the brand colour and the size.
   *
   * It used to be "Every player starts somewhere. / Nobody stays there."
   * Read it as a parent and it is a verdict on your child: you are not
   * good enough yet, and you will not be allowed to stay. The academy
   * was the one thing the sentence never mentioned.
   *
   * This says what the place does instead of what the player lacks. The
   * subject is the coaching, which is the thing an owner and a coach are
   * actually proud of and the thing a parent is choosing.
   */
  heroLine1: 'Structured coaching, every morning and every evening.',
  heroLine2: 'Where players are made.',
  /* The   before each em dash is deliberate: a dash may never begin a
     line. Without it this wrapped to "…coaching in Hyderabad" / "— from
     holding the racket…", which is the one break a typesetter would send
     back. Non-breaking space, so the dash stays welded to the word it
     follows at every width. */
  /* Folded up from what used to be a separate closing strip below the
     fold. The page is one screen now, so the credential either earns a
     place in the hero or does not appear — and it earns it. */
  heroSub:
    'Small batches grouped by level, not age — and a standard on court set by ' +
    'someone who has played at national level.',

  /** The four stages a player moves through. */
  ladder: ['Basics', 'Rally', 'Match play', 'Tournament'],

  area: 'Narsingi',
  location: 'Alkapur Road 30 · beside Sam Houston Intl School · Narsingi, Hyderabad',
  courts: '7 indoor courts',
  hours: '5 AM – 1 AM',

  /** Set this to switch on the public WhatsApp enquiry buttons. */
  enquiryPhone: '' as string,
  countryCode: '91' as string,

  /**
   * Where this app is published. The reminder puts a payment link in a
   * parent's WhatsApp, so it has to be an absolute URL — and it cannot
   * be derived at runtime, because the Android build sets a relative
   * base (`./`) and would produce a link that only works on the phone
   * that sent it.
   */
  siteUrl: 'https://sujittarun.github.io/MatchPointPride/',

  /**
   * The fallback shown on the payment page when a link arrives without
   * payment details — mirrors `tenants.config.billing`.
   *
   * It is a FALLBACK, never the source of truth. A real reminder link
   * carries the account resolved server-side by `resolve_upi()`, which
   * walks batch → centre → tenant; a batch collecting to its own account
   * would be paid into the wrong one if this file decided. The page
   * prints whichever it used, so it is always visible which was.
   */
  billing: {
    upiId: '7732077327@ybl',
    payee: 'Match Point Badminton Academy',
  },

  /* ----------------------------------------------------------------
     The fee reminder.

     EVERY reminder this app sends is sent BY HAND: the owner opens the
     list, reads the message, and taps to send it through his own
     WhatsApp. There is no Business-API template and no automatic send
     anywhere in this repo — which is exactly why this can sound like a
     person. A utility template on the Business API may not; that one
     would be judged as marketing and the number put at risk. If auto
     sending is ever added, it needs its OWN plain template rather than
     this text.

     Warm, and short. The first draft explained the payment page in two
     sentences the parent does not need — they are about to open it and
     see it. A reminder read on a phone is skimmed, and every line that
     is not the amount, the link or the reassurance is a line between
     the reader and those three.

     Placeholders: {student} {guardian} {amount} {months} {due} {batch}
     {academy} {owner} {paylink} {upi} {payee}
     Blocks are joined with a blank line between them.
     ---------------------------------------------------------------- */
  /* No {batch}. The parent knows which batch their child is in and does
     not need it read back to them; it only made the sentence longer and
     turned an internal label ("Kids Batch A") into something they were
     asked to recognise. {batch} still resolves if a custom message wants
     it. */
  reminderTemplate:
    'A gentle note from {academy} 🏸 — {student}’s fee for {months} ' +
    'comes to *{amount}*.',

  /**
   * Only when the batch resolves to a UPI account, so a batch without one
   * never sends a link to a page that cannot take money.
   *
   * A link, not a raw UPI id. The id asked a parent to copy a string into
   * a banking app by hand and get it exactly right; the page opens their
   * UPI app with the amount already filled, and still shows the id for
   * anyone who would rather type it.
   */
  reminderPayLine: 'Pay here 👇\n{paylink}',

  /** Always last. */
  reminderSignoff:
    'Send a screenshot once it is done and I will mark it off ✅\n' +
    'Already paid? Please ignore this 🙏\n\n— {owner}\n{academy}',
} as const
