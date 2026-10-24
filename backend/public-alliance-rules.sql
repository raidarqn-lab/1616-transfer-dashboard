begin;
-- Public, deliberately shareable documents only. No application data, drafts or author metadata.
create or replace function public.published_alliance_rules(alliance_tag text) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('alliance',g.alliance,'published',jsonb_build_object('translations',g.published->'translations','publishedAt',g.published->'publishedAt'))
 from nova_evidence_private.alliance_guidelines g
 where g.alliance=alliance_tag and alliance_tag in ('NvSP','NvEM','WaE','DRoN','ECKO') and g.published is not null;
$$;
revoke all on function public.published_alliance_rules(text) from public;
grant execute on function public.published_alliance_rules(text) to anon,authenticated,service_role;
commit;
