begin;

-- Resolve the assigned group player, not the staff member who confirms the seat.
create or replace function transfer_private.seat_transfer_group_key(value text) returns text
language sql immutable set search_path='' as $$
 select lower(translate(regexp_replace(normalize(btrim(coalesce(value,'')),NFD),'[̀-ͯ]','','g'),'đĐ','dd'))
$$;
create or replace function transfer_private.seat_transfer_lead(group_name text) returns text
language sql stable set search_path='' as $$
 with group_keys as (
  select transfer_private.seat_transfer_group_key(group_name) raw_key,
   btrim(regexp_replace(normalize(transfer_private.seat_transfer_group_key(group_name),NFKC),'[^[:alnum:]]+',' ','g')) profile_key
 ), candidates as (
  select distinct r.key,left(btrim(r.payload->>'name'),100) name
  from transfer_private.portal_records organization
  cross join lateral jsonb_each_text(coalesce(organization.payload#>'{data,groupLeads}','{}'::jsonb)) lead
  join transfer_private.portal_records r on r.kind='players' and r.key=lead.value
  cross join group_keys g
  where organization.kind='shared' and organization.key='transferOrganization'
   and g.raw_key not in ('','unknown','solo','not applicable','n/a')
   and lead.key in (g.raw_key,g.profile_key)
   and coalesce(r.payload->>'deleted','false')<>'true' and nullif(r.payload->>'mergedInto','') is null
   and (transfer_private.seat_transfer_group_key(r.payload->>'group')=g.raw_key
    or btrim(regexp_replace(normalize(transfer_private.seat_transfer_group_key(r.payload->>'group'),NFKC),'[^[:alnum:]]+',' ','g'))=g.profile_key)
 ) select case when count(*)=1 then min(name) end from candidates
$$;

create or replace function transfer_private.seat_confirmation_row(k text,p jsonb,rev bigint) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',k,'name',p->>'name','server',p->>'server','currentAlliance',left(btrim(coalesce(p->>'alliance','')),100),
  'transferGroup',p->>'group','transferLead',transfer_private.seat_transfer_lead(p->>'group'),'status',p->>'status','confirmedSeat',case when p->>'confirmedSeat' in ('Gold','Purple','Blue','White') then p->>'confirmedSeat' end,
  'confirmedBy',left(p->>'seatConfirmedBy',100),'confirmerId',p->>'seatConfirmedById','confirmedAt',p->>'seatConfirmedAt','revision',rev)
$$;

revoke all on function transfer_private.seat_transfer_group_key(text),transfer_private.seat_transfer_lead(text),transfer_private.seat_confirmation_row(text,jsonb,bigint) from public,anon,authenticated;
commit;
