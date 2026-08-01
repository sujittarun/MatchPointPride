# Match Point Pride — tenant `mpp`

A separate app for the owner of the **Pride** venue (Alkapur Road 30,
beside Sam Houston Intl School, Narsingi — 7 indoor courts, 5 AM–1 AM).

Pride is also modelled as a *venue* inside the older `matchpoint` tenant,
but that project may be shelved: the Pride owner wants their own app, so
this is its own tenant. Seed its config from the real values already in
`matchpoint`'s — payee "Match Point Badminton Academy",
UPI `7732077327@ybl`, phone `+91 77320 77327`.

## THE HOUSE RULE (platform-wide — do not violate)

> **Anything that computes money lives in Postgres.** The fee chain, the
> renewal roll-forward and the payout split are SQL functions called by
> every client. No client does that arithmetic itself.
>
> **If you add a money rule, add it to the database — never to a client.**

Full platform rules: `AcademyManager/PLATFORM.md`.

---

## The violation is closed

Every money rule now lives in Postgres. `selectors.ts` lost 242 lines —
`unpaidMonthsFor`, `planFeeReminders`, `applyFeePlan`, `ARREARS_MONTHS`
— and `store.tsx` lost the reminder replan that raced the real ladder.

What each of them became:

| In this repo | Already exists server-side |
|---|---|
| `selectors.ts` arrears from unpaid months | `apply_payment_coverage()` |
| `Transaction.forMonth` | the same, properly |
| `planFeeReminders()` and its timing | `reminder_queue()` — ladder −2 / 0 / +5 / +7–14 / stop at +15 |
| `Student.spells` (enrolment history) | `enrollments.status` + `discontinued_on` |
| `student.monthlyFee` as the fee | `resolve_fee()` — a 7-level chain |
| `studentProfile()` | `member_timeline` |
| attendance stats | `attendance_roster/history/dashboard()` |
| `localStorage` as the database | the platform database |

**Keep it closed.** No new fee, arrears, renewal or reminder-timing
logic in TypeScript. If a number is needed, add it to the SQL function
and read it — do not derive it here. `mapping.ts` may reshape a row; it
may not decide anything.

## The target

Keep React + Vite + TS — the violation is the money logic, not the
framework, and the ~6,000 lines of pages and charts are fine. Order is
money-first; never leave TypeScript and Postgres both computing fees.

1. ~~Delete `docs/data-model.sql`~~ (done — its `uuid` PKs contradicted
   the live `tenants.id text` / `batches.id bigint`; it must never run).
2. ~~`src/lib/telemetry.ts` + an ErrorBoundary~~ (done — uncaught throws
   and rejections post `client_error` to `events`; Academy Manager reads
   them through `platform_errors()`. No student data is ever sent).
3. ~~Insert the `mpp` row in `tenants`~~ (done — migration `0006`,
   `modules.booking = false`, `features.publicTimetable = false`).
4. ~~`src/lib/cloud.ts` — session, PostgREST reads, outbox, and typed
   wrappers for `resolve_fee`, `reminder_queue`, `record_fee_payment`,
   `void_payment`~~ (done — wired through `store.tsx`, `mapping.ts` and
   `ConfirmPayment.tsx`; nothing in it computes. `selectors.ts` lost its
   money block and `store.tsx` lost the reminder replan).
5. ~~Replace the PIN with a real Supabase session~~ (done — `vault.ts`.
   The PIN is not compared to anything: it derives an AES key that
   decrypts the stored Supabase refresh token, so a wrong one fails the
   GCM tag check. `changePin()` re-seals the vault; the old screen wrote
   a field nothing read and reported success anyway).
6. `seed.ts` becomes a one-shot import script, not runtime state.
   **Still open.** `buildEmptyData()` is the empty shell the app opens
   with and is load-bearing; `buildSeedData()` is a demo-data generator
   that only `scripts/test.ts` calls, kept as a test fixture. Neither is
   the import the owner actually needs.

Everything above item 6 is done. What is left in TypeScript computes no
money: dates, shaping, lookup and charts.

## Before the switchover

