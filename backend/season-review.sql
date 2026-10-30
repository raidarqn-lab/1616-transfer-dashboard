begin;
create table if not exists nova_evidence_private.season_reviews(
 season integer primary key check(season=4),closed boolean not null default false,version bigint not null default 1,
 initialized_by text not null,initialized_at timestamptz not null default now()
);
create table if not exists nova_evidence_private.season_reviewers(
 season integer not null references nova_evidence_private.season_reviews(season),
 reviewer_id uuid not null,staff_email text not null,name text not null,
 primary key(season,reviewer_id),unique(season,staff_email)
);
create table if not exists nova_evidence_private.season_review_members(
 season integer not null references nova_evidence_private.season_reviews(season),player_key text not null,uid text not null,name text not null,
 decision text not null default 'Pending' check(decision in ('Pending','Keep','Cut')),decision_version bigint not null default 0,
 primary key(season,player_key),unique(season,uid)
);
create table if not exists nova_evidence_private.season_review_votes(
 season integer not null,player_key text not null,reviewer_id uuid not null,
 vote text check(vote in ('Keep','Cut')),comment text not null default '' check(length(comment)<=2000),
 version bigint not null default 1,updated_at timestamptz not null default now(),
 primary key(season,player_key,reviewer_id),
 foreign key(season,player_key) references nova_evidence_private.season_review_members(season,player_key),
 foreign key(season,reviewer_id) references nova_evidence_private.season_reviewers(season,reviewer_id)
);
alter table nova_evidence_private.season_reviews enable row level security;
alter table nova_evidence_private.season_reviewers enable row level security;
alter table nova_evidence_private.season_review_members enable row level security;
alter table nova_evidence_private.season_review_votes enable row level security;
revoke all on nova_evidence_private.season_reviews,nova_evidence_private.season_reviewers,nova_evidence_private.season_review_members,nova_evidence_private.season_review_votes from public,anon,authenticated;

create or replace function nova_evidence_private.season_vote_json(v nova_evidence_private.season_review_votes) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('playerKey',v.player_key,'reviewerId',v.reviewer_id,'vote',v.vote,'comment',v.comment,'version',v.version,'updatedAt',v.updated_at)
$$;
revoke all on function nova_evidence_private.season_vote_json(nova_evidence_private.season_review_votes) from public,anon,authenticated;

