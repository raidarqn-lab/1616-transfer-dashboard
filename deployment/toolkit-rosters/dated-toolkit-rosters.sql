begin;
create table if not exists nova_evidence_private.toolkit_roster_snapshots (
 server integer not null check(server>0),
 tag text not null check(length(tag) between 1 and 100 and tag=trim(tag)),
 retrieved_at timestamptz not null,
 response_sha256 text not null check(response_sha256 ~ '^[a-f0-9]{64}$'),
 roster jsonb not null,
 published_at timestamptz not null default now(),
 published_by text not null,
 primary key(server,tag,retrieved_at)
);
create unique index if not exists toolkit_roster_snapshot_scope_time on nova_evidence_private.toolkit_roster_snapshots(server,lower(tag),retrieved_at);
revoke all on nova_evidence_private.toolkit_roster_snapshots from public,anon,authenticated;
alter table nova_evidence_private.toolkit_roster_snapshots enable row level security;

create or replace function public.nova_toolkit_rosters(action text,args jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare r jsonb; s jsonb; result jsonb:='[]'::jsonb; owner_email text; stamp timestamptz; existing_hash text; source_count integer;
begin
 if action='publish' then
  select admin_email into owner_email from transfer_private.portal_control where singleton;
  if nullif(lower(args->>'staffEmail'),'') is distinct from lower(owner_email) or owner_email is null then raise exception 'Only the portal owner can publish Toolkit rosters';end if;
  if jsonb_typeof(args->'rosters') is distinct from 'array' then raise exception 'Invalid roster export';end if;
  if jsonb_array_length(args->'rosters') not between 1 and 10 then raise exception 'Invalid roster export';end if;
  for r in select value from jsonb_array_elements(args->'rosters') loop
   if r->>'dataset' is distinct from 'alliance-roster' or jsonb_typeof(r->'rows') is distinct from 'array'
    or coalesce(r#>>'{effectiveContext,warzone}','') !~ '^[0-9]{1,6}$'
    or length(coalesce(r#>>'{effectiveContext,alliance}','')) not between 1 and 100
    or coalesce(r->>'responseSha256','') !~ '^[a-f0-9]{64}$' then raise exception 'Invalid roster export';end if;
   stamp:=(r->>'retrievedAt')::timestamptz; source_count:=jsonb_array_length(r->'rows');
   if stamp is null or stamp>now()+interval '5 minutes' or source_count not between 1 and 150
    or coalesce((r->>'reportedCount')::integer,-1)<>source_count then raise exception 'Invalid roster dates or count';end if;
   if exists(select 1 from jsonb_array_elements(r->'rows') m where jsonb_typeof(m->'uid') is distinct from 'string' or coalesce(m->>'uid','') !~ '^[0-9]{1,30}$' or nullif(trim(m->>'name'),'') is null
     or m->>'alliance' is distinct from r#>>'{effectiveContext,alliance}')
    or (select count(distinct m->>'uid') from jsonb_array_elements(r->'rows') m)<>source_count then raise exception 'Invalid roster identities';end if;
   perform pg_advisory_xact_lock(hashtextextended('toolkit-roster:'||(r#>>'{effectiveContext,warzone}')||':'||lower(r#>>'{effectiveContext,alliance}'),0));
   select response_sha256 into existing_hash from nova_evidence_private.toolkit_roster_snapshots where server=(r#>>'{effectiveContext,warzone}')::integer and lower(tag)=lower(r#>>'{effectiveContext,alliance}') and retrieved_at=stamp;
   if found and existing_hash<>r->>'responseSha256' then raise exception 'Different source data already exists for this retrieval date';end if;
   insert into nova_evidence_private.toolkit_roster_snapshots(server,tag,retrieved_at,response_sha256,roster,published_by)
    values((r#>>'{effectiveContext,warzone}')::integer,r#>>'{effectiveContext,alliance}',stamp,r->>'responseSha256',r,lower(args->>'staffEmail')) on conflict do nothing;
   result:=result||jsonb_build_array(jsonb_build_object('server',r#>'{effectiveContext,warzone}','tag',r#>>'{effectiveContext,alliance}','members',source_count,'retrievedAt',stamp));
  end loop;
  return result;
 elsif action='read' then
  perform public.nova_matching_store('review-draft',jsonb_build_object('staffEmail',args->>'staffEmail','batchId',args->>'batchId'));
  if jsonb_typeof(args->'selections') is distinct from 'array' then raise exception 'Select the alliances';end if;
  if jsonb_array_length(args->'selections') not between 1 and 2 then raise exception 'Select the alliances';end if;
  for s in select value from jsonb_array_elements(args->'selections') loop
   select jsonb_build_object('roster',roster,'publishedAt',published_at) into r
   from nova_evidence_private.toolkit_roster_snapshots where server=(s->>'server')::integer and lower(tag)=lower(trim(s->>'tag')) order by retrieved_at desc limit 1;
   if r is null then raise exception 'No dated Toolkit roster published for this alliance';end if;
   result:=result||jsonb_build_array(r);
  end loop;
  return result;
 end if;
 raise exception 'Invalid Toolkit roster action';
end $function$;
revoke all on function public.nova_toolkit_rosters(text,jsonb) from public,anon,authenticated;
grant execute on function public.nova_toolkit_rosters(text,jsonb) to service_role;
commit;
