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

## ⚠ THIS REPO CURRENTLY VIOLATES THAT RULE

It was built standalone, before it was understood to be a tenant. Every
money rule is in TypeScript, on the client, and duplicates a function
that already exists in Postgres:

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

**Do not deepen this.** No new fee, arrears, renewal or reminder-timing
logic in TypeScript. If a number is needed, call the RPC.

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
4. `src/lib/cloud.ts` — **written**: session, PostgREST reads, outbox,
   and typed wrappers for `resolve_fee`, `reminder_queue`,
   `record_fee_payment`, `void_payment`. Nothing in it computes.
   **Not yet wired** — see "Before the switchover" below. Then delete
   `selectors.ts:236-468` and the reminder replan in `store.tsx`.
5. Only then: replace the PIN with a real Supabase session. The PIN can
   stay as the unlock gesture, but it must sit **on top of** a session,
   not instead of one — it is compared in JavaScript on a public page.
6. `seed.ts` becomes a one-shot import script, not runtime state.

Roughly 950 of 8,513 TS lines come out.

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

Until that exists the cloud path cannot be exercised even once, and
swapping a working local money path for an untested remote one is not a
trade worth making. `signIn()` checks the tenant and role claims and
fails with a readable message rather than showing an empty app, which is
what an account created without its metadata would otherwise do.

The one-shot import runs from the app, not from SQL: the owner's real
batches, students and payments live in localStorage on his phone, so his
backup is the only place they exist. `0008` seeded the centre and sport;
nothing else about Pride is inventable from the platform side.

## Until then

`localStorage` + IndexedDB (payment screenshots). Backup/restore in
Settings is the only thing between this data and a wiped phone.

## Running it

```bash
npm install && npm run dev
npm test        # 214 assertions
npm run simulate  # narrated life-cycle, 29 assertions
```

Phone-first: bottom tab bar, bottom-sheet modals, 44px targets. Designed
at 375×812 — check there, not on a desktop.
