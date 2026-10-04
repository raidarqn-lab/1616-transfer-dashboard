begin;
create or replace function public.nova_toolkit_contacts(args jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare result jsonb;
begin
 -- Calls the existing protected review path; no separate role/access model.
 perform public.nova_matching_store('review-draft',jsonb_build_object('staffEmail',args->>'staffEmail','batchId',args->>'batchId'));
 if jsonb_typeof(args->'uids') is distinct from 'array' then raise exception 'Invalid Toolkit identities'; end if;
 if jsonb_array_length(args->'uids') not between 1 and 500 or exists(
  select 1 from jsonb_array_elements(args->'uids') value
  where jsonb_typeof(value)<>'string' or value#>>'{}' !~ '^[0-9]{1,30}$'
 ) then raise exception 'Invalid Toolkit identities'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'key',p.key,'sourceUid',p.payload->>'sourceUid','name',p.payload->>'name',
  'previousGameNames',(select coalesce(jsonb_agg(n.name order by n.name),'[]'::jsonb) from (
   select distinct case when jsonb_typeof(value)='object' then value->>'name' when jsonb_typeof(value)='string' then value#>>'{}' end name
   from jsonb_array_elements(case when jsonb_typeof(p.payload->'previousGameNames')='array' then p.payload->'previousGameNames' else '[]'::jsonb end)
  ) n where nullif(trim(n.name),'') is not null),
  'aliases',(select coalesce(jsonb_agg(n.name order by n.name),'[]'::jsonb) from (
   select distinct case when jsonb_typeof(value)='object' then value->>'name' when jsonb_typeof(value)='string' then value#>>'{}' end name
   from jsonb_array_elements(case when jsonb_typeof(p.payload->'aliases')='array' then p.payload->'aliases' else '[]'::jsonb end)
  ) n where nullif(trim(n.name),'') is not null)
 ) order by p.payload->>'sourceUid',p.key),'[]'::jsonb) into result
 from transfer_private.portal_records p
 where p.kind='players' and coalesce(p.payload->>'deleted','false')<>'true'
 and p.payload->>'sourceUid' in (select jsonb_array_elements_text(args->'uids'));
 return result;
end $function$;
revoke all on function public.nova_toolkit_contacts(jsonb) from public,anon,authenticated;
grant execute on function public.nova_toolkit_contacts(jsonb) to service_role;
comment on function public.nova_toolkit_contacts(jsonb) is 'Server-only, review-authorized exact LW UID lookup; returns names and aliases only. No profile mutation or name-based identity inference.';
commit;
