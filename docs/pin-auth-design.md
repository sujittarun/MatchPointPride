# PIN login for Match Point Pride — design notes

Not built. Parked deliberately until M2 lands (see CLAUDE.md), because
every recovery story here assumes Postgres is the copy of record, and
today it is not.

Produced by a 13-agent design pass: 4 research, 3 competing designs,
3 judges, 3 adversarial verifiers. The verifiers matter most — two of
three returned BROKEN on the design the judges picked, with 9 fatal
findings. That result is the useful part of this document.

## The conclusion

Build the SIMPLEST of the three (design 1 below): sign in with email and
password ONCE on the phone, encrypt the resulting Supabase session with a
key derived from the PIN, and from then on the PIN decrypts it. Nothing
secret ships in the bundle. The PIN never leaves the device.

Do NOT build the elaborate one. It was picked by two of three judges and
then taken apart by the verifiers — see "Why the winner failed".

## Why the owner's proposal cannot work

Hardcoding the email and password in the app, or fetching them with the
anon key, publishes them: the repo is public and the bundle is served to
anyone. The PIN then guards a door in a building with no walls — an
attacker skips the app and calls Supabase directly.

## The three designs

1. **Device Vault — one sign-in, then a PIN over a real Supabase session** — The owner signs in with email+password exactly once, on his own phone, with you present; from then on the phone holds nothing but a Supabase refresh token sealed under AES-GCM with a key that requires BOTH his 6-digit PIN AND a non-extractable HMAC key the browser will never let anyone read out — so the daily gesture is six digits, nothing is published in the bundle, and the whole thing dies from 

2. **Two-of-Two Device Unlock (`device-unlock`)** — The phone proves itself with a non-extractable P-256 key it is physically unable to hand over; a Supabase Edge Function checks the 6-digit PIN server-side behind that signature and mints a fresh, short-lived real Supabase session per unlock — so nothing that can log in is ever written to the device's disk, the PIN can never be brute-forced offline against the server, and the platform owner can kil

3. **Pride Key — a passkey-derived Supabase login (Face ID, no typing, nothing stored)** — One WebAuthn passkey on the owner's phone, unlocked by Face ID (or, when Face ID fails, by the phone's own passcode — iOS handles that fallback itself), whose PRF extension deterministically produces two 256-bit secrets: one is used as the Supabase account password, the other encrypts the local data cache. No credential, no ciphertext and no refresh token are ever written to the device or the bund

## Judges

- Security — adversarial review. I verified the load-bearing SQL and cli → picked design 2

- THE OWNER — one non-technical man, one phone, running a badminton acad → picked design 4

- THE MAINTAINER — one person, six live tenants, a documented history of → picked design 2

## Why the winner failed (9 fatal findings)

### Cryptography and protocol — adversarial. Attacked the unlock ceremony (ordering, replay, T

**SOUND_WITH_FIXES**

