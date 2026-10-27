begin;
set local lock_timeout = '2s';
set local statement_timeout = '20s';

-- latest_seat_image checks that applicant evidence belongs to exactly one active
-- player. Index both sides of that OR lookup to avoid scanning every player for
-- each applicant in the seat-confirmations directory. Keep the predicate and
-- expressions identical to the lookup, including legacy applicationIds arrays.
create index if not exists portal_player_application_id_active
 on transfer_private.portal_records ((payload->>'applicationId'))
 where kind='players' and coalesce(payload->>'deleted','false')<>'true';

create index if not exists portal_player_application_ids_active
 on transfer_private.portal_records using gin ((coalesce(payload->'applicationIds','[]'::jsonb)))
 where kind='players' and coalesce(payload->>'deleted','false')<>'true';

commit;
