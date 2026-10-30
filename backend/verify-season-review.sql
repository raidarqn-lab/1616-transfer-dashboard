-- Execute after season-review.sql in a transaction; always roll back the verification.
do $$
declare owner_ text:='season-review-owner@test.invalid';ids jsonb:='[]';id_ uuid;actor_ text;
 args jsonb;r jsonb;v jsonb;key_ text;n integer;count_ integer;
begin
 select email into owner_ from nova_evidence_private.hub_staff where role='master' and status='active' and accounts_manage;
 for n in 1..12 loop
  actor_:='season-review-'||n||'@test.invalid';
  insert into nova_evidence_private.hub_staff(email,role,alliances,bounties,events,announcements,accounts_manage,status,updated_by)
  values(actor_,'r4','["NvSP"]',false,false,false,false,'active','verification');
  insert into nova_evidence_private.admin_identities(email,display_name,updated_by) values(actor_,'Test reviewer '||n,'verification') returning id into id_;
  ids:=ids||jsonb_build_array(id_::text);
 end loop;
 args:=jsonb_build_object('staffEmail',owner_,'season',4,'kind','season-review','operation','initialize','reviewerIds',ids);
 r:=public.nova_hub_store('hub-content-save',args||jsonb_build_object('reviewerIds',ids-0));
 if r->>'error' is null then raise exception 'Accepted wrong reviewer count';end if;
 r:=public.nova_hub_store('hub-content-save',args);
 if r->>'ok' is distinct from 'true' then raise exception 'Initialization failed: %',r;end if;
 r:=public.nova_hub_store('hub-content-save',args);
 if r->>'error' is null then raise exception 'Accepted repeat initialization';end if;
 r:=public.nova_hub_store('hub-content-list',args);
 if jsonb_array_length(r->'reviewers')<>12 or jsonb_array_length(r->'players')=0 then raise exception 'Wrong review dimensions';end if;
 key_:=r->'players'->0->>'playerKey';
 r:=public.nova_hub_store('hub-content-list',args||'{"staffEmail":"nobody@test.invalid"}');
 if r->>'error' is null then raise exception 'Unassigned user could read';end if;
 args:=jsonb_build_object('staffEmail','season-review-1@test.invalid','kind','season-review','season',4,'operation','vote','playerKey',key_,'vote','Keep','comment','Test comment','version',0,'reviewerId',ids->>1);
 r:=public.nova_hub_store('hub-content-save',args);v:=r->'vote';
 if v->>'reviewerId' is distinct from ids->>0 or v->>'version' is distinct from '1' then raise exception 'Actor isolation or initial vote failed: %',r;end if;
 r:=public.nova_hub_store('hub-content-save',args);
 if r->'vote'->>'version' is distinct from '1' then raise exception 'Retry was not idempotent';end if;
 r:=public.nova_hub_store('hub-content-save',args||'{"vote":"Cut"}');
 if r->>'error' is null then raise exception 'Stale vote replaced saved vote';end if;
 r:=public.nova_hub_store('hub-content-save',args||'{"vote":"Cut","version":1}');
 if r->'vote'->>'version' is distinct from '2' then raise exception 'Vote update failed';end if;
 select count(*) into count_ from nova_evidence_private.season_review_votes where season=4 and player_key=key_;
 if count_<>1 then raise exception 'Duplicate votes counted';end if;
 r:=public.nova_hub_store('hub-content-save',args||'{"vote":"","comment":"Note only","version":2}');
 if r->'vote'->>'vote' is not null then raise exception 'Blank vote not preserved';end if;
 r:=public.nova_hub_store('hub-content-save',args||'{"playerKey":"not-a-member","version":3}');
 if r->>'error' is null then raise exception 'Allowed outside roster';end if;
 r:=public.nova_hub_store('hub-content-list',args);
 if r::text like '%@test.invalid%' or r::text like '%password%' or r::text like '%staff_email%' then raise exception 'Private account data exposed';end if;
 r:=public.nova_hub_store('hub-content-save',args||'{"operation":"decision","decision":"Cut","version":0}');
 if r->>'error' is null then raise exception 'Nonowner set final decision';end if;
 r:=public.nova_hub_store('hub-content-save',args||jsonb_build_object('staffEmail',owner_,'operation','decision','decision','Cut','version',0));
 if r->>'decision' is distinct from 'Cut' then raise exception 'Owner decision failed';end if;
 r:=public.nova_hub_store('hub-content-save',args||jsonb_build_object('staffEmail',owner_,'operation','close','closed',true,'version',1));
 if r->>'ok' is distinct from 'true' then raise exception 'Close failed';end if;
 r:=public.nova_hub_store('hub-content-save',args||'{"version":3}');
 if r->>'error' is distinct from 'Season 4 voting is closed.' then raise exception 'Closed season accepted vote';end if;
 r:=public.nova_hub_store('hub-content-save',args||jsonb_build_object('staffEmail',owner_,'operation','close','closed',false,'version',2));
 update nova_evidence_private.hub_staff set status='revoked' where email='season-review-1@test.invalid';
 r:=public.nova_hub_store('hub-content-list',args);
 if r->>'error' is null then raise exception 'Revoked leader could read';end if;
 r:=public.nova_hub_store('hub-content-save',args||'{"version":3}');
 if r->>'error' is null then raise exception 'Revoked leader could write';end if;
 if has_table_privilege('anon','nova_evidence_private.season_review_votes','SELECT') or has_table_privilege('authenticated','nova_evidence_private.season_review_votes','SELECT') or has_function_privilege('authenticated','nova_evidence_private.season_review_store(text,jsonb)','EXECUTE') then raise exception 'Direct client access exposed';end if;
end $$;
