begin;
do $$
declare before_document jsonb; after_document jsonb;
begin
 before_document:=public.published_alliance_rules('NvSP');
 if before_document is null then raise exception 'NvSP publication missing';end if;
 update nova_evidence_private.alliance_guidelines set introduction='PRIVATE_DRAFT_MARKER',guidelines='PRIVATE_DRAFT_MARKER',translations='{"en":{"introduction":"PRIVATE_DRAFT_MARKER","guidelines":"PRIVATE_DRAFT_MARKER"}}'::jsonb where alliance='NvSP';
 after_document:=public.published_alliance_rules('NvSP');
 if after_document is distinct from before_document then raise exception 'Private draft changed public output';end if;
 if has_table_privilege('anon','nova_evidence_private.alliance_guidelines','select') or has_table_privilege('anon','nova_evidence_private.alliance_guidelines_audit','select') then raise exception 'Public table access';end if;
 if not has_function_privilege('anon','public.published_alliance_rules(text)','execute') then raise exception 'Public reader cannot execute';end if;
 if public.published_alliance_rules('unknown') is not null then raise exception 'Unknown alliance exposed';end if;
 if exists(select 1 from jsonb_object_keys(after_document) k where k not in ('alliance','published')) or exists(select 1 from jsonb_object_keys(after_document->'published') k where k not in ('translations','publishedAt')) then raise exception 'Unexpected public metadata';end if;
end;
$$;
set local role anon;
select case when published_alliance_rules('NvSP')#>>'{published,translations,en,guidelines}' like '%7.2 million%' then 'PASS: anonymous published-only read; private drafts unchanged; no private table access or metadata' else 'FAIL' end as verification;
rollback;
