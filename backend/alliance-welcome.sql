begin;
create table if not exists transfer_private.welcome_pages (
 alliance text primary key check(alliance in ('NvSP','NvEM','WaE','WaE2','B14K','DRoN','ECKO')),
 message text not null default 'Hi {player}! My name is {r4}, and I''d love to welcome you to 1616! We''d be happy to have you join {alliance} for the season. Once you arrive on 1616, please apply to {alliance}. We''re looking forward to welcoming you to the family!',
 leaders jsonb not null default '[]', revision bigint not null default 0, password_hash text, password_salt text,
 credential_version bigint not null default 0, active boolean not null default false,
 updated_at timestamptz not null default now(), updated_by text
);
create table if not exists transfer_private.welcome_sessions (
 hash text primary key, alliance text not null references transfer_private.welcome_pages,
 credential_version bigint not null, expires_at timestamptz not null
);
create table if not exists transfer_private.welcome_limits (key text primary key, started_at timestamptz not null, attempts int not null);
create table if not exists transfer_private.welcome_contacts (
 alliance text not null references transfer_private.welcome_pages, player_key text not null,
 leader_id text not null default '', status text not null check(status in ('available','claimed','completed')), contact_name text not null default '',
 revision bigint not null default 0, updated_at timestamptz not null default now(),
 primary key(alliance,player_key)
);
create table if not exists transfer_private.welcome_audit (
 id bigint generated always as identity primary key, alliance text not null, actor text not null,
 action text not null, detail jsonb not null default '{}', created_at timestamptz not null default now()
);
alter table transfer_private.welcome_pages enable row level security;
alter table transfer_private.welcome_sessions enable row level security;
alter table transfer_private.welcome_limits enable row level security;
alter table transfer_private.welcome_contacts enable row level security;
alter table transfer_private.welcome_audit enable row level security;
revoke all on transfer_private.welcome_pages,transfer_private.welcome_sessions,transfer_private.welcome_limits,transfer_private.welcome_contacts,transfer_private.welcome_audit from public,anon,authenticated;
insert into transfer_private.welcome_pages(alliance) select unnest(array['NvSP','NvEM','WaE','WaE2','B14K','DRoN','ECKO']) on conflict do nothing;

create or replace function transfer_private.welcome_roster(home text) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.key,'name',p.payload->>'name','server',p.payload->>'server',
 'alliance',p.payload->>'alliance','group',p.payload->>'group','hqLevel',p.payload->'hqLevel','profession',p.payload->'profession',
 'power',p.payload->'power','kills',p.payload->'kills','confirmedSeat',p.payload->>'confirmedSeat','status',p.payload->>'status',
 'notes',coalesce((select jsonb_agg(jsonb_build_object('id',h->>'welcomeNoteId','text',h->>'welcomeNote','by',h->>'welcomeAuthor','at',h->>'when')) from jsonb_array_elements(coalesce(p.payload->'history','[]')) h where h->>'welcomeAlliance'=home),'[]'),
 'outreach',jsonb_build_object('status',coalesce(c.status,'available'),'leaderId',coalesce(c.leader_id,''),'name',coalesce((select l->>'name' from transfer_private.welcome_pages w cross join lateral jsonb_array_elements(w.leaders) l where w.alliance=home and l->>'id'=c.leader_id),c.contact_name,''),'revision',coalesce(c.revision,0),'updatedAt',c.updated_at))
 order by lower(p.payload->>'name'),p.key),'[]')
 from transfer_private.portal_records p
 join transfer_private.portal_records o on o.kind='shared' and o.key='transferOrganization' and o.payload#>>array['data','assignments',p.key]=home
 left join transfer_private.welcome_contacts c on c.alliance=home and c.player_key=p.key
 where p.kind='players' and p.payload->>'status' in ('Approved','Accepted')
 and coalesce(p.payload->>'general','false')<>'true' and coalesce(p.payload->>'prospect','false')<>'true'
 and coalesce(p.payload->>'deleted','false')<>'true' and coalesce(p.payload->>'transferDirection','')=''
 and nullif(p.payload->>'mergedInto','') is null
