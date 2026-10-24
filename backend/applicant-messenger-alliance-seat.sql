begin;
create or replace function transfer_private.applicant_messenger_details(player_key text,p jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare current_status text; destination text; seat text; reason text; reason_text text; hero_power double precision; anticipated_seat text;
begin
 current_status:=case when coalesce(p->>'general','false')='true' or coalesce(p->>'prospect','false')='true' or p->>'transferDirection'='outbound' then 'Unconfirmed'
  when p->>'status' in ('Pending','Under Review','Approved','Waitlisted','Declined','Withdrawn','Transferred') then p->>'status' else 'Unconfirmed' end;
 if current_status not in ('Declined','Withdrawn','Unconfirmed') then
  select payload#>>array['data','assignments',player_key] into destination from transfer_private.portal_records where kind='shared' and key='transferOrganization';
  if destination is null or destination not in ('NvSP','NvEM','WaE','DRoN','ECKO') then destination:=null;end if;
  if p->>'confirmedSeat' in ('Gold','Purple','Blue','White') then seat:=p->>'confirmedSeat';end if;
 end if;
 if current_status='Declined' and p->>'rejectionReasonCode' in ('no_seat','low_kills','low_profession','low_hq','low_participation','low_power','group_full','conflict','not_specified','other','requirements','placement','information') then
  reason:=p->>'rejectionReasonCode';reason_text:=left(p->>'rejectionReasonText',1000);
 end if;
 -- Match the Transfer Hub's THP bands (power is stored in millions).
 if jsonb_typeof(p->'power') in ('number','string') and btrim(p->>'power') ~ '^[+-]?[0-9]+([.][0-9]*)?([eE][+-]?[0-9]+)?$|^[+-]?[.][0-9]+([eE][+-]?[0-9]+)?$' then
  begin hero_power:=(p->>'power')::double precision;exception when numeric_value_out_of_range or invalid_text_representation then hero_power:=null;end;
  if hero_power>=0 then anticipated_seat:=case when hero_power>=230 then 'Gold' when hero_power>=180 then 'Purple' when hero_power>=130 then 'Blue' else 'White' end;end if;
 end if;
 return jsonb_build_object('server',p->>'server','currentAlliance',left(btrim(coalesce(p->>'alliance','')),100),'anticipatedSeat',anticipated_seat,'transferGroup',p->>'group','status',current_status,
  'approval',case when current_status in ('Approved','Transferred') then 'approved' when current_status='Declined' then 'declined' when current_status='Withdrawn' then 'withdrawn' else 'pending' end,
  'destinationAlliance',destination,'confirmedSeat',seat,'rejectionReasonCode',reason,'rejectionReasonText',reason_text);
end $$;
revoke all on function transfer_private.applicant_messenger_details(text,jsonb) from public,anon,authenticated;

commit;
