begin;
create table if not exists nova_evidence_private.manual_accounts(
 account_id uuid primary key, player_key text unique, leader_email text unique,
 username text not null unique check(username ~ '^[a-z0-9_]{3,32}$'),
 password_hash text not null check(password_hash ~ '^[a-f0-9]{64}$'),
 password_salt text not null check(password_salt ~ '^[a-f0-9]{64}$'),
 version bigint not null default 1, active boolean not null default true,
 updated_at timestamptz not null default now(), updated_by text not null,
 check(player_key is not null or leader_email is not null)
);
create table if not exists nova_evidence_private.manual_sessions(
 hash text primary key, account_id uuid not null references nova_evidence_private.manual_accounts(account_id),
 version bigint not null, expires_at timestamptz not null
);
create table if not exists nova_evidence_private.manual_login_limits(
 key text primary key, started_at timestamptz not null, attempts integer not null
);
alter table nova_evidence_private.manual_accounts enable row level security;
alter table nova_evidence_private.manual_sessions enable row level security;
alter table nova_evidence_private.manual_login_limits enable row level security;
revoke all on nova_evidence_private.manual_accounts,nova_evidence_private.manual_sessions,nova_evidence_private.manual_login_limits from public,anon,authenticated;

create or replace function nova_evidence_private.manual_identity(account uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',a.account_id,'uid','manual:'||a.account_id,'username',a.username,
  'playerRef',a.player_key,'playerName',coalesce(p.payload->>'name',i.display_name,a.username),
  'leaderEmail',case when h.status='active' then h.email end)
 from nova_evidence_private.manual_accounts a
 left join transfer_private.portal_records p on p.kind='players' and p.key=a.player_key
 left join nova_evidence_private.admin_identities i on i.email=a.leader_email
 left join nova_evidence_private.hub_staff h on h.email=a.leader_email
 where a.account_id=account and a.active and (
  h.status='active' or exists(select 1 from nova_evidence_private.member_links m where m.account_id=a.account_id and m.player_key=a.player_key and m.active
   and lower(regexp_replace(coalesce(p.payload->>'alliance',''),'[^a-zA-Z0-9]','','g')) in ('nvsp','novasapphire')
   and coalesce(p.payload->>'status','')<>'deleted'))
$$;
revoke all on function nova_evidence_private.manual_identity(uuid) from public,anon,authenticated;

