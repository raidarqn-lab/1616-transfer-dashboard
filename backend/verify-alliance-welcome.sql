begin;
do $$
declare admin text; home text:='WaE'; selected_player text; before_payload jsonb; after_payload jsonb; revision_before bigint; note_id text:=gen_random_uuid()::text; leader_id text:=gen_random_uuid()::text; result jsonb; page jsonb;
begin
 select admin_email,revision into admin,revision_before from transfer_private.portal_control where singleton for update;
 page:=public.transfer_welcome('admin.read',jsonb_build_object('actor',admin,'alliance',home));
 selected_player:=page#>>'{players,0,id}';
 if selected_player is null then raise exception 'Fixture needs an assigned eligible WaE player';end if;
 select payload into before_payload from transfer_private.portal_records where kind='players' and key=selected_player;
 result:=public.transfer_welcome('admin.save',jsonb_build_object('actor',admin,'alliance',home,'revision',page->'revision','message',page->'message','leaders',jsonb_build_array(jsonb_build_object('id',leader_id,'name','Welcome rollback verification'))));
 if result ? 'error' then raise exception 'Settings failed: %',result;end if;
 result:=public.transfer_welcome('admin.note',jsonb_build_object('actor',admin,'alliance',home,'playerId',selected_player,'leaderId',leader_id,'noteId',note_id,'note','Rollback-only verification; never retained.'));
 if result ? 'error' then raise exception 'Note failed: %',result;end if;
 select payload into after_payload from transfer_private.portal_records where kind='players' and key=selected_player;
 if after_payload#>>'{history,0,welcomeNoteId}' is distinct from note_id then raise exception 'Team note missing';end if;
 if after_payload#>>'{history,0,by}' is distinct from 'Welcome rollback verification · WaE R4' then raise exception 'Author missing';end if;
 if (before_payload-'history'-'updatedAt') is distinct from (after_payload-'history'-'updatedAt') then raise exception 'Unrelated player fields changed';end if;
 if (after_payload->'history')-0 is distinct from coalesce(before_payload->'history','[]'::jsonb) then raise exception 'Existing history changed';end if;
 if (select revision from transfer_private.portal_control where singleton)<=revision_before then raise exception 'Portal event revision did not advance';end if;
 result:=public.transfer_welcome('admin.note',jsonb_build_object('actor',admin,'alliance',home,'playerId',selected_player,'leaderId',leader_id,'noteId',note_id,'note','Rollback-only verification; never retained.'));
 if (select payload from transfer_private.portal_records where kind='players' and key=selected_player) is distinct from after_payload then raise exception 'Duplicate note changed record';end if;
 if has_function_privilege('anon','public.transfer_welcome(text,jsonb)','EXECUTE') or has_function_privilege('authenticated','public.transfer_welcome(text,jsonb)','EXECUTE') then raise exception 'Unexpected RPC permissions';end if;
end $$;
rollback;
select 'PASS: R4 note credit, portal commit/event, field/history preservation, retry deduplication, permissions; all fixture changes rolled back' result;
