# Seat sandbox

Seat Sandbox reuses the Transfer organization board: alliance rows, split capsules, group focus/glow/blur, group-only view and focused-group filter. Each scenario has independent placements and incoming limits. New scenarios copy the saved live arrangement; old scenarios use it as their starting point until their first plan save. The collapsed Edit scenario roster lists applicants and selected players. Approvals remain included, while trial players can be added or removed. Totals use confirmed colours only. Player details open read-only in the sandbox.

## Persistence and compatibility

Only `shared:seatSandbox` is saved. Player records, live application decisions, group membership, capacities and alliance assignments are never changed. Admin and lead roles may edit; support remains read-only. Edits remain in a local draft until Save sandbox. Discard changes restores the saved scenario. Switching scenarios retains unsaved drafts, and leaving the page warns about unsaved work. Revision conflicts retain the draft and its original revision; discard and refresh before retrying against another lead’s changes.

The new `member` command identifies one player and whether to include them. On the first individual edit to an existing scenario, the server materializes its current forecast into explicit selected player IDs and sets `selectionMode: individual`. Existing trial members and previously approved exclusions are preserved. Subsequent group membership changes do not silently add other people. Formal approvals are still rebuilt from current records and cannot be removed.

Legacy commands and audit records remain for unconverted scenarios and older clients. Exception commands are rejected after a scenario switches to individual selection. No schema or data migration is needed at deployment time.

The `plan` command atomically saves selected IDs, scenario-only alliance assignments and incoming limits. The server validates destinations and player membership, rejects unrelated live fields, and permits hypothetical overflow with visible warnings. Create takes its placement baseline from the server’s current saved organization. Scenario copies never alias live objects. Legacy commands remain compatible.

## Deployment

Deploy `backend/portal-public.ts` to the existing `portal-public` Edge Function in project `dycbjythqwumyzseskfh` before publishing the frontend. Preserve function settings and authentication. Compare the deployed source with the pre-change repository bundle and retain a recovery copy before replacing it.

The bundle embeds `seat-sandbox-core.mjs` between BEGIN/END markers. Regenerate that block after domain edits; a regression test checks an exact match.

## Verification

Run `node --test tests/*.test.mjs`. Tests cover isolated saves, authorization, stale revisions, individual add/remove, deduplication, fixed accepted seats, changes in group membership, legacy-plan preservation and no live mutation.

Browser QA uses fictional records with the real frontend/domain modules. Verify alliance drag/drop and Move to, group focus and filtering, Save/Discard, over-limit warnings, Add/Remove, search, scenario switching, support read-only access and save-conflict recovery. Live verification is read-only; do not change real selections just to test a release.

## Confirmed colours only — October 26, 2026

All sandbox rows, capacity totals and roster exports use `confirmedSeat`, independent of application approval. Hero power and anticipated colours never supply a fallback. Missing or invalid confirmed colours display as Unconfirmed, remain in the selected roster, and appear in an incomplete-totals warning without consuming a colour's capacity. Selection persistence, locked accepted players and live records are unchanged.
