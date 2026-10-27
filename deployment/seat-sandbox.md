# Seat sandbox

The compact sandbox has an Applicants list and a Selected players list. Both are alphabetical within transfer groups. Drag an individual in either direction or use Add / Remove. Totals use the selected players, with formally accepted players always included and locked. Exception requests and reviews are no longer exposed.

## Persistence and compatibility

Only `shared:seatSandbox` is saved. Player records, live application decisions, group membership, capacities and alliance assignments are never changed. Admin and lead roles may edit; support remains read-only. Revision conflicts reject the command without applying an optimistic UI change.

The new `member` command identifies one player and whether to include them. On the first individual edit to an existing scenario, the server materializes its current forecast into explicit selected player IDs and sets `selectionMode: individual`. Existing trial members and previously approved exclusions are preserved. Subsequent group membership changes do not silently add other people. Formal approvals are still rebuilt from current records and cannot be removed.

Legacy commands and audit records remain for unconverted scenarios and older clients. Exception commands are rejected after a scenario switches to individual selection. No schema or data migration is needed at deployment time.

## Deployment

Deploy `backend/portal-public.ts` to the existing `portal-public` Edge Function in project `dycbjythqwumyzseskfh` before publishing the frontend. Preserve function settings and authentication. Compare the deployed source with the pre-change repository bundle and retain a recovery copy before replacing it.

The bundle embeds `seat-sandbox-core.mjs` between BEGIN/END markers. Regenerate that block after domain edits; a regression test checks an exact match.

## Verification

Run `node --test tests/*.test.mjs`. Tests cover isolated saves, authorization, stale revisions, individual add/remove, deduplication, fixed accepted seats, changes in group membership, legacy-plan preservation and no live mutation.

Browser QA uses fictional records with the real frontend/domain modules. Verify dragging in and out, Add/Remove alternatives, search, scenario switching and locked accepted players. Live verification is read-only; do not change real selections just to test a release.

## Confirmed colours only — October 26, 2026

All sandbox rows, capacity totals and roster exports use `confirmedSeat`, independent of application approval. Hero power and anticipated colours never supply a fallback. Missing or invalid confirmed colours display as Unconfirmed, remain in the selected roster, and appear in an incomplete-totals warning without consuming a colour's capacity. Selection persistence, locked accepted players and live records are unchanged.
