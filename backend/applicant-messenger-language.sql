begin;
-- Add only the applicant's stated language to the existing restricted projection.
do $patch$
declare definition text; old_fragment text := $old$'server',p->>'server'$old$;
 new_fragment text := $new$'applicationLanguage',left(btrim(coalesce(case when (p->'rawApplication') ? 'language' then p#>>'{rawApplication,language}' else p->>'language' end,'')),100),'server',p->>'server'$new$;
begin
 definition:=pg_get_functiondef('transfer_private.applicant_messenger_details(text,jsonb)'::regprocedure);
 if position(new_fragment in definition)>0 then return;end if;
 if position(old_fragment in definition)=0 then raise exception 'Unexpected messenger details definition; migration stopped';end if;
 execute replace(definition,old_fragment,new_fragment);
end $patch$;
do $verify$
begin
 if transfer_private.applicant_messenger_details('language-test','{"status":"Pending","language":"de","rawApplication":{"language":"ko"}}'::jsonb)->>'applicationLanguage' <> 'ko' then raise exception 'Application language precedence failed';end if;
 if transfer_private.applicant_messenger_details('language-test','{"status":"Pending","language":"de","rawApplication":{"language":""}}'::jsonb)->>'applicationLanguage' <> '' then raise exception 'Empty application language failed';end if;
 if transfer_private.applicant_messenger_details('language-test','{"status":"Pending"}'::jsonb)->>'applicationLanguage' <> '' then raise exception 'Missing language failed';end if;
end $verify$;
commit;
