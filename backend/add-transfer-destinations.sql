begin;
-- Extend the live function in place to preserve later status and translation fixes.
do $$
declare definition text; updated text;
begin
 definition:=pg_get_functiondef('transfer_private.applicant_messenger_details(text,jsonb)'::regprocedure);
 updated:=replace(definition,'''NvSP'',''NvEM'',''WaE'',''DRoN'',''ECKO''','''NvSP'',''NvEM'',''WaE'',''WaE2'',''B14K'',''DRoN'',''ECKO''');
 if updated=definition and (strpos(updated,'''WaE2''')=0 or strpos(updated,'''B14K''')=0) then raise exception 'Unrecognized destination contract';end if;
 if updated<>definition then execute updated;end if;
end $$;
commit;
