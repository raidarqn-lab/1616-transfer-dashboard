begin;
-- Only a small ALT flag is exposed to alliance/messenger projections. Main/alt
-- links remain private and are never inferred from names or ownership history.
create or replace function transfer_private.player_is_alt(player_key text,p jsonb) returns boolean
language sql stable security definer set search_path='' as $$
 with recursive edges as (
  select l->>'a' a,l->>'b' b,l->>'mainId' main_id
  from transfer_private.portal_records r cross join lateral jsonb_array_elements(coalesce(r.payload->'data','[]'::jsonb)) l
  where r.kind='shared' and r.key='accountLinks' and l->>'type'='alt' and l->>'a' is not null and l->>'b' is not null
 ), component(id) as (
  select player_key union
  select case when e.a=c.id then e.b else e.a end from component c join edges e on e.a=c.id or e.b=c.id
 ), mains as (
  select distinct e.main_id from edges e where e.a in (select id from component) and e.b in (select id from component) and e.main_id in (select id from component)
 ) select case when (select count(*) from mains)=1 then player_key<>(select min(main_id) from mains) else coalesce(p->'isAlt'='true'::jsonb,false) end
$$;
revoke all on function transfer_private.player_is_alt(text,jsonb) from public,anon,authenticated;
-- Extend existing allowlists without replacing later access/security changes.
do $$
declare target text;definition text;marker text;addition text;
begin
 foreach target in array array['transfer_private.welcome_roster(text)','transfer_private.leadership_report_action(text,jsonb)','transfer_private.seat_confirmation_row(text,jsonb,bigint)','transfer_private.applicant_messenger_details(text,jsonb)'] loop
  select pg_get_functiondef(target::regprocedure) into definition;
  if position($field$'isAlt'$field$ in definition)>0 then continue;end if;
  if target='transfer_private.welcome_roster(text)' then
   marker:=$m$'id',p.key$m$;addition:=$a$'isAlt',coalesce(transfer_private.player_is_alt(p.key,p.payload),false),$a$;
  elsif target='transfer_private.leadership_report_action(text,jsonb)' then
   marker:=$m$'transferDirection',payload->>'transferDirection'$m$;addition:=$a$'isAlt',coalesce(transfer_private.player_is_alt(portal_records.key,payload),false),$a$;
  elsif target='transfer_private.seat_confirmation_row(text,jsonb,bigint)' then
   marker:=$m$'id',k$m$;addition:=$a$'isAlt',coalesce(transfer_private.player_is_alt(k,p),false),$a$;
  else
   marker:=$m$'server',p->>'server'$m$;addition:=$a$'isAlt',coalesce(transfer_private.player_is_alt(player_key,p),false),$a$;
  end if;
  if position(marker in definition)=0 then raise exception 'Unexpected ALT projection definition: %',target;end if;
  execute replace(definition,marker,addition||marker);
 end loop;
end $$;
commit;
