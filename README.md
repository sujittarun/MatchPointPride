# Match Point Pride

A phone-first operations console for **Match Point Pride Badminton Academy** — Alkapur
Road 30, beside Sam Houston Intl School, Narsingi, Hyderabad — built for one person to
run the academy from their phone.

> **Status: on the platform.** This is tenant `mpp` of Academy Manager and it reads and
> writes the platform database. Every money rule — the fee chain, arrears coverage, the
> renewal roll-forward, the reminder ladder — is a SQL function shared with every other
> client, so a parent's WhatsApp message and this screen cannot quote different amounts.
> See `CLAUDE.md`. **Do not add new money logic to this repo:** if a number is needed, add
> it to the SQL function and read it.

**Live:** https://sujittarun.github.io/MatchPointPride/

A public landing page, then a PIN that unlocks this phone's saved sign-in, then four
things: batches, reminders, staff attendance and money.

---

## What it does

### Landing
One screen and a short closing strip — about 1.3 phone screens end to end. A full-bleed
photograph of the courts, a headline about the player's progression rather than the
owner's CV, and a four-stage ladder (Basics → Rally → Match play → Tournament) that shows
a parent where their child is and what comes next.

Coaching credentials appear exactly once, in a single sentence at the bottom.

All of the copy and the academy details live in **`src/lib/academy.ts`** — written once,
then left alone, so it isn't cluttering a settings form on a phone. Setting
`enquiryPhone` there switches on the public WhatsApp buttons. The hero image is
`public/court.jpg`; replace that file and nothing else needs touching.

### Settings
One thing, because it is the only thing a single operator needs to touch from a phone:
the **PIN**. Change it, or log out. There is no default — you choose it when you set the
phone up, and changing it re-encrypts the saved session under the new one.

Export, import and backup were removed rather than kept. A backup downloaded to a phone is
a file of student names and parents' phone numbers, stale the moment it is written; the
records live in Postgres and are backed up there. Import was worse — it wrote React state
and nothing else, so the next read from the database replaced whatever it loaded, and the
owner was told "12 students imported" having imported nothing.

### 1. Batches
Add, edit and delete batches. Ships with the six the academy actually runs — four kids
batches, one professional squad, one membership — and each carries an **optional** slot
time and day list, so a membership batch with no fixed slot is a first-class case rather
than a blank field.

Students belong to a batch and carry a phone number, monthly fee and fee-due day.
"Mark paid" on the roster records the payment and closes that student's reminder in one
tap.

### 2. Reminders and reminder tracking
**There is no "generate" step.** The list is derived from the payment record: a student is
behind for a month when no fee payment is recorded *for* that month, and the reminder
appears on its own. **Nothing is ever sent automatically** — you send each one.

> The list is `reminder_queue()`'s answer, recomputed on every read, and it follows the
> platform ladder: −2 heads-up, 0 due, +5 first chase, +7–14 daily, **stop at +15** —
> past which it is manual only. Nothing is written to the list locally, which is why
> one-off custom reminders and cancel-on-a-reminder are not offered: they would vanish at
> the next refresh. A reminder ends when the fee is recorded or the student is
> discontinued, both of which are real rows.

**Arrears go out as one message.** A student two months behind gets a single reminder for
both — *"…fee for June and July comes to ₹4,400"* — not two separate chases. Marking it
paid writes one payment row per month cleared.

Payments carry a `forMonth` separate from their `date`, so someone clearing June's fee in
July settles June while the cash still lands in July's revenue.

Each reminder sends over **WhatsApp** (`wa.me` deep link with the message pre-filled),
SMS or a phone call. Every send is logged: channel, timestamp, and a running send count,
so a reminder that took three nudges says so. The message comes from an editable template
from a template in `src/lib/academy.ts` with `{student} {guardian} {amount} {months}
{due} {batch} {slot} {academy} {owner}` placeholders.

