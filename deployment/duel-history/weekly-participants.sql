-- Include recorded NvSP participants in Alliance Duel without changing current membership.
begin;
CREATE OR REPLACE FUNCTION nova_evidence_private.nova_matching_store_before_hardsave(action text, args jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;actor text:=lower(args->>'staffEmail');bounty_code text;reward nova_evidence_private.bounty_rewards;q text:=trim(coalesce(args->>'query',''));page_number integer:=greatest(0,least(100000,coalesce((args->>'page')::integer,0)));proposed integer;
begin
if not nova_evidence_private.hub_reviewer(actor) then raise exception 'Access denied';end if;
if action='player-search' then
if length(q)>100 or (not coalesce((args->>'browse')::boolean,false) and length(q)<2) then return '[]'::jsonb;end if;
select coalesce(jsonb_agg(item),'[]'::jsonb) into result from(select jsonb_build_object('totalCount',count(*) over(),'membershipEvents',case when jsonb_typeof(payload->'membershipEvents')='array' then payload->'membershipEvents' else '[]'::jsonb end,'allianceRank',payload->>'allianceRank','kills',payload->>'kills','key',key,'name',payload->>'name','translatedName',payload->>'translatedName','server',payload->>'server','alliance',payload->>'alliance','sourceUid',payload->>'sourceUid','daily',jsonb_build_object('vs',nova_evidence_private.player_week_summary(key,'vs',args->>'week'),'donations',nova_evidence_private.player_week_summary(key,'donations',args->>'week')),'profession',payload->>'profession','power',payload->>'power','aliases',case when jsonb_typeof(payload->'aliases')='array' then payload->'aliases' else '[]'::jsonb end,'previousGameNames',case when jsonb_typeof(payload->'previousGameNames')='array' then jsonb_path_query_array(payload->'previousGameNames','$[*].name') else '[]'::jsonb end) item
from transfer_private.portal_records where kind='players' and coalesce(payload->>'deleted','false')<>'true' and (coalesce(args->>'server','')='' or payload->>'server'=args->>'server') and (coalesce(args->>'alliance','')<>'NvSP' or regexp_replace(lower(coalesce(payload->>'alliance','')),'[^a-z0-9]','','g') in ('nvsp','novasapphire','nvspnovasapphire')
 or (args->>'duelView'='true' and (exists (
   select 1 from nova_evidence_private.published_scores s
   join nova_evidence_private.batches b on b.id=s.batch_id
   where s.player_key=portal_records.key and s.metric='vs' and b.state='approved'
   and regexp_replace(lower(s.alliance),'[^a-z0-9]','','g') in ('nvsp','novasapphire','nvspnovasapphire')
   and s.period_start between date_trunc('week',coalesce(nullif(args->>'week','')::date,current_date))::date
     and date_trunc('week',coalesce(nullif(args->>'week','')::date,current_date))::date+6
 ) or exists (
 select 1 from jsonb_array_elements(case when jsonb_typeof(payload->'membershipEvents')='array' then payload->'membershipEvents' else '[]'::jsonb end) e
 where e->>'alliance'='NvSP' and e->>'type' in ('removed','left','readmitted')
 and e->>'date' between to_char(date_trunc('week',coalesce(nullif(args->>'week','')::date,current_date)),'YYYY-MM-DD')
 and to_char(date_trunc('week',coalesce(nullif(args->>'week','')::date,current_date))+interval '6 days','YYYY-MM-DD')
 )))) and (q='' or strpos(lower(key),lower(q))>0 or strpos(lower(coalesce(payload->>'name','')),lower(q))>0 or strpos(lower(coalesce(payload->>'translatedName','')),lower(q))>0 or strpos(lower(coalesce(payload->>'alliance','')),lower(q))>0 or strpos(lower(coalesce(payload->>'server','')),lower(q))>0 or strpos(lower(coalesce(payload->>'sourceUid','')),lower(q))>0 or strpos(lower(coalesce(payload->'aliases','[]')::text),lower(q))>0 or strpos(lower(coalesce(payload->'previousGameNames','[]')::text),lower(q))>0) order by case when args->>'sort'='server' then payload->>'server' when args->>'sort'='alliance' then payload->>'alliance' end,case when lower(key)=lower(q) or lower(payload->>'name')=lower(q) then 0 else 1 end,payload->>'name',key limit 30 offset page_number*30) p;return result;end if;
select bounty_reference into bounty_code from nova_evidence_private.batches where id=args->>'batchId' for update;if bounty_code is null then raise exception 'Missing batch';end if;perform pg_advisory_xact_lock(hashtextextended(bounty_code,0));select * into reward from nova_evidence_private.bounty_rewards where bounty=bounty_code;
if action='save-review' and args ? 'rewardPoints' then if jsonb_typeof(args->'rewardPoints')<>'number' or args->>'rewardPoints' !~ '^[0-9]{1,5}$' then raise exception 'Invalid bounty points';end if;proposed:=(args->>'rewardPoints')::integer;if proposed not between 0 and 10000 then raise exception 'Invalid bounty points';end if;if coalesce((args->>'rewardRevision')::integer,0)<>coalesce(reward.revision,0) then raise exception 'Bounty reward changed; reload';end if;end if;
result:=nova_evidence_private.nova_matching_store_before_profiles(action,args);
if action='save-review' and args ? 'rewardPoints' and (reward.bounty is null or reward.points<>proposed) then insert into nova_evidence_private.bounty_rewards(bounty,points,updated_by) values(bounty_code,proposed,actor) on conflict(bounty) do update set points=excluded.points,revision=bounty_rewards.revision+1,updated_by=actor,updated_at=now() returning * into reward;insert into nova_evidence_private.hub_audit(actor_email,action,subject,detail) values(actor,'bounty-reward-save',bounty_code,jsonb_build_object('points',proposed,'revision',reward.revision));end if;
return result||jsonb_build_object('rewardPoints',coalesce(reward.points,10),'rewardRevision',coalesce(reward.revision,0));end $function$
;
commit;
