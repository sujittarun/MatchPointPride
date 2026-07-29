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
2. `src/lib/telemetry.ts` + an ErrorBoundary, posting `client_error` to
   `events` so this app stops being invisible to Academy Manager.
3. Insert the `mpp` row in `tenants`, `config.modules.booking = false`.
4. `src/lib/cloud.ts` — plain `fetch` against PostgREST. Delete
   `selectors.ts:236-468` and the reminder replan in `store.tsx`. Call
   `resolve_fee`, `record_fee_payment`, `apply_payment_coverage`,
   `reminder_queue`.
5. Only then: replace the PIN with a real Supabase session. The PIN can
   stay as the unlock gesture, but it must sit **on top of** a session,
   not instead of one — it is compared in JavaScript on a public page.
6. `seed.ts` becomes a one-shot import script, not runtime state.

Roughly 950 of 8,513 TS lines come out.

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
