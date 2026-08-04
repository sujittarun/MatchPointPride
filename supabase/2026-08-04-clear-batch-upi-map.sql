/* ============================================================
   Drop the per-batch UPI map, whose batches no longer exist.

   `config.billing.upiByBatch` still named kids-batch-a..d,
   professional-squad and membership after the handover clear-out
   removed all seven batches. Harmless in practice — resolve_upi() walks
   batch -> centre -> tenant and simply falls through to the academy
   account when a code does not match — but it is config describing rows
   that are gone, handed to a new owner. That is exactly the kind of
   residue that reads as meaningful six months later.

   The tenant account itself is untouched: billing.upiIds and
   billing.payee stay, so resolve_upi keeps answering
   7732077327@ybl / Match Point Badminton Academy.

   OBJECT MERGE, not jsonb_set. `jsonb_set(..., create_missing => true)`
   only creates the FINAL key of a path, so setting
   {billing,upiByBatch} on a config whose `billing` was absent would
   silently do nothing and report success. That exact mistake took Raj's
   public timetable down for four minutes (migration 0004). Merging an
   object cannot half-apply, and the assertion below is what proves it.
   ============================================================ */

update tenants
   set config = config || jsonb_build_object(
         'billing', coalesce(config->'billing', '{}'::jsonb) || jsonb_build_object('upiByBatch', '{}'::jsonb)
       )
 where id = 'mpp';

do $$
declare
  c jsonb;
begin
  select config into c from tenants where id = 'mpp';

  if c->'billing'->'upiByBatch' <> '{}'::jsonb then
    raise exception 'upiByBatch was not cleared: %', c->'billing'->'upiByBatch';
  end if;

  -- The parts that must survive, because money collection depends on them.
  if coalesce(c->'billing'->'upiIds'->>0, '') = '' then
    raise exception 'billing.upiIds was lost — the academy could not be paid';
  end if;
  if coalesce(c->'billing'->>'payee', '') = '' then
    raise exception 'billing.payee was lost';
  end if;
  if (select resolve_upi('mpp', null::bigint, null::bigint)->>'vpa') is null then
    raise exception 'resolve_upi no longer answers for mpp';
  end if;

  raise notice 'upiByBatch cleared; resolve_upi still answers %',
    (select resolve_upi('mpp', null::bigint, null::bigint)->>'vpa');
end $$;
