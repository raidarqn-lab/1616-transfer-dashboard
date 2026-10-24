begin;

-- Public responses contain names and opaque IDs, never staff emails or usernames.
create or replace function transfer_private.seat_confirmation_team() returns jsonb
language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by lower(name),id),'[]'::jsonb) from (
  select 'manual:'||account_id::text id,display_name name from nova_evidence_private.manual_accounts
   where account_type='applicant_messenger' and active
  union all
  select 'staff:'||encode(sha256(convert_to(c.admin_email,'UTF8')),'hex'),coalesce(nullif(m.payload->>'name',''),'Administrator')
   from transfer_private.portal_control c left join transfer_private.portal_records m on m.kind='members' and m.key=c.admin_email where c.singleton
  union all
  select 'staff:'||encode(sha256(convert_to(a.key,'UTF8')),'hex'),coalesce(nullif(a.payload->>'name',''),'Transfer team lead')
   from transfer_private.portal_records a,transfer_private.portal_control c
   where c.singleton and a.kind='access' and a.key<>c.admin_email and a.payload->>'status'='active' and a.payload->>'role'='lead'
 ) names
$$;

create or replace function transfer_private.seat_confirmation_eligible(p jsonb) returns boolean
language sql immutable set search_path='' as $$
 select p is not null and coalesce(p->>'deleted','false')<>'true' and coalesce(p->>'general','false')<>'true'
  and coalesce(p->>'prospect','false')<>'true' and coalesce(p->>'transferDirection','')=''
  and nullif(p->>'mergedInto','') is null and p->>'status' in ('Pending','Under Review','Approved','Waitlisted')
$$;

create or replace function transfer_private.seat_confirmation_row(k text,p jsonb,rev bigint) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',k,'name',p->>'name','server',p->>'server','currentAlliance',left(btrim(coalesce(p->>'alliance','')),100),
  'transferGroup',p->>'group','status',p->>'status','confirmedSeat',case when p->>'confirmedSeat' in ('Gold','Purple','Blue','White') then p->>'confirmedSeat' end,
  'confirmedBy',left(p->>'seatConfirmedBy',100),'confirmerId',p->>'seatConfirmedById','confirmedAt',p->>'seatConfirmedAt','revision',rev)
$$;