The staff login has to exist first — every read and write is scoped by
RLS to a Supabase user carrying `app_metadata.am_role = 'staff'` and
`app_metadata.tenant_id = 'mpp'`. Every other tenant already has one
(`staff@leoacademy.in`, `staff@rajsports.in`, …).

Creating it and setting its password is the owner's to do, in the
Supabase dashboard — Authentication → Add user, then set

```json
{ "am_role": "staff", "tenant_id": "mpp" }
```

as that user's **App Metadata** (not User Metadata — `auth_role()` and
`auth_tenant()` read `app_metadata`, and RLS grants nothing without it).

The cloud path is now the only path — the local money logic it would
have been traded against is gone, so there is nothing left to swap. If
the app opens empty and sign-in fails, this account and its App Metadata
are the first thing to check. `signIn()` checks the tenant and role claims and
fails with a readable message rather than showing an empty app, which is
what an account created without its metadata would otherwise do.

The one-shot import runs from the app, not from SQL: the owner's real
batches, students and payments live in localStorage on his phone, so his
backup is the only place they exist. `0008` seeded the centre and sport;
nothing else about Pride is inventable from the platform side.

## Where the data lives

Postgres, and only Postgres. There is no local copy of the academy's
records: no `mpp.data.v1`, no draft, no cache. Every write goes through
one of the helpers in `store.tsx`, lands in the database, and is read
straight back.

What is still on the device, and should be: the sealed session vault
(`vault.ts`) and the PIN attempt ladder. Nothing else — payment
screenshots now go to the private `payment-proofs` bucket, keyed
`<tenant>/<payment_id>.<ext>`, read back through a short-lived signed
URL. Never make that bucket public: they are bank screenshots.

**The Supabase session is held in memory only.** Not localStorage, not
sessionStorage, not a cookie. This paragraph used to say "nothing else"
while `cloud.ts` wrote the whole session — refresh token included — to
`localStorage['mpp.session.v1']`, one key away from the vault that
exists to encrypt that exact token. The ciphertext was strong and the
plaintext lay beside it, so the PIN, the 600k PBKDF2 iterations and the
attempt ladder all guarded a door that stood open: one `getItem` and
you hold a durable credential for the tenant.

The consequence is that a reload or a restart asks for the PIN, which
is what `vault.ts` always described — "every day after that, the PIN
decrypts that token and swaps it for a fresh session". `authed` is
derived from whether a session exists rather than kept as a separate
flag, so the two cannot disagree and the app can never open signed-in
with nothing behind it. `scripts/session.ts` asserts that no credential
reaches storage; `npm test` runs it.

The app ships a manifest so a home-screen icon on iOS is a real
installed app rather than a Safari bookmark. Without it, script-writable
storage is cleared after seven days of Safari use without opening the
site, which would wipe the sealed session and send the owner back to his
password.

## The Android app is this app

Capacitor, not a port. The APK carries the same React bundle, the same
`cloud.ts`, the same CSS — so there is nothing to keep in step, and no
screen that exists in one place and not the other. A React Native build
would have meant reimplementing ~6,000 lines of pages and 1,900 lines of
CSS in a different rendering model; two implementations of one screen
disagree, which is the argument this file already makes about money,
applied to pixels.

**Do not add an Android-only screen.** If the phone needs something the
web does not, it goes behind `isNative` in the shared component, not
into a second copy of the page.

Four files and one directory are all the difference:

| | |
|---|---|
| `capacitor.config.ts` | app id `in.matchpoint.pride`, splash, `androidScheme: 'https'` |
| `src/lib/native.ts` | splash dismissal, back gesture, refresh on resume. No-op on the web |
| `src/lib/dismiss.ts` | the stack of open sheets the back gesture closes, newest first |
| `src/components/BrandMark.tsx` | the mark. Its path data is duplicated into two Android vectors and `scripts/icons.mjs` — change one, run `npm run icons`, change all four |
| `android/` | the Gradle project. Committed; its build output is not |

**`androidScheme: 'https'` is load-bearing.** It makes the WebView
origin `https://localhost`, which is a secure context. On an insecure
origin `crypto.subtle` does not exist, and `vault.ts` is a key
derivation, not a comparison — the PIN screen would fail to open the
vault on every device.

