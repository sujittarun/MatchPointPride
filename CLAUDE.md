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

The app ships a manifest so a home-screen icon on iOS is a real
installed app rather than a Safari bookmark. Without it, script-writable
storage is cleared after seven days of Safari use without opening the
site, which would wipe the sealed session and send the owner back to his
password.

**Two things were removed rather than faked.** One-off custom reminders
and cancel/delete on a fee reminder: the list is `reminder_queue()`'s
answer, recomputed on every read, so anything written to it locally
would vanish at the next refresh. A reminder ends when the fee is
recorded or the student is discontinued — both real actions with real
rows behind them.

## Running it

```bash
npm install && npm run dev
npm test        # 242 assertions
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
at 375×812 — check there, not on a desktop.