create or replace function public.nova_manual_accounts(action text,args jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a nova_evidence_private.manual_accounts; actor text:=lower(args->>'staffEmail');
 target text:=nullif(lower(args->>'targetEmail'),''); player text:=nullif(args->>'playerKey','');
 uname text:=lower(trim(coalesce(args->>'username',''))); account uuid; profile jsonb; linked text;
 raw text; identity jsonb; k text; n int; result jsonb; q text; expiry timestamptz;
begin
 if action='login-begin' then
  -- Limits commit even when authentication fails; never raise on failed login.
  delete from nova_evidence_private.manual_login_limits where started_at<now()-interval '1 day';
  foreach k in array array['global','ip:'||left(coalesce(args->>'ip','unknown'),128),'user:'||encode(extensions.digest(uname,'sha256'),'hex')] loop
   insert into nova_evidence_private.manual_login_limits as limits values(k,now(),1)
   on conflict(key) do update set
    attempts=case when limits.started_at<now()-interval '10 minutes' then 1 else limits.attempts+1 end,
    started_at=case when limits.started_at<now()-interval '10 minutes' then now() else limits.started_at end
   returning attempts into n;
   if n>(case when k='global' then 500 when k like 'ip:%' then 40 else 10 end) then return '{"error":"try_later"}';end if;
  end loop;
  select * into a from nova_evidence_private.manual_accounts where username=uname;
  if a.account_id is null or not a.active then return '{}';end if;
  return jsonb_build_object('accountId',a.account_id,'hash',a.password_hash,'salt',a.password_salt,'version',a.version);
 elsif action='login-finish' then
  select * into a from nova_evidence_private.manual_accounts where account_id=(args->>'accountId')::uuid and version=(args->>'version')::bigint and active for share;
  if a.account_id is null then return '{"error":"invalid_login"}';end if;
  identity:=nova_evidence_private.manual_identity(a.account_id);
  if identity is null then return '{"error":"invalid_login"}';end if;
  delete from nova_evidence_private.manual_sessions where expires_at<now();
  raw:=encode(extensions.gen_random_bytes(32),'hex');expiry:=now()+interval '8 hours';
  insert into nova_evidence_private.manual_sessions values(encode(extensions.digest(raw,'sha256'),'hex'),a.account_id,a.version,expiry);
  return jsonb_build_object('token',raw,'expiresAt',expiry,'user',identity);
 elsif action in ('session','logout') then
  if coalesce(args->>'token','') !~ '^[a-f0-9]{64}$' then return '{"error":"invalid_session"}';end if;
  k:=encode(extensions.digest(args->>'token','sha256'),'hex');
  if action='logout' then delete from nova_evidence_private.manual_sessions where hash=k;return '{"ok":true}';end if;
  select a1.* into a from nova_evidence_private.manual_sessions s join nova_evidence_private.manual_accounts a1 on a1.account_id=s.account_id and a1.version=s.version where s.hash=k and s.expires_at>now() and a1.active;
  identity:=nova_evidence_private.manual_identity(a.account_id);
  if identity is null then return '{"error":"invalid_session"}';end if;
  return jsonb_build_object('user',identity);
 end if;
 if not exists(select 1 from nova_evidence_private.hub_staff where email=actor and status='active' and role='master' and accounts_manage) then raise exception 'Access denied';end if;
 if action='hub-login-search' then
  q:=lower(trim(coalesce(args->>'query','')));if length(q)<2 then raise exception 'Enter at least two characters';end if;
  with candidates as (
   select p.key as player_key, coalesce(p.payload->>'name','Player') as name,p.payload->>'alliance' as alliance,p.payload->>'server' as server,
    h.email as leader_email,h.status as leader_status
   from transfer_private.portal_records p
   left join nova_evidence_private.admin_identities i on i.player_key=p.key
   left join nova_evidence_private.hub_staff h on h.email=i.email
   where p.kind='players' and coalesce(p.payload->>'status','')<>'deleted'
    and (lower(regexp_replace(coalesce(p.payload->>'alliance',''),'[^a-zA-Z0-9]','','g')) in ('nvsp','novasapphire') or h.email is not null)
   union all
   select null,coalesce(i.display_name,h.email),null,null,h.email,h.status
   from nova_evidence_private.hub_staff h left join nova_evidence_private.admin_identities i on i.email=h.email
   where i.player_key is null or not exists(select 1 from transfer_private.portal_records p where p.kind='players' and p.key=i.player_key)
  ) select coalesce(jsonb_agg(row_data order by name),'[]') into result from (
   select c.name,jsonb_build_object('id',a1.account_id,'playerKey',c.player_key,'playerName',c.name,'targetEmail',c.leader_email,
    'leadership',c.leader_email is not null,'leaderStatus',c.leader_status,'username',a1.username,'state',case when a1.account_id is null then 'needs_setup' when a1.active then 'active' else 'disabled' end,'alliance',c.alliance,'server',c.server) as row_data
   from candidates c left join nova_evidence_private.manual_accounts a1 on (c.player_key is not null and a1.player_key=c.player_key) or (c.player_key is null and a1.leader_email=c.leader_email)
   where position(q in lower(c.name))>0 or position(q in coalesce(a1.username,''))>0 or position(q in coalesce(c.leader_email,''))>0
   order by c.name limit 100
  ) matches;
  return jsonb_build_object('accounts',result);
 elsif action='hub-login-disable' then
  update nova_evidence_private.manual_accounts set active=false,version=version+1,updated_by=actor,updated_at=now() where account_id=(args->>'accountId')::uuid returning * into a;
  if a.account_id is null then raise exception 'Account not found';end if;
  insert into nova_evidence_private.hub_audit(actor_email,action,subject) values(actor,action,a.account_id::text);
  return '{"ok":true}';
 elsif action<>'hub-login-save' then raise exception 'Unknown action';end if;
 if uname !~ '^[a-z0-9_]{3,32}$' then raise exception 'Use 3–32 lowercase letters, numbers or underscores';end if;
 if coalesce(args->>'hash','') !~ '^[a-f0-9]{64}$' or coalesce(args->>'salt','') !~ '^[a-f0-9]{64}$' then raise exception 'Invalid password hash';end if;
 if length(trim(coalesce(args->>'reason',''))) not between 8 and 500 then raise exception 'Enter a reason of 8–500 characters';end if;
 if target is not null then
  if not exists(select 1 from nova_evidence_private.hub_staff where email=target and status='active') then raise exception 'Leadership access is not active';end if;
  select player_key into linked from nova_evidence_private.admin_identities where email=target;
  if player is distinct from linked and linked is not null then raise exception 'Leadership player link does not match';end if;
 end if;
 if player is not null then
  select payload into profile from transfer_private.portal_records where kind='players' and key=player;
  if profile is null or coalesce(profile->>'status','')='deleted' then raise exception 'Player profile not found';end if;
  if target is null and lower(regexp_replace(coalesce(profile->>'alliance',''),'[^a-zA-Z0-9]','','g')) not in ('nvsp','novasapphire') then raise exception 'Select a Sapphire player';end if;
 elsif target is null then raise exception 'Select a player or leader';end if;
 -- Serialize identity creation; username uniqueness is also enforced by its index.
 perform pg_advisory_xact_lock(hashtext(coalesce(player,target)));
 select * into a from nova_evidence_private.manual_accounts where (player is not null and player_key=player) or (target is not null and leader_email=target) for update;
 if nullif(args->>'accountId','') is not null and a.account_id is distinct from (args->>'accountId')::uuid then raise exception 'Account changed; search again';end if;
 if a.account_id is not null and (a.player_key is distinct from player or a.leader_email is not null and a.leader_email is distinct from target) then raise exception 'Account identity does not match';end if;
 account:=a.account_id;
 if account is null then
  select account_id into account from nova_evidence_private.member_links where player_key=player and active;
  account:=coalesce(account,gen_random_uuid());
  insert into nova_evidence_private.manual_accounts(account_id,player_key,leader_email,username,password_hash,password_salt,updated_by)
   values(account,player,target,uname,args->>'hash',args->>'salt',actor);
 else
  update nova_evidence_private.manual_accounts set username=uname,password_hash=args->>'hash',password_salt=args->>'salt',leader_email=target,active=true,version=version+1,updated_at=now(),updated_by=actor where account_id=account;
 end if;
 if player is not null and lower(regexp_replace(coalesce(profile->>'alliance',''),'[^a-zA-Z0-9]','','g')) in ('nvsp','novasapphire') then
  insert into nova_evidence_private.member_links(account_id,player_key,active,historical_until) values(account,player,true,now())
   on conflict(account_id) do nothing;
 end if;
 insert into nova_evidence_private.hub_audit(actor_email,action,subject,detail) values(actor,action,account::text,jsonb_build_object('username',uname,'reason',left(args->>'reason',500),'leadership',target is not null));
 return jsonb_build_object('ok',true,'id',account,'username',uname,'state','active');
end; $$;
revoke all on function public.nova_manual_accounts(text,jsonb) from public,anon,authenticated;
grant execute on function public.nova_manual_accounts(text,jsonb) to service_role;
commit;
