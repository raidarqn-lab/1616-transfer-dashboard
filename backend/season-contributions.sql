begin;
create table if not exists nova_evidence_private.season_contributions (
 alliance text not null check(alliance='NvSP'),season integer not null check(season between 1 and 99),
 uid text not null,player_key text not null,name text not null,scores jsonb not null,
 roster_date date not null,profile_snapshot jsonb not null,provenance jsonb not null,
 revision bigint not null default 1,updated_at timestamptz not null default now(),updated_by text not null,
 primary key(alliance,season,uid)
);
create table if not exists nova_evidence_private.season_roster_imports (
 digest text primary key,actor text not null,created_at timestamptz not null default now(),
 season integer not null,roster_date date not null,input jsonb not null,result jsonb not null,before_data jsonb not null
);
alter table nova_evidence_private.season_contributions enable row level security;
alter table nova_evidence_private.season_roster_imports enable row level security;
revoke all on nova_evidence_private.season_contributions,nova_evidence_private.season_roster_imports from public,anon,authenticated;

create or replace function nova_evidence_private.season_profile_patch(item jsonb,current_data jsonb,roster_date date) returns jsonb
language plpgsql set search_path='' as $$
declare patch jsonb:=jsonb_build_object('name',item->>'name','alliance','NvSP','server','1616');
 f text;v jsonb;target text;aliases jsonb;source_time timestamptz;current_time_ timestamptz;older boolean:=false;