$$;
revoke all on function transfer_private.welcome_roster(text) from public,anon,authenticated;

-- Only the Edge Function service credential can call this RPC. Actor identities
-- are verified by the handler, never accepted from browser request bodies.
create or replace function public.transfer_welcome(action text,args jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare control transfer_private.portal_control%rowtype; player jsonb; receipt jsonb; note_id text; previous_message text; home text:=args->>'alliance'; actor text:=lower(args->>'actor'); page transfer_private.welcome_pages;
 contact transfer_private.welcome_contacts; k text; n int; raw text; roster jsonb; entry jsonb; contact_name text; leader text:=coalesce(args->>'leaderId',''); new_leaders jsonb; previous_leaders jsonb;
begin
 if action like 'admin.%' then
  if actor is null or not exists(select 1 from transfer_private.portal_control where singleton and admin_email=actor) then return '{"error":"access_denied"}';end if;
  if action='admin.list' then
   return jsonb_build_object('pages',(select jsonb_agg(jsonb_build_object('alliance',alliance,'active',active,'revision',revision,'updatedAt',updated_at,'players',jsonb_array_length(transfer_private.welcome_roster(alliance))) order by alliance) from transfer_private.welcome_pages));
  end if;
 elsif action='login.begin' then
  delete from transfer_private.welcome_limits where started_at<now()-interval '1 day';
  foreach k in array array['global','ip:'||left(coalesce(args->>'ip','unknown'),128),'alliance:'||coalesce(home,'')] loop
   insert into transfer_private.welcome_limits as lim values(k,now(),1)
   on conflict(key) do update set attempts=case when lim.started_at<now()-interval '10 minutes' then 1 else lim.attempts+1 end,started_at=case when lim.started_at<now()-interval '10 minutes' then now() else lim.started_at end returning attempts into n;
   if n>(case when k='global' then 300 when k like 'ip:%' then 30 else 60 end) then return '{"error":"try_later"}';end if;
  end loop;
  select * into page from transfer_private.welcome_pages where alliance=home and active;
  if page.alliance is null then return '{}';end if;
  return jsonb_build_object('hash',page.password_hash,'salt',page.password_salt,'version',page.credential_version);
 elsif action='login.finish' then
  select * into page from transfer_private.welcome_pages where alliance=home and active and credential_version=(args->>'version')::bigint for share;
  if page.alliance is null then return '{"error":"invalid_session"}';end if;
  delete from transfer_private.welcome_sessions where expires_at<now();
  raw:=encode(extensions.gen_random_bytes(32),'hex');
  insert into transfer_private.welcome_sessions values(encode(extensions.digest(raw,'sha256'),'hex'),home,page.credential_version,now()+interval '8 hours');
  return jsonb_build_object('token',raw,'alliance',home,'expiresAt',now()+interval '8 hours');
 else
  if coalesce(args->>'token','') !~ '^[a-f0-9]{64}$' then return '{"error":"invalid_session"}';end if;
  select p.* into page from transfer_private.welcome_sessions s join transfer_private.welcome_pages p on p.alliance=s.alliance and p.credential_version=s.credential_version and p.active
   where s.hash=encode(extensions.digest(args->>'token','sha256'),'hex') and s.expires_at>now() and p.alliance=home for update of p;
  if page.alliance is null then return '{"error":"invalid_session"}';end if;
  actor:='alliance:'||home;
  if action='logout' then delete from transfer_private.welcome_sessions where hash=encode(extensions.digest(args->>'token','sha256'),'hex');return '{"ok":true}';end if;
 end if;
 -- Serialize saves and password rotations. Concurrent writes fail with a
 -- conflict rather than silently overwriting a message or another claim.
 select * into page from transfer_private.welcome_pages where alliance=home for update;
 if page.alliance is null then return '{"error":"invalid_alliance"}';end if;
 if action in ('admin.password','admin.disable') then
  if action='admin.password' and (coalesce(args->>'hash','') !~ '^[a-f0-9]{64}$' or coalesce(args->>'salt','') !~ '^[a-f0-9]{64}$') then return '{"error":"invalid_password"}';end if;
  update transfer_private.welcome_pages set password_hash=case when action='admin.password' then args->>'hash' else password_hash end,
   password_salt=case when action='admin.password' then args->>'salt' else password_salt end,active=action='admin.password',credential_version=credential_version+1,updated_at=now(),updated_by=actor where alliance=home;
  delete from transfer_private.welcome_sessions where alliance=home;
  insert into transfer_private.welcome_audit(alliance,actor,action) values(home,actor,action);
  return '{"ok":true}';
 elsif action in ('save','admin.save') then
  if jsonb_typeof(args->'message') is distinct from 'string' or length(args->>'message')>5000 then return '{"error":"invalid_message"}';end if;
  new_leaders:=args->'leaders';
  if jsonb_typeof(new_leaders) is distinct from 'array' then return '{"error":"invalid_leaders"}';end if;
  if jsonb_array_length(new_leaders)>30 or exists(select 1 from jsonb_array_elements(new_leaders) l where coalesce(l->>'id','') !~ '^[a-f0-9-]{36}$' or length(btrim(coalesce(l->>'name',''))) not between 1 and 100) or (select count(distinct l->>'id') from jsonb_array_elements(new_leaders) l)<>jsonb_array_length(new_leaders) or (select count(distinct lower(btrim(l->>'name'))) from jsonb_array_elements(new_leaders) l)<>jsonb_array_length(new_leaders) then return '{"error":"invalid_leaders"}';end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',l->>'id','name',btrim(l->>'name'))),'[]') into new_leaders from jsonb_array_elements(new_leaders) l;
  if page.revision is distinct from (args->>'revision')::bigint then
   if page.message is not distinct from args->>'message' and page.leaders=new_leaders then return jsonb_build_object('ok',true,'revision',page.revision,'updatedAt',page.updated_at);end if;
   return '{"error":"message_changed"}';
  end if;
  previous_message:=page.message;previous_leaders:=page.leaders;
  update transfer_private.welcome_pages set message=args->>'message',leaders=new_leaders,revision=revision+1,updated_at=now(),updated_by=actor where alliance=home returning * into page;
  insert into transfer_private.welcome_audit(alliance,actor,action,detail) values(home,actor,action,jsonb_build_object('previousMessage',previous_message,'previousLeaders',previous_leaders,'revision',page.revision));
  return jsonb_build_object('ok',true,'revision',page.revision,'updatedAt',page.updated_at);
 elsif action in ('contact','admin.contact') then
  roster:=transfer_private.welcome_roster(home);
  select value into entry from jsonb_array_elements(roster) where value->>'id'=args->>'playerId';
  if entry is null then return '{"error":"player_unavailable"}';end if;
  select l->>'name' into contact_name from jsonb_array_elements(page.leaders) l where l->>'id'=leader;
  if args->>'status' not in ('available','claimed','completed') or args->>'status' is null or length(contact_name)>100 or (args->>'status'<>'available' and coalesce(contact_name,'')='') then return '{"error":"invalid_contact"}';end if;
  if (entry#>>'{outreach,revision}')::bigint is distinct from (args->>'revision')::bigint then return '{"error":"contact_changed"}';end if;
  if args->>'status'='available' then contact_name:='';leader:='';end if;
  insert into transfer_private.welcome_contacts as target values(home,args->>'playerId',leader,args->>'status',contact_name,1,now())
  on conflict(alliance,player_key) do update set leader_id=excluded.leader_id,status=excluded.status,contact_name=excluded.contact_name,revision=target.revision+1,updated_at=now() returning * into contact;
  insert into transfer_private.welcome_audit(alliance,actor,action,detail) values(home,actor,action,jsonb_build_object('playerId',contact.player_key,'name',contact.contact_name,'status',contact.status,'previous',entry->'outreach'));
  return jsonb_build_object('ok',true, 'outreach',jsonb_build_object('leaderId',contact.leader_id,'name',contact.contact_name,'status',contact.status,'revision',contact.revision,'updatedAt',contact.updated_at));
 elsif action in ('note','admin.note','admin.teamNote') then
  if length(btrim(coalesce(args->>'note',''))) not between 1 and 2000 or coalesce(args->>'noteId','') !~ '^[a-f0-9-]{36}$' then return '{"error":"invalid_note"}';end if;
  if action='admin.teamNote' then
   contact_name:=coalesce(nullif(left(btrim(args->>'actorName'),100),''),'Transfer team');
  else
  select l->>'name' into contact_name from jsonb_array_elements(page.leaders) l where l->>'id'=leader;
  if contact_name is null then return '{"error":"invalid_contact"}';end if;
  end if;
  -- Commit through the portal's transaction path so revisions, events, and
  -- existing open portal sessions receive these notes immediately on refresh.
  select * into control from transfer_private.portal_control where singleton for update;
  roster:=transfer_private.welcome_roster(home);
  if not exists(select 1 from jsonb_array_elements(roster) r where r->>'id'=args->>'playerId') then return '{"error":"player_unavailable"}';end if;
  select payload into player from transfer_private.portal_records where kind='players' and key=args->>'playerId';
  note_id:=args->>'noteId';
  if exists(select 1 from jsonb_array_elements(coalesce(player->'history','[]')) h where h->>'welcomeNoteId'=note_id and h->>'welcomeAlliance'=home) then return '{"ok":true}';end if;
  player:=player||jsonb_build_object('updatedAt',now(),'history',jsonb_build_array(jsonb_build_object('by',contact_name||case when action='admin.teamNote' then ' · Transfer team' else ' · '||case when home='NvEM' then 'BaDa' else home end||' R4' end,'actorId',case when action='admin.teamNote' then actor else 'welcome:'||home||':'||leader end,'when',now(),'text','Conversation / note: ['||case when home='NvEM' then 'BaDa' else home end||case when action='admin.teamNote' then ' · Transfer team ' else ' · R4 ' end||contact_name||'] '||btrim(args->>'note'),'welcomeAlliance',home,'welcomeNoteId',note_id,'welcomeNote',btrim(args->>'note'),'welcomeAuthor',contact_name||case when action='admin.teamNote' then ' · Transfer team' else '' end))||coalesce(player->'history','[]'::jsonb));
  receipt:=public.transfer_portal_commit(control.admin_email,control.revision,'welcome-note-'||encode(extensions.digest(home||':'||(args->>'playerId')||':'||note_id,'sha256'),'hex'),jsonb_build_array(jsonb_build_object('kind','players','key',args->>'playerId','value',player)));
  if coalesce((receipt->>'retry')::boolean,false) then raise exception 'Portal revision changed';end if;
  insert into transfer_private.welcome_audit(alliance,actor,action,detail) values(home,actor,action,jsonb_build_object('playerId',args->>'playerId','noteId',note_id,'name',contact_name));
  return '{"ok":true}';
 elsif action in ('read','admin.read') then
  return jsonb_build_object('alliance',home,'message',page.message,'leaders',page.leaders,'revision',page.revision,'updatedAt',page.updated_at,'active',page.active,'players',transfer_private.welcome_roster(home));
 end if;
 return '{"error":"invalid_action"}';
end $$;
revoke all on function public.transfer_welcome(text,jsonb) from public,anon,authenticated;
grant execute on function public.transfer_welcome(text,jsonb) to service_role;
commit;
