-- Run in a transaction and roll back. Only fictional records are created.
begin;
do $$declare
 code text:='1616-VERIFY-EVIDENCE-20261027-SEAT'; aid text:='APP-VERIFY-EVIDENCE-20261027-SEAT';
 p jsonb; e jsonb; r jsonb; k text; rev bigint;
begin
 if exists(select 1 from transfer_private.applications where id=aid) then raise exception 'Fixture already exists';end if;
 p:=jsonb_build_object('applicationId',aid,'confirmationCode',code,'username','Fictional evidence test','currentServer','1600','alliance','TEST','groupMembers','[]'::jsonb,'seatColour','blue','seatEvidenceVersion','1');
 e:='{"image":"data:image/jpeg;base64,/9j/2Q==","version":"11111111-1111-4111-8111-111111111111"}';
 r:=public.transfer_intake_with_evidence(jsonb_build_object('requestType','application','confirmationCode',code,'payload',p));
 if r->>'errorCode' is distinct from 'image_required' then raise exception 'Missing evidence accepted';end if;
 if exists(select 1 from transfer_private.applications where id=aid) then raise exception 'Partial application saved';end if;
 r:=public.transfer_intake_with_evidence(jsonb_build_object('requestType','application','confirmationCode',code,'payload',p,'transferEvidence',e));
 if r->>'ok' is distinct from 'true' then raise exception 'Create failed: %',r;end if;
 select key into k from transfer_private.portal_records where kind='players' and payload->>'applicationId'=aid;
 if k is null then raise exception 'Player missing';end if;
 if (select payload->>'confirmedSeat' from transfer_private.portal_records where kind='players' and key=k) is distinct from 'Blue' then raise exception 'Applicant colour was not confirmed';end if;
 if (select payload->>'seatConfirmedBy' from transfer_private.portal_records where kind='players' and key=k) is distinct from 'Applicant (application form)' then raise exception 'Missing attribution';end if;
 if not exists(select 1 from transfer_private.latest_seat_image(k) where version::text=e->>'version') then raise exception 'Team cannot see evidence';end if;
 r:=public.transfer_intake_with_evidence(jsonb_build_object('requestType','application.lookup','confirmationCode',code));
 if r->'transferEvidence' is distinct from e or r->'application' ? 'transferEvidence' then raise exception 'Lookup evidence isolation failed';end if;
 r:=public.transfer_intake_with_evidence(jsonb_build_object('requestType','application.update','confirmationCode',code,'payload',p,'editRevision',0,'editRequestId','verify-evidence-edit-1'));
 if r->>'ok' is distinct from 'true' or not exists(select 1 from transfer_private.application_transfer_evidence where application_id=aid) then raise exception 'Edit did not preserve image';end if;
 e:=jsonb_set(e,'{version}','"22222222-2222-4222-8222-222222222222"');
 r:=public.transfer_intake_with_evidence(jsonb_build_object('requestType','application.update','confirmationCode',code,'payload',p,'transferEvidence',e,'editRevision',1,'editRequestId','verify-evidence-edit-2'));
 if r->>'ok' is distinct from 'true' then raise exception 'Replacement failed';end if;
 r:=public.transfer_intake_with_evidence(jsonb_build_object('requestType','application.update','confirmationCode',code,'payload',p,'transferEvidence',jsonb_set(e,'{version}','"33333333-3333-4333-8333-333333333333"'),'editRevision',1,'editRequestId','verify-evidence-edit-2'));
 if (select version::text from transfer_private.application_transfer_evidence where application_id=aid)<>e->>'version' then raise exception 'Retry replaced image';end if;
 r:=public.transfer_intake_with_evidence(jsonb_build_object('requestType','application.update','confirmationCode',code,'payload',p,'transferEvidence',e,'editRevision',0,'editRequestId','verify-evidence-stale'));
 if r->>'errorCode' is distinct from 'conflict' then raise exception 'Stale edit accepted';end if;
 r:=public.transfer_intake_with_evidence(jsonb_build_object('requestType','application.lookup','confirmationCode','1616-WRONG-RECEIPT'));
 if r->>'ok'='true' or r ? 'transferEvidence' then raise exception 'Wrong receipt exposed image';end if;
 if has_function_privilege('anon','public.transfer_intake_with_evidence(jsonb)','execute') or has_function_privilege('authenticated','transfer_private.latest_seat_image(text)','execute') or has_table_privilege('anon','transfer_private.application_transfer_evidence','select') then raise exception 'Public evidence access';end if;

 -- Edits track the applicant's new confirmed colour and unknown state.
 p:=p||'{"seatColour":"purple"}';
 r:=public.transfer_intake_with_evidence(jsonb_build_object('requestType','application.update','confirmationCode',code,'payload',p,'editRevision',2,'editRequestId','verify-seat-colour-3'));
 if r->>'ok' is distinct from 'true' or (select payload->>'confirmedSeat' from transfer_private.portal_records where kind='players' and key=k) is distinct from 'Purple' then raise exception 'Colour edit failed: %',r;end if;
 p:=p||'{"seatColour":"unknownSeat"}';
 r:=public.transfer_intake_with_evidence(jsonb_build_object('requestType','application.update','confirmationCode',code,'payload',p,'editRevision',3,'editRequestId','verify-seat-unknown-4'));
 if r->>'ok' is distinct from 'true' or (select payload->>'confirmedSeat' from transfer_private.portal_records where kind='players' and key=k) is distinct from '' then raise exception 'Unknown colour retained stale confirmation';end if;
 -- Staff review wins, even if its colour differs from the applicant's next edit.
 update transfer_private.portal_records set payload=payload||'{"confirmedSeat":"White","seatConfirmedBy":"Test staff","seatConfirmedById":"staff:test","seatConfirmedActor":"test"}' where kind='players' and key=k;
 p:=p||'{"seatColour":"gold"}';
 r:=public.transfer_intake_with_evidence(jsonb_build_object('requestType','application.update','confirmationCode',code,'payload',p,'editRevision',4,'editRequestId','verify-seat-staff-5'));
 if r->>'ok' is distinct from 'true' or (select payload->>'confirmedSeat' from transfer_private.portal_records where kind='players' and key=k) is distinct from 'White' then raise exception 'Staff confirmation overwritten';end if;
 -- Helper is idempotent and must not create a route around authentication.
 if transfer_private.confirm_application_evidence_seat(aid)<>'preserved_confirmation' then raise exception 'Staff precedence failed';end if;
 if has_function_privilege('anon','transfer_private.confirm_application_evidence_seat(text)','execute') or has_function_privilege('authenticated','transfer_private.confirm_application_evidence_seat(text)','execute') then raise exception 'Public confirmation access';end if;
end $$;
select 'Applicant seat confirmation: create, colour edits, unknown, staff precedence, screenshot recall, retries, stale writes and privacy passed' as result;
rollback;