create or replace function transfer_private.seat_confirmation_action(action text,args jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare identity jsonb; actor text; actor_name text; owner_email text; team jsonb; confirmer jsonb; access_record jsonb;
 p jsonb; row_revision bigint; portal_revision bigint; records jsonb; next_p jsonb; events jsonb; previous record;
 player_key text:=args->>'playerId'; colour text:=args->>'seat'; confirmer_id text:=args->>'confirmerId';
 transaction_key text:='seat-'||(args->>'transactionId'); at text:=to_char(clock_timestamp() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
 capacity jsonb; seat_limit numeric; selected_account uuid;
begin
 if action not in ('seat-confirmations-list','seat-confirmations-save','hub-login-rename') then return '{"error":"invalid_action"}';end if;
 if action='hub-login-rename' then
  actor:=lower(args->>'staffEmail');
  if not exists(select 1 from nova_evidence_private.hub_staff where email=actor and status='active' and role='master' and accounts_manage) then return '{"error":"access_denied"}';end if;
  if length(trim(coalesce(args->>'displayName',''))) not between 1 and 100 then return '{"error":"invalid_name"}';end if;
  update nova_evidence_private.manual_accounts set display_name=trim(args->>'displayName'),updated_by=actor,updated_at=now()
   where account_id::text=args->>'accountId' and account_type='applicant_messenger' returning account_id into selected_account;
  if not found then return '{"error":"invalid_confirmer"}';end if;
  insert into nova_evidence_private.hub_audit(actor_email,action,subject,detail) values(actor,action,selected_account::text,jsonb_build_object('displayName',trim(args->>'displayName')));
  return '{"ok":true}';
 end if;
 -- Same global commit lock as Transfer Hub: capacity and revisions remain atomic.
 if action='seat-confirmations-save' then
  select admin_email,revision into owner_email,portal_revision from transfer_private.portal_control where singleton for update;
 else select admin_email,revision into owner_email,portal_revision from transfer_private.portal_control where singleton;end if;
 if owner_email is null then return '{"error":"unavailable"}';end if;
 if nullif(args->>'token','') is not null then
  identity:=public.nova_manual_accounts('session',jsonb_build_object('token',args->>'token'))->'user';
  if identity->>'role' is distinct from 'applicant_messenger' then return '{"error":"access_denied"}';end if;
  if action='seat-confirmations-save' then
   perform 1 from nova_evidence_private.manual_accounts where account_id::text=identity->>'id' for share;
   identity:=public.nova_manual_accounts('session',jsonb_build_object('token',args->>'token'))->'user';
   if identity->>'role' is distinct from 'applicant_messenger' then return '{"error":"access_denied"}';end if;
  end if;
  actor:=identity->>'uid';actor_name:=identity->>'playerName';
 else
  actor:=lower(args->>'staffEmail');
  select payload into access_record from transfer_private.portal_records where kind='access' and key=actor;
  if actor is null or (actor<>owner_email and (access_record->>'status' is distinct from 'active' or access_record->>'role' is distinct from 'lead')) then return '{"error":"access_denied"}';end if;
  select coalesce(nullif(payload->>'name',''),nullif(access_record->>'name',''),'Administrator') into actor_name from transfer_private.portal_records where kind='members' and key=actor;
  actor_name:=coalesce(actor_name,nullif(access_record->>'name',''),'Administrator');
 end if;
 team:=transfer_private.seat_confirmation_team();
 if action='seat-confirmations-list' then
  select coalesce(jsonb_agg(transfer_private.seat_confirmation_row(key,payload,revision) order by lower(payload->>'name'),key),'[]') into records
   from transfer_private.portal_records where kind='players' and transfer_private.seat_confirmation_eligible(payload);
  return jsonb_build_object('applicants',records,'confirmers',team,'currentConfirmerId',case when identity is not null then identity->>'uid' else 'staff:'||encode(sha256(convert_to(actor,'UTF8')),'hex') end);
 end if;
 if colour is null or colour not in ('Gold','Purple','Blue','White') or coalesce(args->>'transactionId','') !~ '^[a-zA-Z0-9-]{8,80}$'
  or jsonb_typeof(args->'revision') is distinct from 'number' or (args->>'revision') !~ '^[0-9]+$' then return '{"error":"invalid_confirmation"}';end if;
 if confirmer_id like 'manual:%' then
  perform 1 from nova_evidence_private.manual_accounts where 'manual:'||account_id::text=confirmer_id for share;
  team:=transfer_private.seat_confirmation_team();
 end if;
 select value into confirmer from jsonb_array_elements(team) where value->>'id'=confirmer_id;
 if confirmer is null then return '{"error":"invalid_confirmer"}';end if;
 select payload,revision into p,row_revision from transfer_private.portal_records where kind='players' and key=player_key;
 if not coalesce(transfer_private.seat_confirmation_eligible(p),false) then return '{"error":"applicant_unavailable"}';end if;
 select * into previous from transfer_private.portal_transactions where id=transaction_key;
 if found then
  if previous.actor is distinct from actor or previous.events#>>'{0,key}' is distinct from player_key
   or previous.events#>>'{0,value,confirmedSeat}' is distinct from colour or previous.events#>>'{0,value,seatConfirmedById}' is distinct from confirmer_id then return '{"error":"invalid_confirmation"}';end if;
  return jsonb_build_object('ok',true,'alreadySaved',true,'applicant',transfer_private.seat_confirmation_row(player_key,p,row_revision));
 end if;
 if row_revision::text is distinct from args->>'revision' then return '{"error":"record_changed"}';end if;
 -- Pending applicants do not consume capacity. Approved applicants do.
 if p->>'status'='Approved' then
  select payload->'data' into capacity from transfer_private.portal_records where kind='shared' and key='capacities';
  if jsonb_typeof(capacity->colour) is distinct from 'number' or (capacity->>colour) !~ '^[0-9]+$' then return '{"error":"capacity_unavailable"}';end if;
  seat_limit:=(capacity->>colour)::numeric;
  if (select count(*) from transfer_private.portal_records r where r.kind='players' and r.key<>player_key and coalesce(r.payload->>'deleted','false')<>'true'
   and coalesce(r.payload->>'general','false')<>'true' and coalesce(r.payload->>'prospect','false')<>'true' and r.payload->>'status' in ('Approved','Transferred') and r.payload->>'confirmedSeat'=colour)>=seat_limit then return '{"error":"capacity_full"}';end if;
 end if;
 next_p:=p||jsonb_build_object('confirmedSeat',colour,'seatConfirmedBy',confirmer->>'name','seatConfirmedById',confirmer_id,
  'seatConfirmedActor',actor,'seatConfirmedAt',at,'updatedAt',at,'history',jsonb_build_array(jsonb_build_object('by',actor_name,'actorId',actor,'when',at,
  'text','Seat confirmed: '||colour||'. Confirmed by '||(confirmer->>'name')||'. Saved via Seat confirmations.'))||coalesce(p->'history','[]'::jsonb));
 update transfer_private.portal_records set payload=next_p,revision=portal_revision+1 where kind='players' and key=player_key;
 update transfer_private.portal_control set revision=portal_revision+1 where singleton;
 events:=jsonb_build_array(jsonb_build_object('kind','players','key',player_key,'value',next_p||jsonb_build_object('_rev',portal_revision+1)));
 insert into transfer_private.portal_transactions(id,actor,events,revision) values(transaction_key,actor,events,portal_revision+1);
 return jsonb_build_object('ok',true,'applicant',transfer_private.seat_confirmation_row(player_key,next_p,portal_revision+1));
end $$;
revoke all on function transfer_private.seat_confirmation_team(),transfer_private.seat_confirmation_eligible(jsonb),transfer_private.seat_confirmation_row(text,jsonb,bigint),transfer_private.seat_confirmation_action(text,jsonb) from public,anon,authenticated;

-- Preserve the deployed authentication/account function and all its existing grants.
do $$declare definition text; marker text:=' if action=''applicant-messenger-list'' then'; injection text:=' if action in (''seat-confirmations-list'',''seat-confirmations-save'',''hub-login-rename'') then return transfer_private.seat_confirmation_action(action,args);end if;';
begin
 select pg_get_functiondef('public.nova_manual_accounts(text,jsonb)'::regprocedure) into definition;
 if position(injection in definition)=0 then
  if position(marker in definition)=0 then raise exception 'Unexpected account function; migration not applied';end if;
  execute replace(definition,marker,injection||E'\n'||marker);
 end if;
end $$;
commit;
