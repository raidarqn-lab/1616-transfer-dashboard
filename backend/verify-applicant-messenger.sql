-- Run after applicant-messenger.sql within the same transaction; always roll back.
do $$
declare owner_email text; saved jsonb; login jsonb; result jsonb; aid uuid; item jsonb; n int; oldlogin jsonb;
 fixture text:='messenger-transaction-fixture'; payload jsonb;
begin
 select email into owner_email from nova_evidence_private.hub_staff where role='master' and status='active' and accounts_manage limit 1;
 if owner_email is null then raise exception 'No test operator';end if;
 if has_function_privilege('anon','public.nova_manual_accounts(text,jsonb)','EXECUTE') or has_function_privilege('authenticated','public.nova_manual_accounts(text,jsonb)','EXECUTE') then raise exception 'Public RPC access';end if;
 if has_function_privilege('anon','transfer_private.applicant_reference_message(jsonb)','EXECUTE') then raise exception 'Public message helper access';end if;
 begin
  perform public.nova_manual_accounts('hub-login-save',jsonb_build_object('staffEmail','forged@example.invalid','accountType','applicant_messenger'));
  raise exception 'Owner restriction bypassed';
 exception when raise_exception then if sqlerrm<>'Access denied' then raise;end if;end;
 saved:=public.nova_manual_accounts('hub-login-save',jsonb_build_object('staffEmail',owner_email,'accountType','applicant_messenger','displayName','Transactional Messenger','username','messenger_transaction_only','hash',repeat('a',64),'salt',repeat('b',64),'reason','Transactional verification only'));
 aid:=(saved->>'id')::uuid;
 login:=public.nova_manual_accounts('login-finish',jsonb_build_object('accountId',aid,'version',1));
 if login->>'token' is null or login->'user'->>'role' is distinct from 'applicant_messenger' or login->'user' ? 'leaderEmail' or login->'user' ? 'playerRef' then raise exception 'Messenger identity incorrectly scoped';end if;
 if exists(select 1 from nova_evidence_private.member_links where account_id=aid) then raise exception 'Messenger got member access';end if;
 result:=public.nova_manual_accounts('hub-login-search',jsonb_build_object('staffEmail',owner_email,'query','messenger_transaction_only'));
 if result->'accounts'->0->>'accountType' is distinct from 'applicant_messenger' then raise exception 'Owner search missing messenger';end if;
 payload:=jsonb_build_object('name','Messenger Fixture Applicant','server',1626,'group','Glass House 2','status','Pending','notes','PRIVATE NOTES MUST NEVER APPEAR','history',jsonb_build_array('PRIVATE HISTORY'),
  'rawApplication',jsonb_build_object('private','RAW APPLICATION'), 'applicationId','fixture-app',
  'applicationConfirmations',jsonb_build_array(jsonb_build_object('applicationId','fixture-app','confirmationCode','1616-FIXTURE-12345678')));
 insert into transfer_private.portal_records(kind,key,revision,payload) values('players',fixture,1,payload),
 ('players',fixture||'-contact',1,payload||'{"general":true}'),('players',fixture||'-prospect',1,payload||'{"prospect":true}'),
 ('players',fixture||'-deleted',1,payload||'{"deleted":true}'),('players',fixture||'-outbound',1,payload||'{"transferDirection":"outbound"}'),
 ('players',fixture||'-inbound',1,payload||'{"transferDirection":"inbound"}'),('players',fixture||'-transferred',1,payload||'{"status":"Transferred"}'),
 ('players',fixture||'-withdrawn',1,payload||'{"status":"Withdrawn"}'),('players',fixture||'-merged',1,payload||'{"mergedInto":"other"}');
 result:=public.nova_manual_accounts('applicant-messenger-list',jsonb_build_object('token',login->>'token','staffEmail',owner_email));
 select count(*) into n from jsonb_array_elements(result->'applicants') x where x->>'id' like fixture||'%';
 if n<>1 then raise exception 'Directory included non-applicants: %',n;end if;
 for item in select value from jsonb_array_elements(result->'applicants') loop
  if item - array['id','name','message','server','transferGroup','status','approval','destinationAlliance','confirmedSeat','rejectionReasonCode','rejectionReasonText'] <> '{}'::jsonb then raise exception 'Private fields in response';end if;
 end loop;
 if result::text like '%PRIVATE NOTES%' or result::text like '%PRIVATE HISTORY%' or result::text like '%RAW APPLICATION%' then raise exception 'Private information leaked';end if;
 select value into item from jsonb_array_elements(result->'applicants') where value->>'id'=fixture;
 if item->>'message' is distinct from 'Hi Messenger Fixture Applicant, to edit or check the status of your application, you can go to www.join1616.com and use the confirmation code that you received when applying to transfer to the server. For your reference, this code is 1616-FIXTURE-12345678' then raise exception 'Message wording or code incorrect';end if;
 if transfer_private.applicant_reference_message(payload-'applicationConfirmations') is not null then raise exception 'Invented absent code';end if;
 if transfer_private.applicant_reference_message((payload-'applicationId')||jsonb_build_object('applicationConfirmations',jsonb_build_array(jsonb_build_object('confirmationCode','1616-FIXTURE-12345678'),jsonb_build_object('confirmationCode','1616-SECOND-12345678')))) is not null then raise exception 'Ambiguous code selected';end if;

 if item->>'server' is distinct from '1626' or item->>'transferGroup' is distinct from 'Glass House 2' or item->>'status' is distinct from 'Pending' then raise exception 'Basic applicant details mismatch';end if;
 if item->>'destinationAlliance' is not null or item->>'confirmedSeat' is not null then raise exception 'Invented allocation';end if;
 insert into transfer_private.portal_records(kind,key,revision,payload) values('shared','transferOrganization',1,jsonb_build_object('data',jsonb_build_object('assignments',jsonb_build_object(fixture,'WaE'))))
 on conflict(kind,key) do update set payload=jsonb_set(coalesce(transfer_private.portal_records.payload,'{}'),'{data}',coalesce(transfer_private.portal_records.payload->'data','{}')||jsonb_build_object('assignments',coalesce(transfer_private.portal_records.payload#>'{data,assignments}','{}')||jsonb_build_object(fixture,'WaE')));
 item:=transfer_private.applicant_messenger_details(fixture,payload||'{"status":"Approved","confirmedSeat":"Blue","seat":"Gold","rejectionReasonCode":"other","rejectionReasonText":"STALE REASON"}');
 if item->>'destinationAlliance' is distinct from 'WaE' or item->>'confirmedSeat' is distinct from 'Blue' or item->>'approval' is distinct from 'approved' or item->>'rejectionReasonText' is not null then raise exception 'Approval allocation mismatch';end if;
 update transfer_private.portal_records as rec set payload=rec.payload||'{"status":"Declined","confirmedSeat":"Blue","rejectionReasonCode":"low_kills","rejectionReasonText":"The exact saved applicant-facing message."}' where kind='players' and key=fixture;
 result:=public.nova_manual_accounts('applicant-messenger-list',jsonb_build_object('token',login->>'token'));
 select value into item from jsonb_array_elements(result->'applicants') where value->>'id'=fixture;
 if item->>'rejectionReasonText' is distinct from 'The exact saved applicant-facing message.' or item->>'destinationAlliance' is not null or item->>'confirmedSeat' is not null or item->>'approval' is distinct from 'declined' then raise exception 'Rejected application mismatch';end if;
 item:=transfer_private.applicant_messenger_details(fixture,payload||'{"status":"Declined","rejectionReasonCode":"internal_only","rejectionReasonText":"PRIVATE DECISION"}');
 if item->>'rejectionReasonText' is not null then raise exception 'Unknown reason exposed';end if;
 if has_function_privilege('anon','transfer_private.applicant_messenger_details(text,jsonb)','EXECUTE') then raise exception 'Public detail helper access';end if;
 oldlogin:=login;
 perform public.nova_manual_accounts('hub-login-save',jsonb_build_object('staffEmail',owner_email,'accountType','applicant_messenger','accountId',aid,'displayName','Renamed Messenger','username','messenger_transaction_only','hash',repeat('c',64),'salt',repeat('b',64),'reason','Reset test login'));
 result:=public.nova_manual_accounts('applicant-messenger-list',jsonb_build_object('token',oldlogin->>'token'));
 if result->>'error' is distinct from 'access_denied' then raise exception 'Reset session retains directory';end if;
 login:=public.nova_manual_accounts('login-finish',jsonb_build_object('accountId',aid,'version',2));
 update nova_evidence_private.manual_sessions set expires_at=now()-interval '1 second' where account_id=aid;
 result:=public.nova_manual_accounts('applicant-messenger-list',jsonb_build_object('token',login->>'token'));
 if result->>'error' is distinct from 'access_denied' then raise exception 'Expired session retains directory';end if;
 login:=public.nova_manual_accounts('login-finish',jsonb_build_object('accountId',aid,'version',2));
 perform public.nova_manual_accounts('hub-login-disable',jsonb_build_object('staffEmail',owner_email,'accountId',aid));
 result:=public.nova_manual_accounts('applicant-messenger-list',jsonb_build_object('token',login->>'token'));
 if result->>'error' is distinct from 'access_denied' then raise exception 'Disabled login retains directory';end if;
 result:=public.nova_manual_accounts('applicant-messenger-list',jsonb_build_object('token',repeat('0',64)));
 if result->>'error' is distinct from 'access_denied' then raise exception 'Forged session accepted';end if;
end $$;