Tracking covers outstanding amount, how many are waiting on you, **response rate**
(of reminders actually sent, how many ended in payment) and a six-month sent-vs-paid chart.
Marking one paid writes the revenue straight into Finance.

### 3. Staff attendance
Two states only — **Present** or **Absent**. One tap per person marks the day; tapping the
same state again clears it. Sundays are the weekly off and are excluded from every
calculation.

Per staff member: a consistency ring, a tappable month calendar, month-by-month consistency
with the figure printed on each bar, a days-absent chart, and lifetime totals. Consistency
is measured against days actually *marked*, so an unmarked backlog never quietly deflates
someone's score.

### 4. Finance
Revenue from student fees, **court bookings** (logged as a single booking, a day's total or
a whole month), membership or other. Expenses across eight categories. Month stepper, net
headline, in-vs-out and net-trend charts, revenue-by-source donut, expense-by-category
breakdown, and a full ledger.

Recording a student fee here also closes that student's open reminder — the four features
share one dataset rather than four. Marking a student **inactive** closes their open
reminders too, so someone who has stopped coming doesn't sit in the overdue list forever.

---

## Testing

`npm test` runs 249 assertions over what is left in TypeScript: date arithmetic, the
first-fee and renewal date rules, money formatting, attendance maths, reminder stats and
row shaping. `npm run build` typechecks the whole app.

**It cannot cover the money, because the money is not here.** That lives in
`scripts/regression.sql`, which exercises the real fee chain, the real ladder and the real
roll-forward against live data inside a transaction it rolls back:

```bash
AcademyManager/scripts/migrate.sh --dry-run --scope mpp MatchPointPride/scripts/regression.sql
```

Read the `REGRESSION PASS | failures:` line, not the exit code — the file signals its
result by raising, because raising is what rolls the transaction back. The runner prints
`✗ FAILED` on a **passing** run. That is the design, not a fault.

Beyond that, a UI pass on a 375×812 viewport: negative and malformed input on every form,
referential integrity across deletes, the member-discontinue flow, long-string layout
overflow, and the empty state of every screen.

---

## Two things to know before relying on it

**1. The data is in Postgres, and only in Postgres.** There is no local copy — no cached
document, no draft, no backup file. The app opens empty and fills from the database as soon
as a session exists, because a stale local copy is a guess dressed as a fact. Clearing
browser data or switching phones costs you the saved sign-in, not the academy's records:
sign in again with your email and password, choose a PIN, and everything is there.

What still lives on the device, and should: the sealed session vault, the PIN attempt
ladder, and payment screenshots pending upload. None of those are academy records.

**2. The PIN is not compared to anything — it is the key.** You sign in with email and
password once per device. The refresh token that comes back is encrypted with a key derived
from your PIN (PBKDF2-HMAC-SHA256, 600k iterations) and kept on the phone; every later visit
the PIN decrypts it and swaps it for a fresh session. A wrong PIN fails to decrypt, so there
is no equality test to skip past in a console. Row Level Security trusts the session token;
the PIN never reaches the database.

**Honest limit:** four digits is ten thousand guesses, and against someone holding the
unlocked phone and attacking the stored blob offline, PBKDF2 buys hours rather than safety.
What protects a short PIN is that guessing has to go through the app, where the attempt
ladder escalates and, past the cap, the vault is wiped and you re-enrol with your password.
Six digits is offered for anyone who wants the extra two orders of magnitude.

---

## Design

Built phone-first, because that's the only place it gets used: bottom tab bar, bottom-sheet
modals, card lists instead of wide tables, 44px minimum touch targets, 16px inputs so iOS
never zooms on focus, and safe-area insets for notched screens. On a desktop it stays a
centred column rather than stretching — deliberate, not unfinished.

Dark-committed, on a cool near-black (`#141A21`) with a shuttle-lime accent (`#C8FF4D`).
Tokens live in `src/styles/tokens.css`; a light theme would be a token swap, not a rewrite.

