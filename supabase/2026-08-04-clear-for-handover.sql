/* ============================================================
   Empty `mpp` of its demo data, ready to hand to the owner.

   Everything here is IRREVERSIBLE in normal use, so it is arranged so
   that it cannot half-happen:

   · The backup is taken in the SAME TRANSACTION as the deletion, and
     asserted non-empty before a single row is removed. If the snapshot
     is short, the whole thing rolls back and nothing is lost.
   · Every statement names tenant_id = 'mpp'. Ids are global on this
     platform: `delete from payments where kind = 'admission'` would
     empty five other academies. This is platform rule 2 and it is the
     rule this file exists to obey.
   · Other tenants' row counts are captured before and compared after.
     Any drift raises and rolls everything back.

   WHAT GOES: students, their enrolments, every payment and expense,
   staff, attendance, batches, fee rules, and the reminder/timeline
   history hanging off them.

   WHAT STAYS, on purpose:
     tenants      the mpp row itself — UPI id, payee, module flags
     centres      the Pride venue
     sports       badminton
     subscriptions the billing row the operator console reads
     audit_log / events / sync_log / error_acks
                  operational history. Not academy data, and wiping an
                  audit trail to tidy a demo is not tidying.

   backup.take_snapshot() covers 13 tables but NOT member_timeline or
   wa_flow_events, so those two are snapshotted by hand below — a
   backup that silently omits two of the tables being deleted is worse
   than no backup, because it is trusted.
   ============================================================ */

do $$
declare
  snap_before int;
  snap_after  int;
  others_before jsonb;
  others_after  jsonb;
  n int;
begin
  /* ---- 0. what the other five tenants hold, before ---- */
  select jsonb_object_agg(k, v) into others_before from (
    select 'members' k, count(*) v from members where tenant_id <> 'mpp'
    union all select 'enrollments', count(*) from enrollments where tenant_id <> 'mpp'
    union all select 'payments', count(*) from payments where tenant_id <> 'mpp'
    union all select 'expenses', count(*) from expenses where tenant_id <> 'mpp'
    union all select 'coaches', count(*) from coaches where tenant_id <> 'mpp'
    union all select 'attendance', count(*) from attendance where tenant_id <> 'mpp'
    union all select 'batches', count(*) from batches where tenant_id <> 'mpp'
    union all select 'fee_rules', count(*) from fee_rules where tenant_id <> 'mpp'
    union all select 'member_timeline', count(*) from member_timeline where tenant_id <> 'mpp'
    union all select 'reminder_events', count(*) from reminder_events where tenant_id <> 'mpp'
  ) x;

  /* ---- 1. back up, and prove it landed ---- */
  select count(*) into snap_before from backup.snapshots;
  perform backup.take_snapshot();

  insert into backup.snapshots (table_name, row_count, rows)
  select 'member_timeline', count(*), coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
  from public.member_timeline x;

  insert into backup.snapshots (table_name, row_count, rows)
  select 'wa_flow_events', count(*), coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
  from public.wa_flow_events x;

  select count(*) into snap_after from backup.snapshots;
  if snap_after - snap_before < 13 then
    raise exception 'snapshot wrote only % table(s) — refusing to delete anything',
      snap_after - snap_before;
  end if;

  -- and that mpp's own rows are actually IN it, not just some rows
  if not exists (
    select 1 from backup.snapshots s
    where s.table_name = 'members'
      and s.rows @> '[{"tenant_id":"mpp"}]'::jsonb
      and s.taken_at > now() - interval '5 minutes'
  ) then
    raise exception 'the fresh snapshot does not contain mpp members — refusing to delete';
  end if;

  /* ---- 2. delete, children first, every statement tenant-scoped ---- */
  delete from wa_flow_events   where tenant_id = 'mpp';  get diagnostics n = row_count;
  raise notice 'wa_flow_events   %', n;
  delete from reminder_events  where tenant_id = 'mpp';  get diagnostics n = row_count;
  raise notice 'reminder_events  %', n;
  delete from member_timeline  where tenant_id = 'mpp';  get diagnostics n = row_count;
  raise notice 'member_timeline  %', n;
  delete from payments         where tenant_id = 'mpp';  get diagnostics n = row_count;
  raise notice 'payments         %', n;
  delete from expenses         where tenant_id = 'mpp';  get diagnostics n = row_count;
  raise notice 'expenses         %', n;
  delete from attendance       where tenant_id = 'mpp';  get diagnostics n = row_count;
  raise notice 'attendance       %', n;
  delete from enrollments      where tenant_id = 'mpp';  get diagnostics n = row_count;
  raise notice 'enrollments      %', n;
  delete from fee_rules        where tenant_id = 'mpp';  get diagnostics n = row_count;
  raise notice 'fee_rules        %', n;
  delete from members          where tenant_id = 'mpp';  get diagnostics n = row_count;
  raise notice 'members          %', n;
  delete from batches          where tenant_id = 'mpp';  get diagnostics n = row_count;
  raise notice 'batches          %', n;
  delete from coaches          where tenant_id = 'mpp';  get diagnostics n = row_count;
  raise notice 'coaches          %', n;

  /* ---- 3. prove mpp is empty ---- */
  if (select count(*) from members     where tenant_id='mpp') <> 0
  or (select count(*) from enrollments where tenant_id='mpp') <> 0
  or (select count(*) from payments    where tenant_id='mpp') <> 0
  or (select count(*) from expenses    where tenant_id='mpp') <> 0
  or (select count(*) from coaches     where tenant_id='mpp') <> 0
  or (select count(*) from attendance  where tenant_id='mpp') <> 0
  or (select count(*) from batches     where tenant_id='mpp') <> 0
  then
    raise exception 'mpp is not empty after the delete';
  end if;

  /* ---- 4. prove nobody else was touched ---- */
  select jsonb_object_agg(k, v) into others_after from (
    select 'members' k, count(*) v from members where tenant_id <> 'mpp'
    union all select 'enrollments', count(*) from enrollments where tenant_id <> 'mpp'
    union all select 'payments', count(*) from payments where tenant_id <> 'mpp'
    union all select 'expenses', count(*) from expenses where tenant_id <> 'mpp'
    union all select 'coaches', count(*) from coaches where tenant_id <> 'mpp'
    union all select 'attendance', count(*) from attendance where tenant_id <> 'mpp'
    union all select 'batches', count(*) from batches where tenant_id <> 'mpp'
    union all select 'fee_rules', count(*) from fee_rules where tenant_id <> 'mpp'
    union all select 'member_timeline', count(*) from member_timeline where tenant_id <> 'mpp'
    union all select 'reminder_events', count(*) from reminder_events where tenant_id <> 'mpp'
  ) y;

  if others_before <> others_after then
    raise exception 'ANOTHER TENANT CHANGED. before=% after=%', others_before, others_after;
  end if;

  /* ---- 5. and that the venue itself survived ---- */
  if (select count(*) from centres where tenant_id='mpp') = 0
  or (select count(*) from sports  where tenant_id='mpp') = 0
  or (select count(*) from tenants where id='mpp') = 0
  then
    raise exception 'the venue, sport or tenant row was removed — it should not have been';
  end if;

  raise notice 'mpp cleared; other tenants unchanged: %', others_after;
end $$;
