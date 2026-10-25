begin;

create or replace function transfer_private.seat_confirmation_row(k text,p jsonb,rev bigint) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',k,'name',p->>'name','server',p->>'server','currentAlliance',left(btrim(coalesce(p->>'alliance','')),100),
  'message',transfer_private.applicant_reference_message(p),'transferGroup',p->>'group','transferLead',transfer_private.seat_transfer_lead(p->>'group'),'status',p->>'status','confirmedSeat',case when p->>'confirmedSeat' in ('Gold','Purple','Blue','White') then p->>'confirmedSeat' end,
  'confirmedBy',left(p->>'seatConfirmedBy',100),'confirmerId',p->>'seatConfirmedById','confirmedAt',p->>'seatConfirmedAt','revision',rev)
$$;

revoke all on function transfer_private.seat_confirmation_row(text,jsonb,bigint) from public,anon,authenticated;
commit;
