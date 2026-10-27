begin;
set local lock_timeout = '3s';
set local statement_timeout = '20s';

-- Called only after successful receipt validation and atomic evidence storage.
-- Staff confirmations take precedence over an applicant's form submission.
create or replace function transfer_private.confirm_application_evidence_seat(aid text)
returns text language plpgsql set search_path='' as $$
declare a transfer_private.applications%rowtype; p jsonb; k text; colour text;
 evidence_version uuid; portal_revision bigint; next_p jsonb; events jsonb;
 own_confirmation boolean; capacity jsonb; seat_limit numeric;
 at text:=to_char(clock_timestamp() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
 select revision into portal_revision from transfer_private.portal_control where singleton for update;
 select * into a from transfer_private.applications where id=aid;
 if a.id is null or a.payload->>'seatEvidenceVersion' is distinct from '1' then return 'legacy_or_missing';end if;
 colour:=case lower(a.payload->>'seatColour') when 'gold' then 'Gold' when 'purple' then 'Purple' when 'blue' then 'Blue' when 'white' then 'White' when 'unknownseat' then '' end;
 if colour is null then return 'invalid_colour';end if;
 select version into evidence_version from transfer_private.application_transfer_evidence where application_id=aid;
 if colour<>'' and evidence_version is null then return 'missing_evidence';end if;
 if (select count(*) from transfer_private.portal_records where kind='players' and coalesce(payload->>'deleted','false')<>'true'
  and (payload->>'applicationId'=aid or coalesce(payload->'applicationIds','[]'::jsonb)?aid))<>1 then return 'ambiguous_link';end if;
 select key,payload into k,p from transfer_private.portal_records where kind='players' and coalesce(payload->>'deleted','false')<>'true'
  and (payload->>'applicationId'=aid or coalesce(payload->'applicationIds','[]'::jsonb)?aid);
 if not coalesce(transfer_private.seat_confirmation_eligible(p),false) then return 'ineligible';end if;
 own_confirmation:=coalesce(p->>'seatConfirmedBy'='Applicant (application form)'
  and p->>'seatConfirmedById'='applicant:'||aid and p->>'seatConfirmedActor'='applicant:'||aid,false);
 if coalesce(p->>'confirmedSeat','')<>'' and not own_confirmation then return 'preserved_confirmation';end if;
 if colour='' and not own_confirmation then return 'unknown_colour';end if;
 if coalesce(p->>'confirmedSeat','')=colour and own_confirmation then return 'unchanged';end if;
 -- Maintain the same capacity rule as a staff confirmation for approved players.
 if p->>'status'='Approved' and colour<>'' then
  select payload->'data' into capacity from transfer_private.portal_records where kind='shared' and key='capacities';
  if jsonb_typeof(capacity->colour) is distinct from 'number' or (capacity->>colour) !~ '^[0-9]+$' then return 'capacity_unavailable';end if;
  seat_limit:=(capacity->>colour)::numeric;
  if (select count(*) from transfer_private.portal_records r where r.kind='players' and r.key<>k
   and coalesce(r.payload->>'deleted','false')<>'true' and coalesce(r.payload->>'general','false')<>'true'
   and coalesce(r.payload->>'prospect','false')<>'true' and r.payload->>'status' in ('Approved','Transferred')
   and r.payload->>'confirmedSeat'=colour)>=seat_limit then return 'capacity_full';end if;
 end if;
 next_p:=p||jsonb_build_object('confirmedSeat',colour,
  'seatConfirmedBy',case when colour<>'' then 'Applicant (application form)' else '' end,
  'seatConfirmedById',case when colour<>'' then 'applicant:'||aid else '' end,
  'seatConfirmedActor',case when colour<>'' then 'applicant:'||aid else '' end,
  'seatConfirmedAt',case when colour<>'' then coalesce(a.edited_at,a.created_at)::text else '' end,
  'updatedAt',at,'history',jsonb_build_array(jsonb_build_object('by','Applicant (application form)',
   'actorId','applicant:'||aid,'when',at,'text',case when colour='' then 'Applicant changed their seat colour to unknown.'
    else 'Seat confirmed: '||colour||'. Submitted by applicant with transfer screenshot.' end))||coalesce(p->'history','[]'::jsonb));
 update transfer_private.portal_records set payload=next_p,revision=portal_revision+1 where kind='players' and key=k;
 update transfer_private.portal_control set revision=portal_revision+1 where singleton;
 events:=jsonb_build_array(jsonb_build_object('kind','players','key',k,'value',next_p||jsonb_build_object('_rev',portal_revision+1)));
 insert into transfer_private.portal_transactions(id,actor,events,revision)
  values('application-seat-'||gen_random_uuid()::text,'intake',events,portal_revision+1);
 return 'updated';
end $$;
revoke all on function transfer_private.confirm_application_evidence_seat(text) from public,anon,authenticated;

-- Patch only the final successful-write branch; lookups, stale edits and replays
-- must not change confirmations. Abort if the deployed wrapper has changed.
do $$declare definition text; marker text:=E' return result;\nend';
begin
 select pg_get_functiondef('public.transfer_intake_with_evidence(jsonb)'::regprocedure) into definition;
 if position('transfer_private.confirm_application_evidence_seat' in definition)=0 then
  if position(marker in definition)=0 or position('if image_text is not null and not replay then' in definition)=0 then
   raise exception 'Unexpected evidence intake wrapper';end if;
  execute replace(definition,marker,E' if not replay then perform transfer_private.confirm_application_evidence_seat(request#>>''{payload,applicationId}'');end if;\n'||marker);
 end if;
end $$;

-- Repair existing new-form submissions using the same guarded path. Most recent
-- application wins if multiple applications were merged into one player.
do $$declare a record;
begin
 for a in select id from transfer_private.applications where payload->>'seatEvidenceVersion'='1'
  order by coalesce(edited_at,created_at) desc,id loop
  perform transfer_private.confirm_application_evidence_seat(a.id);
 end loop;
end $$;
commit;
