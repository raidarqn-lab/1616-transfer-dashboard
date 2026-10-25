begin;
-- Coordination is private and independent of player/seat revisions.
create table if not exists transfer_private.seat_outreach (
 player_key text primary key, owner_id text not null, owner_name text not null,
 status text not null check(status in ('working','awaiting')), version uuid not null,
 updated_at timestamptz not null default now()
);
alter table transfer_private.seat_outreach enable row level security;
revoke all on transfer_private.seat_outreach from public,anon,authenticated;
create or replace function transfer_private.seat_outreach_action(args jsonb,actor text,actor_name text,actor_id text,is_owner boolean) returns jsonb
language plpgsql set search_path='' as $$
declare p jsonb; rev bigint; existing transfer_private.seat_outreach%rowtype;
 player text:=args->>'playerId'; command text:=args->>'command'; target jsonb;
begin
 select payload,revision into p,rev from transfer_private.portal_records where kind='players' and key=player;
 if not coalesce(transfer_private.seat_confirmation_eligible(p),false) then return '{"error":"applicant_unavailable"}';end if;
 select * into existing from transfer_private.seat_outreach where player_key=player;
 if command='check' then
  if existing.owner_id is distinct from actor_id then return '{"error":"claim_required"}';end if;
  return jsonb_build_object('ok',true,'applicant',transfer_private.seat_confirmation_row(player,p,rev));
 end if;
 if command is null or command not in ('claim','sent','release','reassign') then return '{"error":"invalid_outreach"}';end if;
 if command='claim' and existing.owner_id is not null then
  if existing.owner_id=actor_id then return jsonb_build_object('ok',true,'applicant',transfer_private.seat_confirmation_row(player,p,rev));end if;
  return '{"error":"already_claimed"}';
 end if;
 if coalesce(existing.version::text,'') is distinct from coalesce(args->>'version','') then return '{"error":"outreach_changed"}';end if;
 if command in ('sent','release') and existing.owner_id is distinct from actor_id and not is_owner then return '{"error":"already_claimed"}';end if;
 if command in ('claim','sent','reassign') and p->>'confirmedSeat' in ('Gold','Purple','Blue','White') then return '{"error":"already_confirmed"}';end if;
 if command='reassign' then
  if not is_owner then return '{"error":"access_denied"}';end if;
  select value into target from jsonb_array_elements(transfer_private.seat_confirmation_team()) where value->>'id'=args->>'ownerId';
  if target is null then return '{"error":"invalid_confirmer"}';end if;
 else target:=jsonb_build_object('id',actor_id,'name',actor_name);end if;
 if command='release' then delete from transfer_private.seat_outreach where player_key=player;
 else
  insert into transfer_private.seat_outreach(player_key,owner_id,owner_name,status,version,updated_at)
  values(player,target->>'id',target->>'name',case when command='sent' then 'awaiting' when command='reassign' then coalesce(existing.status,'working') else 'working' end,gen_random_uuid(),clock_timestamp())
  on conflict(player_key) do update set owner_id=excluded.owner_id,owner_name=excluded.owner_name,status=excluded.status,version=excluded.version,updated_at=excluded.updated_at;
 end if;
 insert into nova_evidence_private.hub_audit(actor_email,action,subject,detail) values(actor,'seat-outreach-'||command,player,jsonb_build_object('previousOwnerId',existing.owner_id,'ownerId',case when command='release' then null else target->>'id' end));
 return jsonb_build_object('ok',true,'applicant',transfer_private.seat_confirmation_row(player,p,rev));
end $$;
revoke all on function transfer_private.seat_outreach_action(jsonb,text,text,text,boolean) from public,anon,authenticated;
do $$declare definition text; marker text;
begin
 select pg_get_functiondef('transfer_private.seat_confirmation_action(text,jsonb)'::regprocedure) into definition;
 if position('transfer_private.seat_outreach_action' in definition)=0 then
  marker:='''seat-image-get'',''seat-image-save'') then return ''{"error":"invalid_action"}''';
  if position(marker in definition)=0 then raise exception 'Apply image migration first';end if;
  definition:=replace(definition,marker,'''seat-image-get'',''seat-image-save'',''seat-outreach'') then return ''{"error":"invalid_action"}''');
  definition:=replace(definition,'if action in (''seat-confirmations-save'',''seat-image-save'') then','if action in (''seat-confirmations-save'',''seat-image-save'',''seat-outreach'') then');
  marker:=' team:=transfer_private.seat_confirmation_team();';
  definition:=replace(definition,marker,' if action=''seat-outreach'' then return transfer_private.seat_outreach_action(args,actor,actor_name,case when identity is not null then identity->>''uid'' else ''staff:''||encode(sha256(convert_to(actor,''UTF8'')),''hex'') end,coalesce(identity is null and actor=owner_email,false));end if;'||E'\n'||marker);
  definition:=replace(definition,'''confirmers'',team,''currentConfirmerId''','''confirmers'',team,''canManageOutreach'',coalesce(identity is null and actor=owner_email,false),''currentConfirmerId''');
  execute definition;
 end if;
 select pg_get_functiondef('transfer_private.seat_confirmation_row(text,jsonb,bigint)'::regprocedure) into definition;
 if position('''outreach''' in definition)=0 then
  marker:='''revision'',rev,';
  if position(marker in definition)=0 then raise exception 'Unexpected seat projection';end if;
  execute replace(definition,marker,'''revision'',rev,''outreach'',(select jsonb_build_object(''ownerId'',o.owner_id,''ownerName'',coalesce((select value->>''name'' from jsonb_array_elements(transfer_private.seat_confirmation_team()) where value->>''id''=o.owner_id),o.owner_name),''status'',o.status,''version'',o.version,''updatedAt'',o.updated_at) from transfer_private.seat_outreach o where o.player_key=k),');
 end if;
 select pg_get_functiondef('public.nova_manual_accounts(text,jsonb)'::regprocedure) into definition;
 marker:='if action in (''seat-confirmations-list'',''seat-confirmations-save'',''hub-login-rename'',''seat-image-get'',''seat-image-save'')';
 if position(marker in definition)>0 then execute replace(definition,marker,'if action in (''seat-confirmations-list'',''seat-confirmations-save'',''hub-login-rename'',''seat-image-get'',''seat-image-save'',''seat-outreach'')');
 elsif position('''seat-outreach''' in definition)=0 then raise exception 'Unexpected account dispatcher';end if;
end $$;
commit;
