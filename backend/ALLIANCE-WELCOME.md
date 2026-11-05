# Alliance Welcome

`live.html#welcome` is the administrator's Welcome panel. Set an alliance password, copy its page link, or edit its Welcome desk. Pages remain disabled until the administrator sets a password.

Each alliance's R4 team maintains a welcome message, names for the R4 dropdowns, and Available / Claimed / Completed outreach for its assigned Approved/Accepted players. Selecting an R4 claims a player. Copy welcome personalizes the text without marking contact completed. Notes require an R4 name and append to the existing portal team history through `transfer_portal_commit`; no transfer-team account or role is created.

Download page exports the same interface without embedding players, credentials, or tokens. It requires internet and the alliance password. The file saves directly online.

## Deployment

1. Apply `backend/alliance-welcome.sql` in the existing project. It adds private RLS tables and a service-role-only RPC; it does not alter existing portal authentication or function definitions.
2. Run `backend/verify-alliance-welcome.sql`. This exercises the actual portal note/transaction path and rolls back every fixture change.
3. Run `python3 tools/build-welcome.py`. Deploy `backend/alliance-welcome.bundle.ts` as the separate `alliance-welcome` Supabase Edge Function. Use custom authentication (no legacy Supabase JWT gate), as with the existing portal endpoints. The handler verifies portal administrator tokens or an alliance-scoped Welcome session on every action.
4. Publish the frontend files together: `live.html`, `welcome.html`, `alliance-welcome-app.mjs`, `alliance-welcome-admin.mjs`, `alliance-welcome.css`.
5. Open Welcome in the portal. The administrator sets and distributes alliance passwords privately.

The bundle reuses the existing service-key resolver, RPC transport and Firebase/manual-session verifier from `backend/portal-public.ts`, and the existing PBKDF2 password helper. It uses the same project-wide environment variables. Never embed service keys in frontend files.

## Boundaries and recovery

- Alliance sessions expire after eight hours. Password reset or Disable access immediately revokes them. Passwords use PBKDF2 SHA-256 with 600,000 iterations and random salts; stored sessions are hashed.
- Read projection includes only approved/accepted players currently assigned to the authenticated alliance, basic player stats, contact state, and that alliance's Welcome notes. Other portal team notes and private applicant data are excluded.
- Settings and contact state use optimistic revisions. Note retries use an alliance/player/note identifier to prevent duplicates. Team notes preserve existing player fields/history and flow through normal portal revisions/events.
- `welcome_audit` retains prior settings/contact values. It does not store passwords or tokens.
- If withdrawing the frontend release, disable the Welcome pages and retain the private tables and notes for recovery. Do not drop the data to roll back a UI change.

## Validation

Run `node --test tests/alliance-welcome.test.mjs` and the normal repository Node test suite. Run `PGLITE_MODULE=/path/to/pglite/dist/index.js node tests/alliance-welcome-postgres.mjs` for the PostgreSQL fixtures. Database coverage includes scope isolation, projection privacy, stale saves/claims, R4 attribution, preservation of history, note deduplication, password rotation, session revocation, rate limits and SQL grants.
