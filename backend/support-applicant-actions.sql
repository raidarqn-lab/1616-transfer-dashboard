begin;
-- The existing seat-outreach dispatcher supplies authenticated identity and holds
-- portal_control FOR UPDATE. No new role or general status-edit permission.
alter table transfer_private.seat_outreach drop constraint if exists seat_outreach_status_check;
alter table transfer_private.seat_outreach add constraint seat_outreach_status_check check(status in ('working','awaiting','unable'));
do $$begin
 if to_regprocedure('transfer_private.seat_outreach_action_v1(jsonb,text,text,text,boolean)') is null then
  alter function transfer_private.seat_outreach_action(jsonb,text,text,text,boolean) rename to seat_outreach_action_v1;
 end if;
end $$;
create or replace function transfer_private.seat_outreach_action(args jsonb,actor text,actor_name text,actor_id text,is_owner boolean) returns jsonb
language plpgsql set search_path='' as $$
declare
 player text:=args->>'playerId'; command text:=args->>'command'; p jsonb; rev bigint; next_p jsonb; global_rev bigint;
 existing transfer_private.seat_outreach%rowtype;
 at text:=to_char(clock_timestamp() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
 select * into existing from transfer_private.seat_outreach where player_key=player;
 if command is null or command not in ('unable','found','withdraw') then
  if existing.status='unable' then return '{"error":"outreach_changed"}';end if;
  return transfer_private.seat_outreach_action_v1(args,actor,actor_name,actor_id,is_owner);
 end if;
 select payload,revision into p,rev from transfer_private.portal_records where kind='players' and key=player;
 if command='withdraw' and p->>'status'='Withdrawn' and coalesce(p->>'deleted','false')<>'true' and coalesce(p->>'mergedInto','')='' then
  return jsonb_build_object('ok',true,'withdrawn',true,'playerId',player);
 end if;
 if not coalesce(transfer_private.seat_confirmation_eligible(p),false) then return '{"error":"applicant_unavailable"}';end if;
 if command='withdraw' then
  if rev::text is distinct from args->>'version' then return '{"error":"record_changed"}';end if;
  select revision into global_rev from transfer_private.portal_control where singleton for update;
  -- Only status and audit metadata change. Seats, attribution, screenshots,
  -- application codes, group, and all other saved application fields survive.
  next_p:=p||jsonb_build_object('status','Withdrawn','updatedAt',at,'history',jsonb_build_array(jsonb_build_object('by',actor_name,'actorId',actor,'when',at,'text','Application withdrawn at the player’s request via applicant support. Previous status: '||(p->>'status')||'.'))||coalesce(p->'history','[]'::jsonb));
  update transfer_private.portal_records set payload=next_p,revision=global_rev+1 where kind='players' and key=player;
  update transfer_private.portal_control set revision=global_rev+1 where singleton;
  insert into transfer_private.portal_transactions(id,actor,events,revision) values('support-withdraw-'||gen_random_uuid()::text,actor,jsonb_build_array(jsonb_build_object('kind','players','key',player,'value',next_p||jsonb_build_object('_rev',global_rev+1))),global_rev+1);
  delete from transfer_private.seat_outreach where player_key=player;
 else
  if coalesce(existing.version::text,'') is distinct from coalesce(args->>'version','') then return '{"error":"outreach_changed"}';end if;
  if command='found' then
   if existing.status is distinct from 'unable' then return '{"error":"outreach_changed"}';end if;
   delete from transfer_private.seat_outreach where player_key=player;
  else
   insert into transfer_private.seat_outreach(player_key,owner_id,owner_name,status,version,updated_at)
   values(player,coalesce(existing.owner_id,actor_id),coalesce(existing.owner_name,actor_name),'unable',gen_random_uuid(),clock_timestamp())
   on conflict(player_key) do update set status=excluded.status,version=excluded.version,updated_at=excluded.updated_at;
  end if;
 end if;
 insert into nova_evidence_private.hub_audit(actor_email,action,subject,detail) values(actor,'support-'||command,player,jsonb_build_object('previousStatus',p->>'status','previousOutreach',existing.status));
 if command='withdraw' then return jsonb_build_object('ok',true,'withdrawn',true,'playerId',player);end if;
 return jsonb_build_object('ok',true,'applicant',transfer_private.seat_confirmation_row(player,p,rev));
end $$;
revoke all on function transfer_private.seat_outreach_action(jsonb,text,text,text,boolean) from public,anon,authenticated;
commit;
