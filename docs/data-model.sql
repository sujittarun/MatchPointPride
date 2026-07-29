-- =====================================================================
-- Match Point Pride — what this front-end needs from the database.
--
-- THIS IS NOT A MIGRATION. Do not run it.
--
-- It documents the shape the UI currently relies on, written in SQL so
-- it can be diffed against Academy Manager's existing schema. Where AM
-- already has a table, AM's wins and this one is dropped; where AM has
-- the concept under another name, the mapping goes in the NOTE lines.
--
-- Every table is tenant-scoped. Nothing here should be readable across
-- tenants, so every policy filters on tenant_id.
-- =====================================================================

-- --------------------------------------------------------------- batches
-- NOTE: AM equivalent? (batches / groups / programmes ?)
create table batches (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  name          text not null,
  kind          text not null check (kind in ('kids','professional','membership')),
  slot          text,                    -- '4:30 PM – 5:30 PM'; optional by design
  days          text[],                  -- {'Mon','Tue',...}; optional
  fee           integer not null default 0,   -- paise or rupees? AM's convention wins
  capacity      integer,
  -- Fees are collected per batch. Two batches may share one UPI ID.
  upi_id        text,
  upi_name      text,
  colour_slot   smallint not null default 1,  -- 1-6, chart palette index
  note          text,
  created_at    timestamptz not null default now()
);

-- -------------------------------------------------------------- students
-- NOTE: AM almost certainly has this. Only the extra columns matter.
create table students (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  batch_id      uuid not null references batches(id) on delete restrict,
  name          text not null,
  phone         text,                    -- digits only, no country code
  guardian      text,
  joined_on     date not null,
  monthly_fee   integer not null default 0,
  fee_due_day   smallint not null default 1 check (fee_due_day between 1 and 31),
  active        boolean not null default true,
  note          text
);

-- Membership periods. A student who leaves and returns has two rows, so
-- tenure skips the gap and months away are never billed.
-- NOTE: does AM model enrolment history, or only a single joined_on?
create table student_spells (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  student_id    uuid not null references students(id) on delete cascade,
  from_date     date not null,
  to_date       date                     -- null while still training
);

-- ---------------------------------------------------------- attendance
-- Staff attendance, not student attendance. Two states only.
-- NOTE: AM may already track this, possibly for students too.
create table staff_attendance (
  tenant_id     uuid not null references tenants(id),
  staff_id      uuid not null references staff(id) on delete cascade,
  on_date       date not null,
  status        text not null check (status in ('present','absent')),
  note          text,
  primary key (staff_id, on_date)
);

-- -------------------------------------------------------------- payments
-- NOTE: AM equivalent? (payments / transactions / ledger ?)
create table transactions (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  type          text not null check (type in ('revenue','expense')),
  occurred_on   date not null,           -- when the money actually moved
  -- For a student fee: the month it SETTLES, which is not always the
  -- month it arrived in. June's fee paid in July settles June while the
  -- cash still lands in July's revenue. Dues logic depends on this.
  for_month     date,                    -- first of month, or a YYYY-MM text
  amount        integer not null check (amount > 0),
  category      text not null,
  source        text check (source in ('student_fee','court_booking','membership','other')),
  booking_mode  text check (booking_mode in ('individual','daily','monthly')),
  student_id    uuid references students(id) on delete set null,
  batch_id      uuid references batches(id) on delete set null,
  note          text,
  -- Evidence that the payment happened.
  proof_path    text,                    -- Supabase Storage object path
  verified_by   text check (verified_by in ('screenshot','bank','call','cash')),
  created_at    timestamptz not null default now()
);

-- ------------------------------------------------------------- reminders
-- Derived from unpaid months, never hand-generated. One open fee
-- reminder per student, covering every month they are behind.
create table reminders (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  student_id    uuid not null references students(id) on delete cascade,
  kind          text not null check (kind in ('fee','renewal','attendance','custom')),
  title         text not null,
  message       text,                    -- blank = use the standard template
  due_date      date not null,           -- oldest unpaid month's due date
  amount        integer,
  months        text[],                  -- {'2026-06','2026-07'} — arrears in one ask
  status        text not null check (status in ('pending','sent','paid','cancelled')),
  send_count    integer not null default 0,
  last_sent_at  timestamptz,
  -- Parent says paid, no screenshot yet. Deliberately held open.
  awaiting_proof boolean not null default false,
  proof_path    text,
  created_at    timestamptz not null default now()
);

-- Full audit trail: created / sent / resent / claimed / proof / paid /
-- cancelled / reopened, with the channel used and any screenshot.
create table reminder_events (
  id            bigserial primary key,
  tenant_id     uuid not null references tenants(id),
  reminder_id   uuid not null references reminders(id) on delete cascade,
  at            timestamptz not null default now(),
  action        text not null,
  channel       text check (channel in ('whatsapp','sms','call')),
  note          text,
  proof_path    text
);

-- =====================================================================
-- Screenshots
--
-- Currently in the browser's IndexedDB. These belong in Supabase
-- Storage, one private bucket, path prefixed by tenant so a policy can
-- scope it: payments/<tenant_id>/<reminder_id>/<uuid>.jpg
-- Served via signed URLs; never public.
-- =====================================================================

-- =====================================================================
-- RLS — every table, no exceptions. Sketch only; AM's helper for
-- "which tenant is this user in" replaces current_tenant_id().
-- =====================================================================
-- alter table batches enable row level security;
-- create policy tenant_isolation on batches
--   using (tenant_id = current_tenant_id())
--   with check (tenant_id = current_tenant_id());
