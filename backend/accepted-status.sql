-- Extend existing status rules without replacing newer unrelated function bodies.
-- No applicant records or statuses are changed by this migration.
begin;
do $migration$
declare spec record; fn record; definition text; updated text; touched integer:=0;
begin
 for spec in select * from (values
 ('public','transfer_portal_player_save_state'),
 ('public','transfer_application_status'),
 ('transfer_private','seat_confirmation_eligible'),
 ('transfer_private','seat_confirmation_action'),
 ('transfer_private','applicant_messenger_details'),
 ('transfer_private','confirm_application_evidence_seat')
 ) t(schema_name,function_name) loop
  select p.oid,pg_get_functiondef(p.oid) as source into strict fn from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=spec.schema_name and p.proname=spec.function_name and p.prokind='f';
  definition:=fn.source;
  updated:=replace(definition,'''Approved'',''Transferred''','''Approved'',''Accepted'',''Transferred''');
  updated:=replace(updated,'''Approved'',''Waitlisted''','''Approved'',''Accepted'',''Waitlisted''');
  updated:=replace(updated,'p->>''status''=''Approved''','p->>''status'' in (''Approved'',''Accepted'')');
  if updated=definition and strpos(updated,'''Accepted''')=0 then raise exception 'Unrecognized status contract: %.%',spec.schema_name,spec.function_name;end if;
  if updated<>definition then execute updated;touched:=touched+1;end if;
 end loop;
 raise notice 'Accepted status rules updated in % functions',touched;
end $migration$;
commit;
