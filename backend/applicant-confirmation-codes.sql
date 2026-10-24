begin;
-- Private, idempotent issuance for applicants imported without a website submission.
create or replace function transfer_private.ensure_applicant_confirmation(player_key text, actor_email text)
returns boolean language plpgsql security definer set search_path='' as $$
declare p jsonb; raw jsonb; app_id text; code text; stamp timestamptz:=clock_timestamp();
begin
 perform 1 from transfer_private.portal_control where singleton for update;
 select payload into p from transfer_private.portal_records where kind='players' and key=player_key for update;
 if p is null or coalesce(p->>'deleted','false')='true' or coalesce(p->>'general','false')='true'
  or coalesce(p->>'prospect','false')='true' or p->>'transferDirection'='outbound' or nullif(p->>'mergedInto','') is not null then return false;end if;
 if exists(select 1 from transfer_private.applications a where a.id=p->>'applicationId' or coalesce(p->'applicationIds','[]'::jsonb)?a.id) then return false;end if;
 -- Fail closed on a stale existing receipt, rather than rotating somebody's code.
 if nullif(p->>'applicationId','') is not null or jsonb_array_length(coalesce(p->'applicationIds','[]'::jsonb))>0
  or jsonb_array_length(coalesce(p->'applicationConfirmations','[]'::jsonb))>0 then raise exception 'Existing application linkage needs review for player %',player_key;end if;
 app_id:='APP-'||upper(gen_random_uuid()::text);code:='1616-'||upper(gen_random_uuid()::text);
 -- Only applicant-editable fields. No internal notes, decisions, or private team data.
 raw:=jsonb_strip_nulls(jsonb_build_object('applicationId',app_id,'confirmationCode',code,
  'username',p->'name','currentServer',p->'server','alliance',p->'alliance',
  'professionLevel',p->'profession','killCount',p->'kills',
  'heroPower',case when jsonb_typeof(p->'power')='number' then to_jsonb((p->>'power')::numeric*1000000) end,
  'seatColour',case when p->>'seat' in ('Gold','Purple','Blue','White') then p->>'seat' end,
  'language',case when p->>'language' in ('en','de','pt','fr','es','ko','vi','ar') then p->>'language' else 'en' end,
  'transferGroupName',coalesce(p->>'group',''),'preferred1616Alliance',coalesce(p->>'preference',''),
  'transferWithGroup',case when nullif(p->>'group','') is not null then 'yes' else 'no' end,'groupMembers','[]'::jsonb));
 -- Pre-link the current player so the intake trigger cannot create a duplicate or overwrite stats.
 p:=p||jsonb_build_object('applicationId',app_id,'applicationIds',jsonb_build_array(app_id),
  'rawApplication',raw,'rawApplications',jsonb_build_array(raw),
  'history',jsonb_build_array(jsonb_build_object('by',actor_email,'actorId',actor_email,
   'text','Assigned a private application confirmation code to this existing applicant.','when',stamp))||coalesce(p->'history','[]'::jsonb));
 update transfer_private.portal_records set payload=p where kind='players' and key=player_key;
 insert into transfer_private.applications(id,code_hash,payload,created_at) values(app_id,encode(sha256(convert_to(code,'UTF8')),'hex'),raw,stamp);
 return true;
end $$;
revoke all on function transfer_private.ensure_applicant_confirmation(text,text) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION transfer_private.sync_application_player()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 c transfer_private.portal_control%rowtype; found_player record; p jsonb; raw jsonb:=new.payload; old_raw jsonb; receipt jsonb;
 player_id bigint; events jsonb; stamp timestamptz:=coalesce(new.edited_at,new.created_at); next_revision bigint;
 receipts jsonb; raw_list jsonb; source_field text; target_field text; new_value jsonb; changed text[]:='{}';
