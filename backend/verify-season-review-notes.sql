-- Run inside a transaction and always roll back. Uses a saved member without retaining test notes.
do $$
declare owner_ text;leader_ text;key_ text;version_ bigint;args jsonb;r jsonb;before_votes bigint;
begin
 select email into strict owner_ from nova_evidence_private.hub_staff where role='master' and status='active' and accounts_manage;
 select staff_email into leader_ from nova_evidence_private.season_reviewers where season=4 and staff_email<>owner_ limit 1;
 select player_key,owner_note_version into key_,version_ from nova_evidence_private.season_review_members where season=4 limit 1;
 select count(*) into before_votes from nova_evidence_private.season_review_votes where season=4;
 args:=jsonb_build_object('kind','season-review','season',4,'staffEmail',owner_,'operation','owner-note','playerKey',key_,'note','Rollback-only owner note <script>example</script>','version',version_);
 r:=public.nova_hub_store('hub-content-save',args||jsonb_build_object('staffEmail',leader_));
 if r->>'error' is null then raise exception 'Reviewer could write owner note';end if;
 r:=public.nova_hub_store('hub-content-save',args);
 if r->>'ok' is distinct from 'true' or (r->>'version')::bigint<>version_+1 then raise exception 'Owner note save failed';end if;
 r:=public.nova_hub_store('hub-content-save',args);
 if (r->>'version')::bigint<>version_+1 then raise exception 'Retry created a duplicate version';end if;
 r:=public.nova_hub_store('hub-content-save',args||'{"note":"A stale different note"}');
 if r->>'error' is null then raise exception 'Stale note overwrote saved note';end if;
 r:=public.nova_hub_store('hub-content-list',args||jsonb_build_object('staffEmail',leader_));
 if not exists(select 1 from jsonb_array_elements(r->'players') p where p->>'playerKey'=key_ and p->>'ownerNote'='Rollback-only owner note <script>example</script>') then raise exception 'Assigned reviewer cannot read owner note';end if;
 update nova_evidence_private.season_reviews set closed=true where season=4;
 r:=public.nova_hub_store('hub-content-save',args||jsonb_build_object('note','Updated after voting closed','version',version_+1));
 if r->>'ok' is distinct from 'true' then raise exception 'Owner note cannot be edited after closure';end if;
 r:=public.nova_hub_store('hub-content-save',args||jsonb_build_object('note',repeat('a',4001),'version',version_+2));
 if r->>'error' is null then raise exception 'Overlong note accepted';end if;
 r:=public.nova_hub_store('hub-content-save',args||jsonb_build_object('note','','version',version_+2));
 if r->>'note' is distinct from '' then raise exception 'Owner cannot clear note';end if;
 if (select count(*) from nova_evidence_private.season_review_votes where season=4)<>before_votes then raise exception 'Owner note changed votes';end if;
end $$;
