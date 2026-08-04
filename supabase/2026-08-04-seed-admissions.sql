/* ============================================================
   Six students who JOINED in June and July 2026.

   Why this file exists: `mpp` has 4 months of payments and every single
   Coaching row is kind='renewal'. There has never been an admission,
   so Finance's "New admissions" slice had nothing to draw and the
   breakdown only ever showed Renewals and Court bookings.

   THE HOUSE RULE IS OBSERVED. This file invents names and dates. It does
   NOT invent an amount: every figure comes from resolve_fee() and every
   payment goes through record_fee_payment(), the one write path, which
   rolls renewal_on forward, writes the period the money covers and
   closes the reminder. Nothing is inserted into `payments` directly, and
   if the fee chain has no answer for a batch this file raises rather
   than picking a number that looks about right.

   Tenant-scoped throughout: every insert names 'mpp', and centre 90 /
   sport 'badminton' / batches 322-326 are all mpp's own rows.

   June joiners also renew in July, so nobody lands in the demo already
   overdue — a first payment alone would leave renewal_on in the past and
   fill the Reminders tab with students who exist only to colour a chart.

   Every member carries notes = 'seed:2026-08-04' so these six can be
   removed exactly, without guessing from names.
   ============================================================ */

do $$
declare
  v_member bigint;
  v_enrol  bigint;
  v_chain  jsonb;
  v_fee    numeric;
  r        record;
  n_paid   int := 0;
begin
  for r in
    select * from (values
      ('Aarav Reddy',   'Sridhar Reddy', '9848011201', date '2026-06-03', 322::bigint),
      ('Diya Sharma',   'Meena Sharma',  '9848011202', date '2026-06-11', 323::bigint),
      ('Vihaan Rao',    'Kiran Rao',     '9848011203', date '2026-06-22', 326::bigint),
      ('Ananya Iyer',   'Lakshmi Iyer',  '9848011204', date '2026-07-02', 324::bigint),
      ('Kabir Menon',   'Rajesh Menon',  '9848011205', date '2026-07-14', 322::bigint),
      ('Saanvi Nair',   'Deepa Nair',    '9848011206', date '2026-07-25', 325::bigint)
    ) as t(name, parent, phone, joined, batch)
  loop
    insert into members (tenant_id, name, program, joined, status, venue,
                         parent_name, parent_phone, whatsapp_status, notes)
    values ('mpp', r.name, 'badminton', r.joined, 'active', 'narsingi',
            r.parent, r.phone, 'active', 'seed:2026-08-04')
    returning id into v_member;

    /* renewal_on starts AT the joining date: the first fee is due the day
       they join, and record_fee_payment is what moves it forward. Setting
       it a month ahead here would be this file deciding a renewal date,
       which is the roll-forward's job. */
    insert into enrollments (tenant_id, member_id, centre_id, batch_id, sport,
                             plan_months, joined_on, renewal_on, status, notes)
    values ('mpp', v_member, 90, r.batch, 'badminton', 1,
            r.joined, r.joined, 'active', 'seed:2026-08-04')
    returning id into v_enrol;

    /* resolve_fee returns the whole decision, not a number:
       {label, amount, monthly, source, rule_id, admission_fee}. Reading
       ->>'amount' keeps the price the chain's answer — the alternative,
       hardcoding 2000 here, is exactly the thing the house rule forbids
       and would silently disagree with the app the day a fee changes. */
    v_chain := resolve_fee('mpp', v_member, 90, 'badminton', r.batch, 1);
    v_fee := (v_chain->>'amount')::numeric;
    if v_fee is null or v_fee <= 0 then
      raise exception
        'resolve_fee gave no usable amount for batch % (%) — refusing to invent a price',
        r.batch, v_chain;
    end if;

    -- The joining payment. p_kind = 'admission' is the whole point.
    perform record_fee_payment('mpp', v_enrol, v_fee, 1, 'UPI', 'admission', r.joined);
    n_paid := n_paid + 1;

    if r.joined < date '2026-07-01' then
      perform record_fee_payment(
        'mpp', v_enrol, v_fee, 1, 'UPI', 'renewal', (r.joined + interval '1 month')::date);
      n_paid := n_paid + 1;
    end if;
  end loop;

  raise notice 'seeded 6 joiners, % payments', n_paid;
end $$;

/* Prove it landed where Finance reads from, in the same shape the
   breakdown groups by. Six admissions across June and July, or this file
   did not do what it says. */
do $$
declare
  n_jun int;
  n_jul int;
begin
  select count(*) into n_jun from payments
   where tenant_id='mpp' and kind='admission' and on_date >= date '2026-06-01'
     and on_date < date '2026-07-01';
  select count(*) into n_jul from payments
   where tenant_id='mpp' and kind='admission' and on_date >= date '2026-07-01'
     and on_date < date '2026-08-01';

  if n_jun <> 3 or n_jul <> 3 then
    raise exception 'expected 3 June and 3 July admissions, got % and %', n_jun, n_jul;
  end if;
  raise notice 'verified: % admissions in June, % in July', n_jun, n_jul;
end $$;