begin
 select * into c from transfer_private.portal_control where singleton for update;
 if not found then raise exception 'Portal must be configured before intake';end if;
 if exists(select 1 from transfer_private.portal_records where kind='purged' and key=encode(sha256(convert_to('application:'||new.id,'UTF8')),'hex')) then raise exception 'Application removed';end if;
 select key,payload into found_player from transfer_private.portal_records
 where kind='players' and coalesce(payload->>'deleted','false')<>'true'
 and (payload->>'applicationId'=new.id or coalesce(payload->'applicationIds','[]'::jsonb) ? new.id)
 order by key limit 1;
 receipt:=jsonb_build_object('applicationId',new.id,'confirmationCode',raw->>'confirmationCode','groupCode',coalesce(raw->>'transferGroupName',''),'lastEditedAt',coalesce(new.edited_at::text,''));
 if found_player.key is null then
  loop
   player_id:=nextval('transfer_private.player_ids');
   exit when not exists(select 1 from transfer_private.portal_records where kind='players' and key=player_id::text)
    and not exists(select 1 from transfer_private.portal_records where kind='purged' and key=encode(sha256(convert_to('player:'||player_id::text,'UTF8')),'hex'));
  end loop;
  p:=jsonb_build_object('id',player_id,'applicationId',new.id,'applicationIds',jsonb_build_array(new.id),'applicationConfirmations',jsonb_build_array(receipt),
   'name',raw->>'username','server',raw->>'currentServer','alliance',raw->>'alliance','group',coalesce(raw->>'transferGroupName',''),
   'power',transfer_private.number_or_null(raw->>'heroPower')/1000000,'kills',transfer_private.number_or_null(raw->>'killCount'),'profession',transfer_private.number_or_null(raw->>'professionLevel'),
   'hqLevel',null,'seat',case lower(raw->>'seatColour') when 'gold' then 'Gold' when 'purple' then 'Purple' when 'blue' then 'Blue' when 'white' then 'White' else 'Unknown' end,
   'confirmedSeat','','status','Pending','general',false,'prospect',false,'preference',coalesce(raw->>'preferred1616Alliance',''),'language',coalesce(raw->>'language',''),
   'receivedAt',new.created_at,'createdAt',new.created_at,'updatedAt',stamp,'source','Application website','rawApplication',raw,'aliases','[]'::jsonb,'previousGameNames','[]'::jsonb,
   'history',jsonb_build_array(jsonb_build_object('by','Application website','actorId','intake','text','Application received from the application website. Identity matching is pending.','when',stamp)));
 else
  player_id:=found_player.key::bigint;p:=found_player.payload;
  select value into old_raw from jsonb_array_elements(coalesce(p->'rawApplications','[]'::jsonb)) where value->>'applicationId'=new.id limit 1;
  old_raw:=coalesce(old_raw,case when p->'rawApplication'->>'applicationId'=new.id then p->'rawApplication' else '{}'::jsonb end);
  for source_field,target_field in select * from (values('username','name'),('currentServer','server'),('alliance','alliance'),('professionLevel','profession'),('killCount','kills'),('heroPower','power'),('seatColour','seat'),('transferGroupName','group'),('preferred1616Alliance','preference'),('language','language')) as mapping(s,t) loop
   if raw ? source_field and raw->source_field is distinct from old_raw->source_field then
    new_value:=case when source_field in ('professionLevel','killCount') then coalesce(to_jsonb(transfer_private.number_or_null(raw->>source_field)),'null'::jsonb)
     when source_field='heroPower' then coalesce(to_jsonb(transfer_private.number_or_null(raw->>source_field)/1000000),'null'::jsonb)
     when source_field='seatColour' then to_jsonb(case lower(raw->>source_field) when 'gold' then 'Gold' when 'purple' then 'Purple' when 'blue' then 'Blue' when 'white' then 'White' else 'Unknown' end)
     else raw->source_field end;
    if source_field='username' and p->'name' is distinct from new_value then
     p:=jsonb_set(p,'{previousGameNames}',jsonb_build_array(jsonb_build_object('name',p->>'name','recordedAt',stamp,'source','Applicant edit','by','Applicant'))||coalesce(p->'previousGameNames','[]'::jsonb));
    end if;
    p:=jsonb_set(p,array[target_field],new_value);changed:=array_append(changed,target_field);
   end if;
  end loop;
  select coalesce(jsonb_agg(value),'[]'::jsonb) into receipts from jsonb_array_elements(coalesce(p->'applicationConfirmations','[]'::jsonb)) where value->>'applicationId'<>new.id;
  select coalesce(jsonb_agg(value),'[]'::jsonb) into raw_list from jsonb_array_elements(coalesce(p->'rawApplications','[]'::jsonb)) where value->>'applicationId'<>new.id;
  p:=p||jsonb_build_object('applicationConfirmations',receipts||jsonb_build_array(receipt),'rawApplication',raw,'rawApplications',raw_list||jsonb_build_array(raw),'updatedAt',stamp,
   'history',jsonb_build_array(jsonb_build_object('by',case when TG_OP='INSERT' then 'Transfer team' else 'Applicant' end,'actorId','intake','text',case when TG_OP='INSERT' then 'Application confirmation linked to existing applicant.' else 'Application updated by applicant: '||array_to_string(changed,', ') end,'when',stamp))||coalesce(p->'history','[]'::jsonb));
 end if;
 next_revision:=c.revision+1;
 insert into transfer_private.portal_records(kind,key,revision,payload) values('players',player_id::text,next_revision,p)
 on conflict(kind,key) do update set revision=excluded.revision,payload=excluded.payload;
 events:=jsonb_build_array(jsonb_build_object('kind','players','key',player_id::text,'value',p||jsonb_build_object('_rev',next_revision)));
 insert into transfer_private.portal_transactions(id,actor,events,revision) values('intake-'||new.id||'-'||new.revision,'intake',events,next_revision);
 update transfer_private.portal_control set revision=next_revision where singleton;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.transfer_portal_commit(actor_email text, expected_revision bigint, transaction_id text, changes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare control transfer_private.portal_control%rowtype; previous transfer_private.portal_transactions%rowtype; e jsonb; updated_events jsonb; access_record jsonb;
begin
 if transaction_id !~ '^[a-zA-Z0-9-]{8,100}$' or jsonb_typeof(changes)<>'array' or jsonb_array_length(changes)>100 then raise exception 'Invalid transaction';end if;
 -- Short commit-only lock: validation and network calls occur outside this transaction.
 select * into control from transfer_private.portal_control where singleton for update;
 if control.admin_email is null then raise exception 'Portal not configured';end if;
 if actor_email<>control.admin_email then
  select payload into access_record from transfer_private.portal_records where kind='access' and key=actor_email;
  if access_record is null or (access_record->>'status') is distinct from 'active' or coalesce(access_record->>'role','') not in ('lead','support') then raise exception 'Access denied';end if;
 end if;
 select * into previous from transfer_private.portal_transactions where id=transaction_id;
 if found then
  if previous.actor<>actor_email then raise exception 'Invalid transaction';end if;
  return jsonb_build_object('alreadySaved',true,'revision',previous.revision,'events',previous.events);
 end if;
 if expected_revision is distinct from control.revision then return jsonb_build_object('retry',true);end if;
 if jsonb_array_length(changes)=0 then return jsonb_build_object('revision',control.revision,'events','[]'::jsonb);end if;
 updated_events:='[]'::jsonb;
 for e in select value from jsonb_array_elements(changes) loop
  if e->>'key' in ('__proto__','constructor','prototype') then raise exception 'Invalid record key';end if;
  if e->'value'='null'::jsonb then
   delete from transfer_private.portal_records where kind=e->>'kind' and key=e->>'key';
   updated_events:=updated_events||jsonb_build_array(e);
  else
   insert into transfer_private.portal_records(kind,key,revision,payload)
    values(e->>'kind',e->>'key',control.revision+1,(e->'value')-'_rev')
    on conflict(kind,key) do update set payload=excluded.payload,revision=excluded.revision;
   updated_events:=updated_events||jsonb_build_array(e||jsonb_build_object('value',(e->'value')||jsonb_build_object('_rev',control.revision+1)));
  end if;
 end loop;
 update transfer_private.portal_control set revision=control.revision+1 where singleton;
 insert into transfer_private.portal_transactions(id,actor,events,revision) values(transaction_id,actor_email,updated_events,control.revision+1);
 -- Issuance runs under the same portal lock and is included in the save receipt.
 -- Support cannot create applicant access; category changes remain governed by the existing API.
 if actor_email=control.admin_email or access_record->>'role'='lead' then
  for e in select value from jsonb_array_elements(changes) loop
   if e->>'kind'='players' and e->'value'<>'null'::jsonb then
    perform transfer_private.ensure_applicant_confirmation(e->>'key',actor_email);
   end if;
  end loop;
 end if;
 select revision into control.revision from transfer_private.portal_control where singleton;
 select coalesce(jsonb_agg(case when item->>'kind'='players' and item->'value'<>'null'::jsonb then
  item||jsonb_build_object('value',(select payload||jsonb_build_object('_rev',revision) from transfer_private.portal_records where kind='players' and key=item->>'key')) else item end order by ord),'[]'::jsonb)
 into updated_events from jsonb_array_elements(updated_events) with ordinality as x(item,ord);
 update transfer_private.portal_transactions set revision=control.revision,events=updated_events where id=transaction_id;
 return jsonb_build_object('revision',control.revision,'events',updated_events);
end $function$;

commit;
