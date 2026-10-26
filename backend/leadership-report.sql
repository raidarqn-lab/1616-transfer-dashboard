begin;
alter table nova_evidence_private.manual_accounts drop constraint manual_account_scope;
alter table nova_evidence_private.manual_accounts add constraint manual_account_scope check (
 (account_type='standard' and (player_key is not null or leader_email is not null)) or
 (account_type in ('applicant_messenger','leadership_report') and player_key is null and leader_email is null and length(trim(display_name)) between 1 and 100 and display_name is not null));

-- Expand only the scoped identity branch; keep all existing member/leader checks.
do $$declare definition text;begin
 select pg_get_functiondef('nova_evidence_private.manual_identity(uuid)'::regprocedure) into definition;
 if position('leadership_report' in definition)=0 then
  if position('a.account_type = ''applicant_messenger''' in definition)=0 and position('a.account_type=''applicant_messenger''' in definition)=0 then raise exception 'Unexpected manual identity';end if;
  definition:=replace(replace(definition,'a.account_type = ''applicant_messenger''','a.account_type in (''applicant_messenger'',''leadership_report'')'),'a.account_type=''applicant_messenger''','a.account_type in (''applicant_messenger'',''leadership_report'')');
  definition:=replace(definition,'''role'', ''applicant_messenger''','''role'', a.account_type');
  definition:=replace(definition,'''role'',''applicant_messenger''','''role'',a.account_type');
  execute definition;
 end if;
end $$;

create or replace function transfer_private.leadership_report_action(action text,args jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare identity jsonb; actor text:=lower(args->>'staffEmail'); result jsonb; a nova_evidence_private.manual_accounts;
 account uuid; uname text:=lower(trim(coalesce(args->>'username','')));
begin
 if action='leadership-report-list' then
  if args ? 'token' then
   identity:=public.nova_manual_accounts('session',jsonb_build_object('token',args->>'token'))->'user';
   if identity->>'role' is distinct from 'leadership_report' then return '{"error":"access_denied"}';end if;
  elsif actor is null or not exists(select 1 from transfer_private.portal_control where singleton and admin_email=actor) then
   return '{"error":"access_denied"}';
  end if;
  -- Report-only allowlist. Never send codes, messages, screenshots, notes or full profiles.
  select coalesce(jsonb_agg(jsonb_build_object('name',payload->>'name','group',payload->>'group','server',payload->'server',
   'alliance',payload->>'alliance','power',payload->'power','kills',payload->'kills','hqLevel',payload->'hqLevel',
   'profession',payload->'profession','confirmedSeat',payload->>'confirmedSeat','status',payload->>'status',
   'transferDirection',payload->>'transferDirection') order by lower(payload->>'name'),key),'[]') into result
  from transfer_private.portal_records where kind='players'
   and coalesce(payload->>'deleted','false')<>'true' and coalesce(payload->>'general','false')<>'true'
   and coalesce(payload->>'prospect','false')<>'true' and coalesce(payload->>'status','')<>'deleted'
   and nullif(payload->>'mergedInto','') is null;
  return jsonb_build_object('players',result,'updatedAt',now());
 end if;
 if not exists(select 1 from nova_evidence_private.hub_staff where email=actor and status='active' and role='master' and accounts_manage) then raise exception 'Access denied';end if;
 if action='hub-report-list' then
  select coalesce(jsonb_agg(jsonb_build_object('id',account_id,'displayName',display_name,'username',username,'active',active) order by lower(display_name),username),'[]') into result
  from nova_evidence_private.manual_accounts where account_type='leadership_report';
  return jsonb_build_object('accounts',result);
 end if;
 if action<>'hub-report-save' then raise exception 'Unknown action';end if;
 if uname !~ '^[a-z0-9_]{3,32}$' then raise exception 'Use 3–32 lowercase letters, numbers or underscores';end if;
 if coalesce(args->>'hash','') !~ '^[a-f0-9]{64}$' or coalesce(args->>'salt','') !~ '^[a-f0-9]{64}$' then raise exception 'Invalid password hash';end if;
 if length(trim(coalesce(args->>'displayName',''))) not between 1 and 100 then raise exception 'Enter a display name of 1–100 characters';end if;
 account:=nullif(args->>'accountId','')::uuid;
 if account is null then
  account:=gen_random_uuid();
  insert into nova_evidence_private.manual_accounts(account_id,account_type,display_name,username,password_hash,password_salt,updated_by)
  values(account,'leadership_report',trim(args->>'displayName'),uname,args->>'hash',args->>'salt',actor);
 else
  select * into a from nova_evidence_private.manual_accounts where account_id=account for update;
  if a.account_id is null or a.account_type<>'leadership_report' then raise exception 'Account identity does not match';end if;
  update nova_evidence_private.manual_accounts set username=uname,display_name=trim(args->>'displayName'),password_hash=args->>'hash',password_salt=args->>'salt',active=true,version=version+1,updated_at=now(),updated_by=actor where account_id=account;
 end if;
 insert into nova_evidence_private.hub_audit(actor_email,action,subject,detail) values(actor,action,account::text,jsonb_build_object('username',uname,'accountType','leadership_report'));
 return jsonb_build_object('ok',true,'id',account,'username',uname);
end $$;
revoke all on function transfer_private.leadership_report_action(text,jsonb) from public,anon,authenticated;
do $$declare definition text; marker text:=' if action=''applicant-messenger-list'' then'; injection text:=' if action in (''leadership-report-list'',''hub-report-list'',''hub-report-save'') then return transfer_private.leadership_report_action(action,args);end if;';begin
 select pg_get_functiondef('public.nova_manual_accounts(text,jsonb)'::regprocedure) into definition;
 if position(injection in definition)=0 then
  if position(marker in definition)=0 then raise exception 'Unexpected account function';end if;
  execute replace(definition,marker,injection||E'\n'||marker);
 end if;
end $$;
commit;
