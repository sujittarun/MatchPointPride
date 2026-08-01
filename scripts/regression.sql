-- ============================================================
-- This harness writes to SHARED tables. It refuses to run on
-- production, where a failed rollback is a data incident for
-- every academy — not just this one. (0040)
-- ============================================================
select assert_test_environment();

-- End-to-end regression for tenant mpp, against LIVE data.
-- Everything happens inside one transaction and the final RAISE rolls
-- the whole lot back, so no real row is left changed.
do $$
declare
  v_centre bigint; v_batch bigint; v_sport text := 'badminton';
  m_paid bigint; m_unpaid bigint; m_sib bigint; m_left bigint;
  e_id bigint; e2_id bigint; pay jsonb; res jsonb; r record;
  today date := ist_today();
  fails text[] := '{}';
  notes text[] := '{}';
  n int; ok boolean; tmp text;
begin
  select id into v_centre from centres where tenant_id='mpp' order by id limit 1;
  select id into v_batch  from batches where tenant_id='mpp' and active order by id limit 1;

  -- ============ helper ============
  -- (inline asserts; each appends to fails on mismatch)

  -- ============ A. resolve_fee, the seven-level chain ============
  res := resolve_fee('mpp', null, v_centre, v_sport, v_batch, 1, null);
  if (res->>'amount') is null then fails := array_append(fails, 'A1 batch rate resolved null'); end if;
  notes := array_append(notes, ('A1 batch rate = ' || (res->>'amount') || ' via ' || (res->>'source')));

  res := resolve_fee('mpp', null, v_centre, v_sport, v_batch, 1, 4321);
  if (res->>'amount')::numeric <> 4321 then fails := array_append(fails, 'A2 custom override ignored'); end if;
  if (res->>'source') <> 'custom' then fails := array_append(fails, 'A2 custom not flagged as custom'); end if;

  -- an explicit zero must be honoured as zero, not treated as "unset"
  res := resolve_fee('mpp', null, v_centre, v_sport, v_batch, 1, 0);
  if (res->>'amount')::numeric <> 0 then fails := array_append(fails, 'A3 explicit 0 fee not honoured'); end if;

  -- plan months multiply
  res := resolve_fee('mpp', null, v_centre, v_sport, v_batch, 3, null);
  notes := array_append(notes, ('A4 three months = ' || (res->>'amount')));

  -- ============ B. create a student the way the app does ============
  insert into members (tenant_id,name,parent_name,parent_phone,program,joined,status,venue)
  values ('mpp','ZZ Paid','P','9000000001','badminton',today,'active','narsingi') returning id into m_paid;
  insert into enrollments (tenant_id,member_id,centre_id,batch_id,sport,plan_months,joined_on,renewal_on,status)
  values ('mpp',m_paid,v_centre,v_batch,v_sport,1,today,today + 30,'active') returning id into e_id;

  if (select count(*) from members where id=m_paid and status='active') <> 1
    then fails := array_append(fails, 'B1 member not created active'); end if;

  -- ============ C. record_fee_payment is the one write path ============
  pay := record_fee_payment('mpp', e_id, 2000, 1, 'UPI', 'renewal', today, null, 'paid', 'regression', 'regression');
  if pay->>'payment_id' is null then fails := array_append(fails, 'C1 no payment id returned'); end if;

  select renewal_on into tmp from enrollments where id=e_id;
  if tmp::date <= today + 30 then fails := array_append(fails, ('C2 renewal did not roll forward: ' || tmp)); end if;
  notes := array_append(notes, ('C2 renewal rolled to ' || tmp));

  select count(*) into n from payments where id=(pay->>'payment_id')::bigint and period_from is not null;
  if n <> 1 then fails := array_append(fails, 'C3 payment written without the period it covers'); end if;

  select count(*) into n from member_timeline where member_id=m_paid and kind='payment';
  if n < 1 then fails := array_append(fails, 'C4 payment wrote no timeline row'); end if;

  -- paying early must extend from the RENEWAL, never from today
  select renewal_on into tmp from enrollments where id=e_id;
  pay := record_fee_payment('mpp', e_id, 2000, 1, 'UPI', 'renewal', today, null, 'paid', 'regression', 'regression2');
  if (select renewal_on from enrollments where id=e_id) <= tmp::date
    then fails := array_append(fails, 'C5 a second payment did not extend the cycle'); end if;

  -- ============ D. void reverses ============
  perform void_payment('mpp', (pay->>'payment_id')::bigint, 'regression');
  select status into tmp from payments where id=(pay->>'payment_id')::bigint;
  if tmp = 'paid' then fails := array_append(fails, 'D1 voided payment still reads paid'); end if;
  notes := array_append(notes, ('D1 voided payment status = ' || coalesce(tmp,'null')));

  -- ============ E. the chase ladder, rung by rung ============
  -- one student per offset, then ask reminder_queue which it returns
  for n in select unnest(array[-3,-2,-1,0,1,4,5,6,7,14,15,20]) loop
    -- A FIXED-WIDTH phone. It used to be '90000100'||abs(n), which is ten
    -- digits for a two-digit offset and NINE for a single-digit one — and
    -- reminder_queue blocks anything under ten as 'missing_phone'. So rungs
    -- -2, 0, +5 and +7 were being asserted present while silently blocked,
    -- and the ladder assertions below passed without ever proving that the
    -- rungs which must SEND actually can.
    insert into members (tenant_id,name,parent_phone,program,joined,status,venue)
    values ('mpp','ZZ Rung '||n,'90000'||lpad(abs(n)::text,5,'0'),'badminton',today-60,'active','narsingi')
    returning id into m_unpaid;
    insert into enrollments (tenant_id,member_id,centre_id,batch_id,sport,plan_months,joined_on,renewal_on,status)
    values ('mpp',m_unpaid,v_centre,v_batch,v_sport,1,today-60,today - n,'active');
  end loop;

  for r in
    select q.days_since, q.stage, q.blocked_reason
      from reminder_queue('mpp') q join members m on m.id=q.member_id
     where m.name like 'ZZ Rung %'
  loop
    notes := array_append(notes, ('E rung +' || r.days_since || ' -> ' || r.stage ||
                       coalesce(' [' || r.blocked_reason || ']','')));
  end loop;

  -- the rungs that MUST appear
  select count(*) into n from reminder_queue('mpp') q join members m on m.id=q.member_id
   where m.name like 'ZZ Rung %' and q.days_since in (-2,0,5,7,14,15,20);
  if n <> 7 then fails := array_append(fails, ('E1 expected 7 rungs to fire, got ' || n)); end if;

  -- the gaps that must stay silent
  select count(*) into n from reminder_queue('mpp') q join members m on m.id=q.member_id
   where m.name like 'ZZ Rung %' and q.days_since in (-3,-1,1,4,6);
  if n <> 0 then fails := array_append(fails, ('E2 a silent day fired: ' || n || ' rows')); end if;

  -- past +15 must be blocked, not sendable
  select count(*) into n from reminder_queue('mpp') q join members m on m.id=q.member_id
   where m.name like 'ZZ Rung %' and q.days_since >= 15 and q.blocked_reason <> 'overdue_15_days';
  if n <> 0 then fails := array_append(fails, 'E3 a 15+ day row was not blocked'); end if;

  -- ...and everything BELOW +15 must be genuinely sendable. Appearing in
  -- the queue is not the same as going out: a blocked row is returned so
  -- the owner can see why it is stuck, and sends nothing. Counting rows
  -- cannot tell those apart, which is how the fixture bug above hid.
  select count(*) into n from reminder_queue('mpp') q join members m on m.id=q.member_id
   where m.name like 'ZZ Rung %' and q.days_since in (-2,0,5,7,14) and q.blocked_reason is not null;
  if n <> 0 then fails := array_append(fails, ('E4 ' || n || ' sendable rung(s) blocked')); end if;

  -- ============ F. blocked reasons ============
  insert into members (tenant_id,name,parent_phone,program,joined,status,venue)
  values ('mpp','ZZ NoPhone',null,'badminton',today-60,'active','narsingi') returning id into m_sib;
  insert into enrollments (tenant_id,member_id,centre_id,batch_id,sport,plan_months,joined_on,renewal_on,status)
  values ('mpp',m_sib,v_centre,v_batch,v_sport,1,today-60,today,'active');
  select blocked_reason into tmp from reminder_queue('mpp') q join members m on m.id=q.member_id
   where m.name='ZZ NoPhone';
  if tmp is distinct from 'missing_phone' then fails := array_append(fails, ('F1 no-phone not blocked: ' || coalesce(tmp,'null'))); end if;

  -- ============ G. logging a manual send ============
  select e.id into e2_id from enrollments e join members m on m.id=e.member_id
   where m.name='ZZ Rung 0' limit 1;
  perform log_manual_reminder('mpp', e2_id, 'due', 2000, '9000010000', 'test body', 'whatsapp', 'regression');
  select already_sent into ok from reminder_queue('mpp') q where q.enrollment_id=e2_id;
  if not ok then fails := array_append(fails, 'G1 already_sent still false after logging a send'); end if;

  -- one per enrolment per IST day is a hard guard
  begin
    perform log_manual_reminder('mpp', e2_id, 'due', 2000, '9000010000', 'again', 'whatsapp', 'regression');
    -- some builds upsert rather than raise; check we did not get two
    select count(*) into n from reminder_events where enrollment_id=e2_id and ist_date=today and status <> 'void';
    if n > 1 then fails := array_append(fails, ('G2 two reminder rows in one day: ' || n)); end if;
  exception when others then
    notes := array_append(notes, 'G2 second send in a day refused (unique index)');
  end;

  -- ============ H. leaving and coming back ============
  select count(*) into n from members where tenant_id='mpp' and status in ('active','due');
  notes := array_append(notes, ('H0 active before = ' || n));

  res := discontinue_member('mpp', m_paid, today, 'regression');
  if (res->>'enrollments_closed')::int < 1 then fails := array_append(fails, 'H1 discontinue closed nothing'); end if;
  if (select status from members where id=m_paid) <> 'discontinued' then fails := array_append(fails, 'H2 member not discontinued'); end if;
  if (select count(*) from enrollments where member_id=m_paid and status='active') <> 0
    then fails := array_append(fails, 'H3 a live enrolment survived discontinue'); end if;

  -- idempotent: a second call must not error or double-log
  res := discontinue_member('mpp', m_paid, today, 'regression again');
  if (res->>'enrollments_closed')::int <> 0 then fails := array_append(fails, 'H4 discontinue not idempotent'); end if;

  -- gone from the chase list entirely
  select count(*) into n from reminder_queue('mpp') q where q.member_id=m_paid;
  if n <> 0 then fails := array_append(fails, 'H5 a discontinued student is still being chased'); end if;

  -- come back
  res := reenroll_member('mpp', m_paid, v_centre, v_batch, v_sport, today, today+10, 1, null);
  if res->>'enrollment_id' is null then fails := array_append(fails, 'H6 reenroll returned no enrolment'); end if;
  if (select status from members where id=m_paid) <> 'active' then fails := array_append(fails, 'H7 member not active again'); end if;
  if (select discontinued_on from members where id=m_paid) is not null
    then fails := array_append(fails, 'H8 discontinued_on not cleared on return'); end if;
  if (select count(*) from enrollments where member_id=m_paid) < 2
    then fails := array_append(fails, 'H9 return did not create a second spell'); end if;

  -- one member, two spells: history intact
  select count(*) into n from payments where member_id=m_paid;
  notes := array_append(notes, ('H10 payments still attached after the round trip = ' || n));

  -- the guard: no second live enrolment
  begin
    perform reenroll_member('mpp', m_paid, v_centre, v_batch, v_sport, today, today+10, 1, null);
    fails := array_append(fails, 'H11 a SECOND live enrolment was allowed');
  exception when others then
    notes := array_append(notes, 'H11 second live enrolment refused, as designed');
  end;

  -- ============ report and roll everything back ============
  raise exception 'REGRESSION % | failures: % | notes: %',
    case when array_length(fails,1) is null then 'PASS' else 'FAIL' end,
    coalesce(array_to_string(fails,' ;; '), 'none'),
    array_to_string(notes,' ;; ');
end $$;
