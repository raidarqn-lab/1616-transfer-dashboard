begin;
-- Add only the saved destination alliance to the existing report allowlist.
-- Keep report access checks and the applicant selection unchanged.
do $$
declare definition text;
 marker text := $marker$'transferDirection',payload->>'transferDirection'$marker$;
 addition text := $addition$'destinationAlliance',(select organization.payload#>>array['data','assignments',portal_records.key] from transfer_private.portal_records organization where organization.kind='shared' and organization.key='transferOrganization'),$addition$;
begin
 select pg_get_functiondef('transfer_private.leadership_report_action(text,jsonb)'::regprocedure) into definition;
 if position($field$'destinationAlliance'$field$ in definition)=0 then
  if position(marker in definition)=0 then raise exception 'Unexpected leadership report definition';end if;
  execute replace(definition,marker,addition||marker);
 end if;
end $$;
commit;
