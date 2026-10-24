begin;
create table if not exists nova_evidence_private.alliance_guidelines (
 alliance text primary key check (alliance in ('NvSP','NvEM','WaE','DRoN','ECKO')),
 introduction text not null default '' check (length(introduction)<=2000),
 guidelines text not null default '' check (length(guidelines)<=12000),
 published jsonb,
 revision bigint not null default 0,
 updated_at timestamptz not null default clock_timestamp(),
 updated_by text not null
);
create table if not exists nova_evidence_private.alliance_guidelines_audit (
 id bigint generated always as identity primary key,
 alliance text not null,
 actor text not null,
 operation text not null,
 revision bigint not null,
 saved_at timestamptz not null default clock_timestamp(),
 previous jsonb,
 next jsonb not null
);
alter table nova_evidence_private.alliance_guidelines add column if not exists translations jsonb not null default '{}'::jsonb;
alter table nova_evidence_private.alliance_guidelines enable row level security;
alter table nova_evidence_private.alliance_guidelines_audit enable row level security;
revoke all on nova_evidence_private.alliance_guidelines,nova_evidence_private.alliance_guidelines_audit from public,anon,authenticated;

create or replace function nova_evidence_private.alliance_guidelines_store(action text,args jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 me nova_evidence_private.hub_staff;
 current_row nova_evidence_private.alliance_guidelines;
 old_row jsonb; saved nova_evidence_private.alliance_guidelines;
 home text:=args->>'alliance'; intro text; rules text; expected bigint;
 result jsonb; translations jsonb:=coalesce(args->'translations','{}'::jsonb); lang text; translation jsonb;
 publish boolean:=coalesce((args->>'publish')::boolean,false);
begin
 select * into me from nova_evidence_private.hub_staff where email=lower(args->>'staffEmail') and status='active';
 if me.email is null then raise exception 'Access denied'; end if;
 if action='hub-content-list' then
  select coalesce(jsonb_agg(jsonb_build_object('alliance',h,'introduction',coalesce(g.introduction,''),'guidelines',coalesce(g.guidelines,''),'translations',coalesce(g.translations,'{}'::jsonb),'published',g.published,'revision',coalesce(g.revision,0),'updatedAt',g.updated_at) order by h),'[]'::jsonb)
  into result from unnest(array['NvSP','NvEM','WaE','DRoN','ECKO']) h
  left join nova_evidence_private.alliance_guidelines g on g.alliance=h
  where me.role='master' or me.alliances ? h;
  return result;
 end if;
 if action is distinct from 'hub-content-save' then raise exception 'Unknown guidelines action';end if;
 if home is null or home not in ('NvSP','NvEM','WaE','DRoN','ECKO') or not (me.role='master' or me.alliances ? home) then raise exception 'Access denied';end if;
 if jsonb_typeof(args->'introduction') is distinct from 'string' or jsonb_typeof(args->'guidelines') is distinct from 'string' then raise exception 'Enter an introduction and guidelines';end if;
 intro:=trim(args->>'introduction');rules:=trim(args->>'guidelines');
 if length(intro)>2000 or length(rules)>12000 then raise exception 'Guidelines exceed the character limit';end if;
 if publish and (intro='' or rules='') then raise exception 'Add an introduction and guidelines before publishing';end if;
 if jsonb_typeof(translations)<>'object' or octet_length(translations::text)>500000 then raise exception 'Invalid translations';end if;
 if exists(select 1 from jsonb_object_keys(translations) k where k not in ('en','es','pt','fr','ar','vi','ko','de')) then raise exception 'Unknown translation language';end if;
 translations:=translations||jsonb_build_object('en',jsonb_build_object('introduction',intro,'guidelines',rules));
 foreach lang in array array['en','es','pt','fr','ar','vi','ko','de'] loop
  translation:=translations->lang;
  if translation is not null then
   if jsonb_typeof(translation)<>'object' or jsonb_typeof(translation->'introduction') is distinct from 'string' or jsonb_typeof(translation->'guidelines') is distinct from 'string' or length(translation->>'introduction')>2000 or length(translation->>'guidelines')>12000 then raise exception 'Invalid translation';end if;
   translations:=jsonb_set(translations,array[lang],jsonb_build_object('introduction',trim(translation->>'introduction'),'guidelines',trim(translation->>'guidelines')));
  end if;
  if publish and (coalesce(trim(translation->>'introduction'),'')='' or coalesce(trim(translation->>'guidelines'),'')='') then raise exception 'Complete all eight translations before publishing';end if;
 end loop;
 expected:=(args->>'revision')::bigint;
 if expected is null or expected<0 then raise exception 'Refresh the guidelines before saving';end if;
 perform pg_advisory_xact_lock(hashtextextended('alliance-guidelines:'||home,0));
 select * into current_row from nova_evidence_private.alliance_guidelines where alliance=home for update;
 if coalesce(current_row.revision,0)<>expected then raise exception 'Another leader updated these guidelines. Reload before saving.';end if;
 old_row:=case when current_row.alliance is not null then to_jsonb(current_row) end;
 insert into nova_evidence_private.alliance_guidelines(alliance,introduction,guidelines,translations,published,revision,updated_at,updated_by)
 values(home,intro,rules,translations,case when publish then jsonb_build_object('introduction',intro,'guidelines',rules,'translations',translations,'publishedAt',clock_timestamp()) else current_row.published end,expected+1,clock_timestamp(),me.email)
 on conflict(alliance) do update set introduction=excluded.introduction,guidelines=excluded.guidelines,translations=excluded.translations,published=excluded.published,revision=excluded.revision,updated_at=excluded.updated_at,updated_by=excluded.updated_by
 returning * into saved;
 insert into nova_evidence_private.alliance_guidelines_audit(alliance,actor,operation,revision,previous,next)
 values(home,me.email,case when publish then 'publish' else 'draft' end,saved.revision,old_row,to_jsonb(saved));
 return jsonb_build_object('ok',true,'alliance',home,'revision',saved.revision,'published',saved.published);
end;
$$;
revoke all on function nova_evidence_private.alliance_guidelines_store(text,jsonb) from public,anon,authenticated;

-- Extend the existing authenticated hub content route without replacing its other handlers.
do $$
declare definition text;
begin
 definition:=pg_get_functiondef('public.nova_hub_store(text,jsonb)'::regprocedure);
 if position('alliance_guidelines_store' in definition)=0 then
  definition:=regexp_replace(definition,'\mbegin\M',E'begin\nif action in (''hub-content-list'',''hub-content-save'') and args->>''kind''=''alliance-guidelines'' then return nova_evidence_private.alliance_guidelines_store(action,args);end if;','i');
  execute definition;
 end if;
end;
$$;

-- Add only the published document for the applicant's actual destination.
do $$
declare definition text;
begin
 definition:=pg_get_functiondef('public.transfer_application_status(jsonb)'::regprocedure);
 if position('allianceGuidelines' in definition)=0 then
  if position('''destinationAlliance'',destination,' in definition)=0 then raise exception 'Unexpected application-status definition';end if;
  definition:=replace(definition,'''destinationAlliance'',destination,','''destinationAlliance'',destination,''allianceGuidelines'',(select g.published from nova_evidence_private.alliance_guidelines g where g.alliance=destination),');
  execute definition;
 end if;
end;
$$;
commit;