create or replace function nova_evidence_private.season_review_store(action text,args jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor text:=lower(args->>'staffEmail');me nova_evidence_private.hub_staff;
 cfg nova_evidence_private.season_reviews;my_id uuid;can_manage boolean;op text:=args->>'operation';
 reviewers jsonb;players jsonb;votes jsonb;candidates jsonb;ids jsonb:=args->'reviewerIds';
 prior nova_evidence_private.season_review_votes;saved nova_evidence_private.season_review_votes;
 member_ nova_evidence_private.season_review_members;new_vote text;new_comment text;expected bigint;
begin
 select * into me from nova_evidence_private.hub_staff where email=actor and status='active' for share;
 if me.email is null or not(me.role='master' or me.alliances ? 'NvSP') then return jsonb_build_object('error','NvSP leadership access is required.');end if;
 can_manage:=me.role='master' and coalesce(me.accounts_manage,false);
 if args->>'season' is distinct from '4' then return jsonb_build_object('error','Choose Season 4.');end if;
 if action not in ('hub-content-list','hub-content-save') then return jsonb_build_object('error','Unknown review action.');end if;
 -- The same lock serializes initialization, close/reopen and votes, including first votes.
 perform pg_advisory_xact_lock(hashtextextended('nvsp-season-review-4',0));
 select * into cfg from nova_evidence_private.season_reviews where season=4;
 select reviewer_id into my_id from nova_evidence_private.season_reviewers where season=4 and staff_email=actor;
 if not can_manage and my_id is null then return jsonb_build_object('error','You are not assigned to the Season 4 review. Ask the owner.');end if;
 if action='hub-content-list' then
  select coalesce(jsonb_agg(jsonb_build_object('id',r.reviewer_id,'name',r.name,'active',coalesce(h.status='active' and (h.role='master' or h.alliances ? 'NvSP'),false)) order by lower(r.name)),'[]') into reviewers
  from nova_evidence_private.season_reviewers r left join nova_evidence_private.hub_staff h on h.email=r.staff_email where r.season=4;
  select coalesce(jsonb_agg(jsonb_build_object('playerKey',m.player_key,'uid',m.uid,'name',m.name,'decision',m.decision,'decisionVersion',m.decision_version) order by lower(m.name)),'[]') into players from nova_evidence_private.season_review_members m where m.season=4;
  select coalesce(jsonb_agg(nova_evidence_private.season_vote_json(v)),'[]') into votes from nova_evidence_private.season_review_votes v where v.season=4;
  if can_manage then
   select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'name',i.display_name) order by lower(i.display_name)),'[]') into candidates
   from nova_evidence_private.hub_staff h join nova_evidence_private.admin_identities i on i.email=h.email
   where h.status='active' and (h.role='master' or h.alliances ? 'NvSP') and i.display_name is not null;
  end if;
  return jsonb_build_object('initialized',cfg.season is not null,'closed',coalesce(cfg.closed,false),'version',coalesce(cfg.version,0),'actorId',my_id,'actorName',nova_evidence_private.admin_name(actor),'canManage',can_manage,'canVote',my_id is not null,'reviewers',reviewers,'players',players,'votes',votes,'candidates',coalesce(candidates,'[]'));
 end if;
 if op='initialize' then
  if not can_manage then return jsonb_build_object('error','Only the owner can set up a season review.');end if;
  if cfg.season is not null then return jsonb_build_object('error','Season 4 is already initialized. Refresh the review.');end if;
  if jsonb_typeof(ids) is distinct from 'array' then return jsonb_build_object('error','Select exactly 12 leaders.');end if;
  if jsonb_array_length(ids)<>12 or (select count(distinct x) from jsonb_array_elements_text(ids) x)<>12 then return jsonb_build_object('error','Select exactly 12 different leaders.');end if;
  if (select count(*) from nova_evidence_private.hub_staff h join nova_evidence_private.admin_identities i on i.email=h.email where h.status='active' and (h.role='master' or h.alliances ? 'NvSP') and i.display_name is not null and ids ? i.id::text)<>12 then return jsonb_build_object('error','All 12 reviewers must have active NvSP leadership accounts and entry names.');end if;
  if not exists(select 1 from nova_evidence_private.season_contributions where season=4 and alliance='NvSP') then return jsonb_build_object('error','Import the Season 4 roster under Season contributions first.');end if;
  insert into nova_evidence_private.season_reviews(season,initialized_by) values(4,actor);
  insert into nova_evidence_private.season_reviewers(season,reviewer_id,staff_email,name)
   select 4,i.id,h.email,i.display_name from nova_evidence_private.hub_staff h join nova_evidence_private.admin_identities i on i.email=h.email where ids ? i.id::text;
  insert into nova_evidence_private.season_review_members(season,player_key,uid,name)
   select 4,s.player_key,s.uid,s.name from nova_evidence_private.season_contributions s where s.alliance='NvSP' and s.season=4;
  insert into nova_evidence_private.hub_audit(actor_email,action,subject,detail) values(actor,'season-review-initialize','4',jsonb_build_object('reviewerIds',ids));
  return jsonb_build_object('ok',true);
 end if;
 if cfg.season is null then return jsonb_build_object('error','The owner must initialize Season 4 first.');end if;
 if op='close' then
  if not can_manage then return jsonb_build_object('error','Only the owner can close or reopen voting.');end if;
  if jsonb_typeof(args->'closed') is distinct from 'boolean' or (args->>'version')::bigint is distinct from cfg.version then return jsonb_build_object('error','Review settings changed. Refresh first.');end if;
  update nova_evidence_private.season_reviews set closed=(args->>'closed')::boolean,version=version+1 where season=4;
  insert into nova_evidence_private.hub_audit(actor_email,action,subject,detail) values(actor,'season-review-close','4',jsonb_build_object('closed',args->'closed'));
  return jsonb_build_object('ok',true);
 end if;
 select * into member_ from nova_evidence_private.season_review_members where season=4 and player_key=args->>'playerKey';
 if member_.player_key is null then return jsonb_build_object('error','This member is not in the Season 4 roster.');end if;
 expected:=(args->>'version')::bigint;
 if op='decision' then
  if not can_manage then return jsonb_build_object('error','Only the owner can record a final decision.');end if;
  if coalesce(args->>'decision','') not in ('Pending','Keep','Cut') then return jsonb_build_object('error','Choose Pending, Keep or Cut.');end if;
  if expected is distinct from member_.decision_version then return jsonb_build_object('error','Final decision changed. Refresh first.');end if;
  update nova_evidence_private.season_review_members set decision=args->>'decision',decision_version=decision_version+1 where season=4 and player_key=member_.player_key;
  insert into nova_evidence_private.hub_audit(actor_email,action,subject,detail) values(actor,'season-review-decision',member_.player_key,jsonb_build_object('season',4,'before',member_.decision,'after',args->>'decision'));
  return jsonb_build_object('ok',true,'decision',args->>'decision','version',member_.decision_version+1);
 end if;
 if op is distinct from 'vote' then return jsonb_build_object('error','Unknown review operation.');end if;
 if cfg.closed then return jsonb_build_object('error','Season 4 voting is closed.');end if;
 if my_id is null then return jsonb_build_object('error','Only assigned reviewers can vote.');end if;
 if jsonb_typeof(args->'vote') is distinct from 'string' or coalesce(args->>'vote','') not in ('','Keep','Cut') or jsonb_typeof(args->'comment') is distinct from 'string' or length(args->>'comment')>2000 then return jsonb_build_object('error','Choose Keep, Cut or Not voted, with a comment of at most 2000 characters.');end if;
 new_vote:=nullif(args->>'vote','');new_comment:=args->>'comment';
 select * into prior from nova_evidence_private.season_review_votes where season=4 and player_key=member_.player_key and reviewer_id=my_id;
 if expected is distinct from coalesce(prior.version,0) then
  if prior.version is not null and prior.vote is not distinct from new_vote and prior.comment=new_comment then return jsonb_build_object('ok',true,'vote',nova_evidence_private.season_vote_json(prior));end if;
  return jsonb_build_object('error','Your saved review changed. Copy your draft, refresh and try again.');
 end if;
 insert into nova_evidence_private.season_review_votes(season,player_key,reviewer_id,vote,comment) values(4,member_.player_key,my_id,new_vote,new_comment)
 on conflict(season,player_key,reviewer_id) do update set vote=excluded.vote,comment=excluded.comment,version=nova_evidence_private.season_review_votes.version+1,updated_at=clock_timestamp() returning * into saved;
 insert into nova_evidence_private.hub_audit(actor_email,action,subject,detail) values(actor,'season-review-vote',member_.player_key,jsonb_build_object('season',4,'reviewerId',my_id,'before',case when prior.version is not null then nova_evidence_private.season_vote_json(prior) end,'after',nova_evidence_private.season_vote_json(saved)));
 return jsonb_build_object('ok',true,'vote',nova_evidence_private.season_vote_json(saved));
end;
$$;
revoke all on function nova_evidence_private.season_review_store(text,jsonb) from public,anon,authenticated;
do $$ declare definition text;begin
 definition:=pg_get_functiondef('public.nova_hub_store(text,jsonb)'::regprocedure);
 if position('season_review_store' in definition)=0 then
  definition:=regexp_replace(definition,'\mbegin\M',E'begin\nif action in (''hub-content-list'',''hub-content-save'') and args->>''kind''=''season-review'' then return nova_evidence_private.season_review_store(action,args);end if;','i');execute definition;
 end if;
end $$;
commit;