**Safe areas already work; do not add insets.** Capacitor 8's built-in
`SystemBars` plugin either passes the real insets through to
`env(safe-area-inset-*)` (WebView 140+, which needs the
`viewport-fit=cover` that `index.html` already has) or pads the WebView
itself and reports zero. Reading its `--safe-area-inset-*` variables
*as well* would double-count on the second path.

`allowBackup` is off. Android's Auto Backup would copy the sealed vault
to the owner's Google Drive; it is ciphertext, but a four-digit PIN is
protected by the attempt ladder in the app, and a copy outside the app
is a copy the ladder cannot guard. A reinstall asks for the password
again, which is what this file already says happens.

Building needs a JDK 21 and the Android SDK; `scripts/android.sh` finds
both. Release signing reads `android/keystore.properties` if it exists
and is otherwise skipped, so an unsigned release APK fails loudly at
install rather than a debug key quietly shipping.

**Deleting a payment is a void, not a delete.** `void_payment` sets
`status = 'void'` and keeps the row — the reversal is a fact worth
keeping, and it writes a `member_timeline` note. So anything reading
`payments` must look at `status`, and `mapping.ts` is the one place
that does it: `isSettled()` allows `paid` and `null` and excludes
everything else. It is an allow-list on purpose — there is **no check
constraint** on `payments.status`, it is free text defaulting to
`'paid'`, so an unrecognised value has to be excluded rather than
assumed good. Telling the owner a parent has paid when they have not is
the one mistake this app must not make.

**The reminder is sent by hand, and that is why it can sound human.**
Nothing in this repo sends automatically — the owner opens the list,
reads the message and taps it into his own WhatsApp. So the copy in
`academy.ts` is warm and carries emoji. A WhatsApp **Business API**
template may not: that one is judged as marketing and puts the number
at risk. If auto-sending is ever added it needs its **own** plain
utility template, not this text.

It carries a payment **link**, not a raw UPI id — `#/pay`, a public
route decided before the auth gate in `App.tsx`, because the parent
opening it is never signed in. That page computes nothing: the amount,
the UPI id and the payee all arrive in the link, already resolved by
`resolve_upi()` and `reminder_queue()` on the signed-in side. It opens
`upi://pay` on Android and offers named apps (PhonePe, GPay, Paytm,
BHIM) on iOS, **because iOS does not register the `upi://` scheme at
all** — following it there does nothing, with no app and no error. The
UPI id and amount are always on screen to copy, since a deep link can
fail silently on any phone.

**Two things were removed rather than faked.** One-off custom reminders
and cancel/delete on a fee reminder: the list is `reminder_queue()`'s
answer, recomputed on every read, so anything written to it locally
would vanish at the next refresh. A reminder ends when the fee is
recorded or the student is discontinued — both real actions with real
rows behind them.

## Running it

```bash
npm install && npm run dev
npm test              # 342 assertions, plus the session-security check
npm run android:apk   # the same app, as an installable APK
```

`npm test` covers the TypeScript that is left — shaping, dates, lookup.
It cannot cover the money, because the money is not here any more. That
lives in `scripts/regression.sql`, which exercises the real fee chain,
the real ladder and the real roll-forward against live data inside a
transaction it rolls back:

```bash
AcademyManager/scripts/migrate.sh --dry-run --scope mpp MatchPointPride/scripts/regression.sql
```

Read the `REGRESSION PASS | failures:` line, not the exit code. The file
signals its result by raising, because raising is what rolls the
transaction back — so the runner prints `✗ FAILED` on a **passing** run
and writes nothing to the ledger. That is the design, not a fault.

The old `npm run simulate` was deleted with the local money logic it
simulated — a narrated life cycle over arithmetic that no longer runs
here proved only that the simulation agreed with itself.

Phone-first: bottom tab bar, bottom-sheet modals, 44px targets. Designed
at 375×812 — check there, not on a desktop. The Android build is the
same pixels; an emulator screenshot and a 375-wide browser window agree,
which is the point of not having written it twice.
