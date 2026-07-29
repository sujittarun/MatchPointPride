# Match Point Pride

A phone-first operations console for **Match Point Pride Badminton Academy** — Alkapur
Road 30, beside Sam Houston Intl School, Narsingi, Hyderabad — built for one person to
run the academy from their phone.

**Live:** https://sujittarun.github.io/MatchPointPride/

A public landing page, then a passcode gate, then four things: batches, reminders,
staff attendance and money.

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
Three things, because that's all a single operator needs to touch from a phone:

- **PIN** — change it, or log out. Default `1234`.
- **Student sheet** — export every student to CSV (opens in Excel, Numbers or Google
  Sheets), edit in the spreadsheet, import it back. Only `Name` and `Batch` are required;
  a student already in that batch is **updated rather than duplicated**, so the
  export → edit → import loop is safe to repeat. Unknown batches are never invented —
  those rows are reported with their row number and the reason. Export with no students
  to get a blank template.
- **Backup & restore** — the full JSON document, and the danger-zone resets.

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

**Arrears go out as one message.** A student two months behind gets a single reminder for
both — *"…fee for June and July comes to ₹4,400"* — not two separate chases. Marking it
paid writes one payment row per month cleared.

Payments carry a `forMonth` separate from their `date`, so someone clearing June's fee in
July settles June while the cash still lands in July's revenue.

Each reminder sends over **WhatsApp** (`wa.me` deep link with the message pre-filled),
SMS or a phone call. Every send is logged: channel, timestamp, and a running send count,
so a reminder that took three nudges says so. The message comes from an editable template
with `{student} {guardian} {amount} {due} {batch} {slot} {academy} {owner}` placeholders.

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

`npm run build` typechecks the whole app. Beyond that the project has been through an
end-to-end regression covering the logic layer (214 assertions over date arithmetic,
money formatting, collection rate, attendance maths, reminder stats, the storage
migration path, arrears/dues derivation and CSV round-tripping) and a UI pass on a 375×812 viewport: negative and
malformed input on every form, referential integrity across deletes, the
member-discontinue flow, corrupt and unreadable saved data, malformed backup and
spreadsheet imports, long-string layout overflow, and the empty state of every screen.

---

## Two things to know before relying on it

**1. Data lives in your browser, on your phone.** GitHub Pages serves static files and has
no server or database, so everything is stored in `localStorage`. Clearing browser data,
using a different phone, or switching from Chrome to Safari means the data isn't there.

> **Download a backup from Settings regularly.** It's a single JSON file and restores onto
> any device. This is the one habit the app depends on.

Every read and write goes through `src/lib/store.tsx`, so moving to a hosted database later
(Supabase, Firebase) is a change to that one file — the rest of the app doesn't know where
its data comes from.

**2. The passcode is not security.** The page is public; the 4-digit code only stops a
casual passer-by on a shared phone. Anyone who knows the URL can reach whatever is stored in
that browser. Real access control needs a backend, which this deliberately doesn't have.

---

## Design

Built phone-first, because that's the only place it gets used: bottom tab bar, bottom-sheet
modals, card lists instead of wide tables, 44px minimum touch targets, 16px inputs so iOS
never zooms on focus, and safe-area insets for notched screens. On a desktop it stays a
centred column rather than stretching — deliberate, not unfinished.

Dark-committed, on a cool near-black (`#141A21`) with a shuttle-lime accent (`#C8FF4D`).
Tokens live in `src/styles/tokens.css`; a light theme would be a token swap, not a rewrite.

**Charts** are hand-rolled SVG — no charting dependency, so the whole app is 77 kB gzipped
with React as the only runtime dependency. The categorical series colours were validated
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

The app opens with a demo dataset so the charts have something to say. When you're ready
for real data, **Settings → Clear demo data and start fresh** wipes it and keeps the six
batches.

Default passcode is **1234** — change it in Settings.

## Layout

```
src/
  lib/          types · localStorage store · derived analytics · date+money helpers · seed
  components/   ui primitives (sheet, stat, confirm) · SVG icons · charts
  pages/        Landing · Dashboard · Batches · Reminders · Staff · Finance · Settings
  styles/       tokens.css · global.css · landing.css
```

No router, charting or UI library — hash routing, SVG charts and CSS are all local.