**Charts** are hand-rolled SVG — no charting dependency, so the whole app is about 96 kB
gzipped (90 kB of JavaScript, 7 kB of CSS) with React as the only runtime dependency. The categorical series colours were validated
against the actual chart surface for lightness band, chroma floor, colour-vision-deficiency
separation, normal-vision separation and 3:1 contrast — all six slots pass. Throughout:
one value axis per chart (never two scales), fixed slot order (never cycled), a legend
whenever there's more than one series, and tap/hover tooltips on every plot. Money green
and red sit in the CVD warning band, so they always ship with a label and a direction arrow
rather than leaning on hue.

---

## Running it

```bash
npm install
```

```bash
npm run dev
```

```bash
npm run build
```

Pushing to `main` builds and deploys via `.github/workflows/deploy.yml`. Set
**Settings → Pages → Source** to **GitHub Actions** once.

The app opens empty and fills from the platform database once you have signed in. There is
no demo dataset and no default PIN — the first run on a phone asks for the academy email
and password, then the PIN you want to unlock it with afterwards.

## The Android app

Same app. Not a port — Capacitor wraps this exact React bundle in a native shell, so
there is one codebase, one `src/`, and the screens cannot drift apart. The APK carries
the built assets, so a cold start reads them off the device rather than the network.

```bash
npm run android:apk        # build the web bundle, sync it, assemble a debug APK
npm run android:install    # the above, then push it to a plugged-in phone or emulator
npm run android:open       # open the project in Android Studio instead
```

Requires a JDK 21 and the Android SDK. `scripts/android.sh` finds both — it falls back
to the runtime bundled inside Android Studio, which is a 21, and writes
`android/local.properties` each run because that file is machine-specific and gitignored.

What is actually Android-only:

| | |
|---|---|
| `capacitor.config.ts` | app id, splash, and `androidScheme: 'https'` — a secure origin, without which `crypto.subtle` does not exist and `vault.ts` cannot open |
| `src/lib/native.ts` | splash dismissal, the back gesture, refresh on resume. A no-op in a browser |
| `src/lib/dismiss.ts` | which open sheet the back gesture should close |
| `android/` | the Gradle project: manifest, theme, icon |

That is the whole of the difference. No Android-only screen exists, and adding one would
mean two implementations of the same page — the argument PLATFORM.md makes about money
living in one place, applied to pixels.

### The icon

`npm run icons` renders every raster from one shape — the same shuttlecock
`BrandMark.tsx` draws, so the home-screen icon and the mark in the app's top bar are one
drawing. The adaptive icon itself is a vector and needs no rasters; the PNGs exist for
Android 7.x, the Play Store listing and the web manifest.

### Releasing

Signing keys are credentials and are not in this repo. To make an installable release
build, create a key once and tell Gradle where it is:

```bash
keytool -genkeypair -v -keystore ~/mpp-release.jks -alias mpp \
  -keyalg RSA -keysize 2048 -validity 10000
```

Then `android/keystore.properties` (gitignored):

```properties
storeFile=/Users/you/mpp-release.jks
storePassword=...
keyAlias=mpp
keyPassword=...
```

```bash
npm run android:release
```

Keep that keystore backed up somewhere that is not this machine. It is the only proof an
update is really from us — lose it and the app cannot be updated, only republished under
a new id.

Raise both `versionCode` and `versionName` in `android/app/build.gradle` for each build
you hand over, and keep `versionName` equal to `package.json`'s version: that is the
number `telemetry.ts` stamps on every error report.

## Layout

```
src/
  lib/          types · cloud reads/writes · row shaping · store · date helpers · vault
                native shell (Android) · dismiss stack
  components/   ui primitives (sheet, stat, confirm) · SVG icons · charts
  pages/        Landing · Dashboard · Batches · Reminders · Staff · Finance · Settings
  styles/       tokens.css · global.css · landing.css
android/        the Gradle project. Generated by Capacitor, then edited by hand
```

No router, charting or UI library — hash routing, SVG charts and CSS are all local.
