begin;
-- One private, bounded screenshot per applicant. Never included in the portal snapshot.
create table if not exists transfer_private.seat_images (
 player_key text primary key, version uuid not null, image text not null check (length(image)<=1200000),
 uploaded_by text not null, uploaded_name text not null, uploaded_at timestamptz not null default now()
);
alter table transfer_private.seat_images enable row level security;
revoke all on transfer_private.seat_images from public,anon,authenticated;

create or replace function transfer_private.seat_image_action(action text,args jsonb,actor text,actor_name text) returns jsonb
language plpgsql set search_path='' as $$
declare p jsonb; existing transfer_private.seat_images%rowtype; image_text text:=args->>'image';
 image_player_key text:=args->>'playerId'; raw bytea; next_version uuid;
begin
 select payload into p from transfer_private.portal_records where kind='players' and key=image_player_key;
 if not coalesce(transfer_private.seat_confirmation_eligible(p),false) then return '{"error":"applicant_unavailable"}';end if;
 select * into existing from transfer_private.seat_images where seat_images.player_key=image_player_key;
 if action='seat-image-get' then
  if existing.player_key is null then return '{"error":"image_missing"}';end if;
  return jsonb_build_object('image',existing.image,'imageVersion',existing.version,'name',p->>'name','uploadedBy',existing.uploaded_name,'uploadedAt',existing.uploaded_at);
 end if;
 if action<>'seat-image-save' then return '{"error":"invalid_action"}';end if;
 -- Raster-only JPEGs, re-encoded in the browser; reject SVG, HTML, and oversized payloads.
 if image_text is null or length(image_text)>1200000 or image_text !~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$'
  or coalesce(args->>'uploadId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then return '{"error":"invalid_image"}';end if;
 begin raw:=decode(substr(image_text,24),'base64');exception when others then return '{"error":"invalid_image"}';end;
 if octet_length(raw)<4 or substr(raw,1,3)<>decode('ffd8ff','hex') or right(encode(raw,'hex'),4)<>'ffd9' then return '{"error":"invalid_image"}';end if;
 next_version:=(args->>'uploadId')::uuid;
 if existing.version=next_version and existing.uploaded_by=actor and existing.image=image_text then
  return jsonb_build_object('ok',true,'playerId',image_player_key,'imageVersion',existing.version);
 end if;
 if coalesce(existing.version::text,'') is distinct from coalesce(args->>'imageVersion','') then return '{"error":"image_changed"}';end if;
 insert into transfer_private.seat_images as target(player_key,version,image,uploaded_by,uploaded_name,uploaded_at)
 values(image_player_key,next_version,image_text,actor,coalesce(actor_name,'Transfer team'),now())
 on conflict on constraint seat_images_pkey do update set version=excluded.version,image=excluded.image,uploaded_by=excluded.uploaded_by,uploaded_name=excluded.uploaded_name,uploaded_at=excluded.uploaded_at;
 insert into nova_evidence_private.hub_audit(actor_email,action,subject,detail) values(actor,action,image_player_key,jsonb_build_object('version',next_version,'replaced',existing.version is not null));
 return jsonb_build_object('ok',true,'playerId',image_player_key,'imageVersion',next_version);
end $$;
revoke all on function transfer_private.seat_image_action(text,jsonb,text,text) from public,anon,authenticated;

-- Preserve all existing auth/seat logic; image writes use the same commit and account locks.
do $$declare definition text; marker text; replacement text;
begin
 select pg_get_functiondef('transfer_private.seat_confirmation_action(text,jsonb)'::regprocedure) into definition;
 if position('transfer_private.seat_image_action' in definition)=0 then
  marker:='if action not in (''seat-confirmations-list'',''seat-confirmations-save'',''hub-login-rename'')';
  if position(marker in definition)=0 or position(' team:=transfer_private.seat_confirmation_team();' in definition)=0 then raise exception 'Unexpected seat handler';end if;
  definition:=replace(definition,marker,'if action not in (''seat-confirmations-list'',''seat-confirmations-save'',''hub-login-rename'',''seat-image-get'',''seat-image-save'')');
  definition:=replace(definition,'if action=''seat-confirmations-save'' then','if action in (''seat-confirmations-save'',''seat-image-save'') then');
  definition:=replace(definition,' team:=transfer_private.seat_confirmation_team();',' if action in (''seat-image-get'',''seat-image-save'') then return transfer_private.seat_image_action(action,args,actor,actor_name);end if;'||E'\n'||' team:=transfer_private.seat_confirmation_team();');
  execute definition;
 end if;
 select pg_get_functiondef('transfer_private.seat_confirmation_row(text,jsonb,bigint)'::regprocedure) into definition;
 if position('imageVersion' in definition)=0 then
  marker:='''revision'',rev)';
  if position(marker in definition)=0 then raise exception 'Unexpected seat projection';end if;
  execute replace(definition,marker,'''revision'',rev,''imageVersion'',(select version::text from transfer_private.seat_images where player_key=k))');
 end if;
 select pg_get_functiondef('public.nova_manual_accounts(text,jsonb)'::regprocedure) into definition;
 marker:='if action in (''seat-confirmations-list'',''seat-confirmations-save'',''hub-login-rename'')';
 replacement:='if action in (''seat-confirmations-list'',''seat-confirmations-save'',''hub-login-rename'',''seat-image-get'',''seat-image-save'')';
 if position(replacement in definition)=0 then
  if position(marker in definition)=0 then raise exception 'Unexpected account dispatcher';end if;
  execute replace(definition,marker,replacement);
 end if;
end $$;
commit;
