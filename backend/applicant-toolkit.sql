-- Automatic checks start at installation; existing applications are not backfilled.
begin;
create table if not exists transfer_private.toolkit_lookup_config (
 singleton boolean primary key default true check(singleton), enabled_at timestamptz not null default clock_timestamp()
);
alter table transfer_private.toolkit_lookup_config enable row level security;
revoke all on transfer_private.toolkit_lookup_config from public,anon,authenticated;
insert into transfer_private.toolkit_lookup_config(singleton) values(true) on conflict do nothing;

create or replace function public.transfer_portal_toolkit_candidates(actor_email text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_email text; allowed boolean;
begin
 select admin_email into owner_email from transfer_private.portal_control where singleton;
 select actor_email=owner_email or exists(select 1 from transfer_private.portal_records where kind='access' and key=actor_email
  and payload->>'status'='active' and payload->>'role'='lead') into allowed;
 if not coalesce(allowed,false) then raise exception 'Administrator or transfer lead access is required';end if;
 return (select coalesce(jsonb_agg(key order by key),'[]'::jsonb) from transfer_private.portal_records p
 where p.kind='players' and coalesce(p.payload->>'deleted','false')<>'true'
  and coalesce(p.payload->>'general','false')<>'true' and coalesce(p.payload->>'prospect','false')<>'true'
  and coalesce(p.payload->>'transferDirection','')='' and coalesce(p.payload->>'mergedInto','')=''
  and coalesce(p.payload->>'status','') not in ('Withdrawn','Declined','Rejected','Transferred')
  and exists(select 1 from transfer_private.applications a cross join transfer_private.toolkit_lookup_config cfg
   where a.created_at>=cfg.enabled_at and (a.id=p.payload->>'applicationId' or coalesce(p.payload->'applicationIds','[]'::jsonb)?a.id))
  and (p.payload->'lwToolkitCheck' is null
   or p.payload->'lwToolkitCheck'->'inputs' is distinct from jsonb_build_object('uid',coalesce(p.payload->>'sourceUid',''),'server',coalesce(p.payload->>'server',''),'name',coalesce(p.payload->>'name',''))
   or (p.payload->'lwToolkitCheck'->>'status'='source-error' and coalesce(p.payload->'lwToolkitCheck'->>'blocked','false')<>'true'
    and (p.payload->'lwToolkitCheck'->>'attempts')::integer<3 and (p.payload->'lwToolkitCheck'->>'retryAfter')::timestamptz<=clock_timestamp())));
end $$;
revoke all on function public.transfer_portal_toolkit_candidates(text) from public,anon,authenticated;
grant execute on function public.transfer_portal_toolkit_candidates(text) to service_role;
commit;