begin
 source_time:=nullif(item#>>'{provenance,profileRecordConfirmedAt}','')::timestamptz;
 current_time_:=nullif(current_data->>'sourceFetchedAt','')::timestamptz;
 older:=source_time is not null and current_time_ is not null and source_time<current_time_;
 for f,v in select * from jsonb_each(item->'profile') loop
  target:=case f when 'heroPower' then 'power' when 'profession' then 'professionType' when 'professionLevel' then 'profession' else f end;
  if f<>'allianceRank' and older and nullif(current_data->target,'null'::jsonb) is not null then continue;end if;
  if f='heroPower' and (item->'warnings')::text ilike '%legacy%' and nullif(current_data->'power','null'::jsonb) is not null then continue;end if;
  if f='heroPower' then patch:=patch||jsonb_build_object('power',(v::text)::numeric/1000000,'heroPowerRaw',v);
  else patch:=patch||jsonb_build_object(target,v);end if;
 end loop;
 select coalesce(jsonb_agg(distinct a),'[]'::jsonb) into aliases from jsonb_array_elements(
  case when jsonb_typeof(current_data->'aliases')='array' then current_data->'aliases' else '[]'::jsonb end || coalesce(item->'aliases','[]'::jsonb)
 ) a;
 if jsonb_array_length(aliases)>0 then patch:=patch||jsonb_build_object('aliases',aliases);end if;
 return (select coalesce(jsonb_object_agg(e.k,e.v),'{}'::jsonb) from jsonb_each(patch) e(k,v) where current_data->e.k is distinct from e.v);
end;
$$;
revoke all on function nova_evidence_private.season_profile_patch(jsonb,jsonb,date) from public,anon,authenticated;

create or replace function nova_evidence_private.season_contribution_store(action text,args jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me nova_evidence_private.hub_staff; actor text:=lower(args->>'staffEmail');
 data jsonb:=args->'import';item jsonb;f text;v jsonb;p transfer_private.portal_records;
 season_n integer;day_ date;keys_ text[]:=array[]::text[];uids_ text[]:=array[]::text[];
 changes jsonb:='[]';unmatched jsonb:='[]';warnings_ jsonb:='[]';absent_ jsonb;patch jsonb;
 count_ integer;score_count integer:=0;digest_ text;control_rev bigint;next_rev bigint;
 snapshot_ jsonb:='[]';events_ jsonb:='[]';result jsonb;saved jsonb;old_payload jsonb;new_payload jsonb;depart text;
 do_import boolean:=args->>'operation'='import';
begin
 select * into me from nova_evidence_private.hub_staff where email=actor and status='active';
 if me.email is null or not(me.role='master' or me.alliances ? 'NvSP') then raise exception 'Access denied';end if;
 if action='hub-content-list' then
  season_n:=nullif(args->>'season','')::integer;
  if season_n is not null and season_n not between 1 and 99 then raise exception 'Invalid season';end if;
  select coalesce(jsonb_agg(jsonb_build_object('uid',s.uid,'playerKey',s.player_key,'name',coalesce(r.payload->>'name',s.name),'season',s.season,'scores',s.scores,'rosterDate',s.roster_date,'profile',s.profile_snapshot,'provenance',s.provenance) order by s.season desc,lower(s.name)),'[]'::jsonb)
  into result from nova_evidence_private.season_contributions s left join transfer_private.portal_records r on r.kind='players' and r.key=s.player_key
  where s.alliance='NvSP' and (season_n is null or s.season=season_n) and (nullif(args->>'playerKey','') is null or s.player_key=args->>'playerKey');
  return jsonb_build_object('players',result,'canImport',me.role='master');
 end if;
 if action<>'hub-content-save' or me.role<>'master' then raise exception 'Administrator required';end if;
 if args->>'operation' is null or args->>'operation' not in ('preview','import') then raise exception 'Choose preview or import';end if;
 if jsonb_typeof(data) is distinct from 'object' or data->>'version' is distinct from '1' or data->>'alliance' is distinct from 'NvSP' or data->>'server' is distinct from '1616' then raise exception 'Invalid roster import';end if;
 if jsonb_typeof(data->'players') is distinct from 'array' then raise exception 'Invalid player list';end if;
 if jsonb_array_length(data->'players') not between 1 and 500 or octet_length(data::text)>1000000 then raise exception 'Roster exceeds import limits';end if;
 season_n:=(data->>'season')::integer;day_:=(data->>'rosterDate')::date;
 if season_n is null or season_n not between 1 and 99 or day_ is null or not isfinite(day_) then raise exception 'Invalid season or roster date';end if;
 if do_import then
  perform 1 from transfer_private.portal_control where singleton for update;
  perform pg_advisory_xact_lock(771616,season_n);
  select i.result into saved from nova_evidence_private.season_roster_imports i where i.digest=args->>'expectedDigest' and i.input=data;
  if found then return saved;end if;
 end if;
 select revision into control_rev from transfer_private.portal_control where singleton;
 for item in select value from jsonb_array_elements(data->'players') loop
  if jsonb_typeof(item->'uid') is distinct from 'string' or item->>'uid' !~ '^[0-9]{1,30}$' or item->>'uid'=any(uids_) then raise exception 'Unique text UIDs required';end if;
  uids_:=array_append(uids_,item->>'uid');
  if jsonb_typeof(item->'name') is distinct from 'string' or length(trim(item->>'name')) not between 1 and 160 then raise exception 'Invalid player name';end if;
  if jsonb_typeof(item->'profile') is distinct from 'object' or jsonb_typeof(item->'scores') is distinct from 'object' or jsonb_typeof(item->'aliases') is distinct from 'array' or jsonb_typeof(item->'provenance') is distinct from 'object' then raise exception 'Invalid player details';end if;
  if jsonb_array_length(item->'aliases')>50 or exists(select 1 from jsonb_array_elements(item->'aliases') a where jsonb_typeof(a)<>'string' or length(trim(a#>>'{}')) not between 1 and 160) then raise exception 'Invalid aliases';end if;
  for f,v in select * from jsonb_each(item->'profile') loop
   if f in ('profession','allianceRank') then
    if jsonb_typeof(v) is distinct from 'string' then raise exception 'Text statistic required';end if;
    if f='profession' and v#>>'{}' not in ('Engineer','War leader','War Leader') then raise exception 'Invalid profession';end if;
    if f='allianceRank' and v#>>'{}' !~ '^R[1-5]$' then raise exception 'Invalid rank';end if;
   elsif f in ('heroPower','kills','hqLevel','gamePower','professionLevel','vipLevel','strongestHeroPower','homeServer') then
    if jsonb_typeof(v) is distinct from 'number' or (v::text)::numeric<0 or (v::text)::numeric>1000000000000000 or trunc((v::text)::numeric)<>(v::text)::numeric then raise exception 'Invalid profile statistic';end if;
   else raise exception 'Unsupported profile field: %',f;end if;
  end loop;
  for f,v in select * from jsonb_each(item->'scores') loop
   if f not in ('mutualAssistance','cleanUp','conquest','defeat') or jsonb_typeof(v) is distinct from 'number' or (v::text)::numeric<0 or (v::text)::numeric>1000000000000000 or trunc((v::text)::numeric)<>(v::text)::numeric then raise exception 'Invalid season score';end if;
   score_count:=score_count+1;
  end loop;
  select count(*) into count_ from transfer_private.portal_records where kind='players' and payload->>'sourceUid'=item->>'uid' and coalesce(payload->>'deleted','false')<>'true';
  if count_<>1 then unmatched:=unmatched||jsonb_build_array(jsonb_build_object('uid',item->>'uid','name',item->>'name','reason',case when count_=0 then 'No shared record with this UID' else 'More than one shared record has this UID' end));continue;end if;
  select * into p from transfer_private.portal_records where kind='players' and payload->>'sourceUid'=item->>'uid' and coalesce(payload->>'deleted','false')<>'true';
  keys_:=array_append(keys_,p.key);
  patch:=nova_evidence_private.season_profile_patch(item,p.payload,day_);
  for f,v in select * from jsonb_each(patch) loop changes:=changes||jsonb_build_array(jsonb_build_object('name',item->>'name','field',f,'before',p.payload->f,'after',v));end loop;
  if exists(select 1 from nova_evidence_private.season_contributions where alliance='NvSP' and season=season_n and uid=item->>'uid' and roster_date>day_) then raise exception 'A newer season total exists for %',item->>'name';end if;
  warnings_:=warnings_||coalesce((select jsonb_agg((item->>'name')||': '||(w#>>'{}')) from jsonb_array_elements(coalesce(item->'warnings','[]'::jsonb)) w),'[]'::jsonb);
 end loop;
 select coalesce(jsonb_agg(jsonb_build_object('key',key,'uid',payload->>'sourceUid','name',payload->>'name','revision',revision) order by key),'[]'::jsonb) into absent_
 from transfer_private.portal_records where kind='players' and payload->>'alliance'='NvSP' and payload->>'server'='1616' and coalesce(payload->>'deleted','false')<>'true' and not(key=any(keys_));
 select md5(data::text||control_rev::text||coalesce(jsonb_agg(to_jsonb(s) order by uid)::text,'[]')) into digest_ from nova_evidence_private.season_contributions s where alliance='NvSP' and season=season_n;
 if not do_import then return jsonb_build_object('digest',digest_,'changes',changes,'unmatched',unmatched,'absent',absent_,'warnings',warnings_,'scoreCount',score_count);end if;
 if jsonb_array_length(unmatched)>0 then raise exception 'Resolve player identities before importing';end if;
 if args->>'expectedDigest' is distinct from digest_ then raise exception 'Records changed after preview. Choose the file again to review current values.';end if;
 if jsonb_typeof(args->'departures') is distinct from 'array' or exists(select 1 from jsonb_array_elements_text(args->'departures') d where not exists(select 1 from jsonb_array_elements(absent_) a where a->>'key'=d)) then raise exception 'Invalid roster departures';end if;
 next_rev:=control_rev+1;
 for item in select value from jsonb_array_elements(data->'players') loop
  select * into p from transfer_private.portal_records where kind='players' and payload->>'sourceUid'=item->>'uid' and coalesce(payload->>'deleted','false')<>'true' for update;
  old_payload:=p.payload;patch:=nova_evidence_private.season_profile_patch(item,old_payload,day_);new_payload:=old_payload||patch;
  snapshot_:=snapshot_||jsonb_build_array(jsonb_build_object('key',p.key,'revision',p.revision,'payload',old_payload,'seasonRecord',(select to_jsonb(s) from nova_evidence_private.season_contributions s where s.alliance='NvSP' and s.season=season_n and s.uid=item->>'uid')));
  if patch ? 'name' then new_payload:=new_payload||jsonb_build_object('previousGameNames',coalesce(old_payload->'previousGameNames','[]'::jsonb)||jsonb_build_array(jsonb_build_object('name',old_payload->>'name','date',now(),'source','Season roster import')));end if;
  if patch ? 'alliance' then new_payload:=new_payload||jsonb_build_object('membershipEvents',coalesce(old_payload->'membershipEvents','[]'::jsonb)||jsonb_build_array(jsonb_build_object('id','season-roster-'||digest_,'date',day_,'type','readmitted','alliance','NvSP','source','Owner-confirmed roster import','recordedAt',now(),'recordedBy',nova_evidence_private.admin_name(actor))));end if;
  if patch<>'{}'::jsonb then
   new_payload:=new_payload||jsonb_build_object('updatedAt',now());
   update transfer_private.portal_records set payload=new_payload,revision=next_rev where kind='players' and key=p.key;
   events_:=events_||jsonb_build_array(jsonb_build_object('kind','players','key',p.key,'value',new_payload||jsonb_build_object('_rev',next_rev)));
  end if;
  insert into nova_evidence_private.season_contributions(alliance,season,uid,player_key,name,scores,roster_date,profile_snapshot,provenance,updated_by)
  values('NvSP',season_n,item->>'uid',p.key,item->>'name',item->'scores',day_,item->'profile',item->'provenance',actor)
  on conflict(alliance,season,uid) do update set player_key=excluded.player_key,name=excluded.name,scores=nova_evidence_private.season_contributions.scores||excluded.scores,roster_date=excluded.roster_date,profile_snapshot=excluded.profile_snapshot,provenance=excluded.provenance,revision=nova_evidence_private.season_contributions.revision+1,updated_at=now(),updated_by=actor;
 end loop;
 for depart in select distinct jsonb_array_elements_text(args->'departures') loop
  select * into p from transfer_private.portal_records where kind='players' and key=depart for update;
  snapshot_:=snapshot_||jsonb_build_array(jsonb_build_object('key',p.key,'revision',p.revision,'payload',p.payload));
  new_payload:=p.payload||jsonb_build_object('alliance','','allianceRank','','updatedAt',now(),'membershipEvents',coalesce(p.payload->'membershipEvents','[]'::jsonb)||jsonb_build_array(jsonb_build_object('id','season-roster-'||digest_,'date',day_,'type','removed','alliance','NvSP','source','Owner-confirmed roster import; next alliance unknown','recordedAt',now(),'recordedBy',nova_evidence_private.admin_name(actor))));
  update transfer_private.portal_records set payload=new_payload,revision=next_rev where kind='players' and key=depart;
  events_:=events_||jsonb_build_array(jsonb_build_object('kind','players','key',depart,'value',new_payload||jsonb_build_object('_rev',next_rev)));
 end loop;
 update transfer_private.portal_control set revision=next_rev where singleton;
 insert into transfer_private.portal_transactions(id,actor,events,revision) values('season-roster-'||digest_,actor,events_,next_rev);
 result:=jsonb_build_object('ok',true,'playerCount',jsonb_array_length(data->'players'),'scoreCount',score_count,'departures',jsonb_array_length(args->'departures'),'revision',next_rev);
 insert into nova_evidence_private.season_roster_imports(digest,actor,season,roster_date,input,result,before_data) values(digest_,actor,season_n,day_,data,result,snapshot_);
 insert into nova_evidence_private.hub_audit(actor_email,action,subject,detail) values(actor,'season-roster-import',digest_,result||jsonb_build_object('season',season_n,'rosterDate',day_));
 return result;
end;
$$;
revoke all on function nova_evidence_private.season_contribution_store(text,jsonb) from public,anon,authenticated;
do $$ declare definition text;begin
 definition:=pg_get_functiondef('public.nova_hub_store(text,jsonb)'::regprocedure);
 if position('season_contribution_store' in definition)=0 then
  definition:=regexp_replace(definition,'\mbegin\M',E'begin\nif action in (''hub-content-list'',''hub-content-save'') and args->>''kind''=''season-contributions'' then return nova_evidence_private.season_contribution_store(action,args);end if;','i');execute definition;
 end if;
end $$;
do $$ declare definition text;begin
 definition:=pg_get_functiondef('nova_evidence_private.nova_bounty_store_before_hardsave(text,jsonb)'::regprocedure);
 if position('''professionType''' in definition)=0 then
  if position('''aliases'',''previousGameNames'']' in definition)=0 then raise exception 'Shared profile layout changed; review migration';end if;
  definition:=replace(definition,'''aliases'',''previousGameNames'']','''aliases'',''previousGameNames'',''sourceUid'',''hqLevel'',''gamePower'',''professionType'',''vipLevel'',''strongestHeroPower'',''homeServer'']');
  execute definition;
 end if;
end $$;
commit;