- **THE LOCKOUT LADDER IS A TOCTOU RACE. The unlock ceremony is specified as separate PostgREST calls from a stateless Deno function: step 3 reads fail_count/locked_until, step 6 runs Argon2id (~130-400ms), step 6b writes fail_count+1. Nothing serialises this. An attacker holding the phone (or re-imported device key material) fires 500 concurrent /unlock requests with 500 different PINs. All 500 read **

  → The server-side ladder is the ONLY thing that makes 6 digits acceptable (security claim #2: 'a per-device ladder capped at ~11 lifetime attempts'). Under concurrency it never engages and the 10^6 keyspace is exhausted in a few thousand rounds. The auto-revoke at 11 never triggers because the counter barely moves. This defeats the design's central security property in exactly the scenario it was bu

- **THE /admin/* JWT CHECK IS AN IMPLEMENTATION TRAP WITH PROJECT-WIDE SCOPE. The function is deployed --no-verify-jwt, so the platform verifies nothing on any route; the design says the two admin routes 'verify the caller's JWT themselves and require app_metadata.am_role = operator'. The repo already ships a decode-only helper labelled 'Claims are read for display only' (MatchPointPride/src/lib/cloud**

  → A hole strictly worse than S4, created by this design: not read-only cross-tenant PII via reminder_queue, but full enrolled staff access to any tenant in project ugsklcipzyiogxynshnh, minted through admin/generate_link, which is user impersonation by design. One missing signature check in one Deno file compromises Leo, Machaxi, MatchPoint, Raj, genalpha and the operator console.

- **PIN CHANGE IS NON-ATOMIC ACROSS TWO INDEPENDENT SECRET STORES, AND THE FAILURE MODE IS A SELF-INFLICTED WIPE. The server holds argon2id(new_pin); the local blob is wrapped under KEK(old_pin). The design orders it server-first ('if the server call succeeds and the local re-wrap fails, the client retries from the still-in-memory K_cache'). iOS freezes or kills a backgrounded WebKit page — a phone ca**

  → At fail_count>=11 the device auto-revokes; the next /status returns revoked and the client deletes mpp-vault and every ciphertext. The owner brute-forces himself into a total local data wipe while in possession of both correct secrets and the phone. Before M2 lands (Postgres as copy of record) this is business-ending. Note also that the 'pin' signed message binds sha256hex(current_pin) but NOT new

### Operations and the real world — ordinary life, not attackers. iOS eviction, airplane mode,

**BROKEN**

- **THE APP CANNOT COLD-START OFFLINE AT ALL. Verified: grep for serviceWorker|sw.js|workbox|manifest across src/, index.html, vite.config.ts and package.json returns NOTHING; index.html has a single <script type="module" src="/src/main.tsx"> and public/ holds only court.jpg. The design adds a manifest (for the ITP exemption) but no service worker. A home-screen web app with no service worker must fet**

  → The entire 'COLD START, OFFLINE' section of the design is unimplementable as written. 'The cache opens on the PIN with no network... reads come from the cache, writes queue' requires code to be running to do the unwrapping, and there is no code. Offline mode works only if the page is already alive in memory — i.e. it survives a re-lock but not an app relaunch. The owner is locked out of his own mo

- **THE 14-DAY OFFLINE AUTO-WIPE DESTROYS MONEY THAT EXISTS NOWHERE ELSE. The design moves the outbox to mpp.outbox.v2 encrypted under K_cache, and separately says the client 'refuses to unwrap K_cache after 14 days without a successful server contact and wipes at that point'. Verified today's flush() returns {sent:0} when not signed in and queued items sit in localStorage until a successful sync. Sce**

  → Eleven real payments are destroyed with no plaintext copy, no record, and no way to reconstruct which parents paid. Today's plaintext localStorage baseline survives this indefinitely. The design converts today's confidentiality problem into an availability problem aimed at the exact data the business runs on, and fires it on a holiday rather than an attack. This is the single mechanism most likely

### Scope and honesty — is this actually better than the status quo, does it violate PLATFORM.

**BROKEN**

- **The recovery story ('forgotten PIN → re-enrol → all data arrives from Postgres') rests on M2, which is task #9, still pending. I checked what exists: MatchPointPride/src/lib/cloud.ts has read helpers for centres/batches/members/enrollments/payments/coaches/expenses and write wrappers ONLY for record_fee_payment, void_payment, markStaffAttendance. There is no insert path for members, enrollments, b**

  → Owner forgets his PIN after a fortnight away. Eleven failures auto-revoke the device (design's own ladder). He re-enrols. K_cache is gone, so mpp.vault.v2 and mpp.outbox.v2 are permanently unreadable and every UPI payment receipt is destroyed — payment evidence, which is the one thing he cannot reconstruct. Today the same mistake is recoverable by editing localStorage. The design converts an embar

- **The 14-day offline expiry: 'the client also refuses to unwrap K_cache after 14 days without a successful server contact and wipes at that point'. It is client-enforced, invisible, unpauseable and uncheckable. It fires on Date.now().**

  → Three-week trip to see family, or a Supabase Functions outage lasting longer than expected, or the app simply not opened while he uses a paper diary during exam season — and the vault self-destructs. Same total loss as above, triggered by nothing the owner did wrong and with no warning he could have acted on. All three judges independently listed this as MUST NOT SHIP; the design keeps it.

- **`/device-unlock/status` is fired at every app open, BEFORE the keypad, and a `revoked` response makes the app 'delete mpp-vault ... and every ciphertext'. There is no confirmation step and no distinction between 'the server said revoked' and 'the server returned something I could not parse'. Supabase Edge Functions return HTML/JSON error envelopes on cold-start failure, 5xx and gateway errors; the**

  → One bad deploy of device-unlock/index.ts, one Supabase incident, one typo in the response parser, and the owner's phone wipes its only copy of the business records the next time he opens it. Irreversible, automatic, and it looks exactly like the design working correctly.

- **The function is deployed `--no-verify-jwt` (required, since /challenge, /unlock, /status and /enrol are pre-auth). The entire specification of the gate in front of project-wide impersonation is one sentence: 'the two /admin/* routes verify the caller's JWT themselves and require app_metadata.am_role = "operator"'. No verification method is given.**

  → If that is implemented by decoding the JWT locally — which is what cloud.ts:72-79 already does elsewhere in this codebase ('display only', base64url + atob, no signature check) — then anyone can forge an operator claim and call /admin/issue-code for any tenant_id. admin/generate_link signs in as ANY user in project ugsklcipzyiogxynshnh: all six tenants plus the operator console. This is the single

## The themes worth carrying forward

1. **Every auto-wipe is a data-loss bug until Postgres is the copy of
   record.** Revocation-on-open, a 14-day offline expiry, wipe-after-N-
   failures: each destroys the only copy of the owner's payments while
   M2 is unfinished. Order matters — M2 first, auth second.
2. **An Edge Function deployed `--no-verify-jwt` verifies nothing on any
   route**, including its own admin routes. A design that mints sessions
   behind such a function creates a hole worse than S4.
3. **A lockout ladder read-then-write across two calls is a TOCTOU
   race** — concurrent guesses never trip it, and the ladder is the only
   thing making a short PIN acceptable.
4. **The app has no service worker and no manifest**, so "works offline"
   is not currently true of anything, and on iOS the storage is subject
   to the 7-day cap. Fix that regardless of auth — see below.

## The one thing to do now, independent of any of this

`index.html` has no `<link rel="manifest">` and no
`apple-mobile-web-app-capable`, and `public/` holds only `court.jpg`.
On iOS a home-screen icon for such a site is a plain Safari bookmark,
which leaves localStorage AND IndexedDB subject to eviction after 7 days
of Safari use without opening the site. The owner's students, payments,
reminders and payment screenshots live in exactly those two stores, and
the only protection today is a manual backup in Settings.

Add the manifest, the Apple meta tag, icons, and call
`navigator.storage.persist()` on open. That is unrelated to
authentication and should not wait for it.
