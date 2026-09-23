# Supabase portal cutover candidate

This branch switches portal requests from Apps Script to the disabled `portal-public` Edge Function. Do not merge/deploy until the coordinated cutover is approved and the final source check is complete.

The public project key is the only gateway key in the browser. Every request gets a current Firebase ID token; the server verifies it and checks current database team access. The private staging token is not used by this frontend.

## Release sequence

1. Record the current deployed Pages revision and keep its complete assets as rollback evidence. The reviewed pre-switch portal revision is `8adbe19`; verify it remains current.
2. Approve a brief write freeze covering both the application and portal. Recheck current source data and reconcile any changes into Supabase before routing traffic.
3. Enable the separately deployed portal-public endpoint only when authorized. Test Google-authenticated access on portal.join1616.com; keep production intake disabled until its own configuration checks pass.
4. Deploy this branch together with the approved application endpoint switch. A portal-only launch requires the separately tested Sheets bridge; do not assume the inactive bridge is replicating new submissions.
5. Verify create, recall, update, team saves, preferences and expected permission denials. Historical questions must not generate new Discord notifications.

## Rollback

Before new Supabase writes, restore the recorded portal/application revision and endpoints. After accepting Supabase writes, freeze and reconcile them back before reverting. Do not overwrite either data store or discard new writes.

Staging-only fictional QA applications remain retained for audit, and their player records are in recoverable Trash. They are not real applicants. Decide their treatment before activation; no permanent deletion is included here.

## Evidence

Hosted staging workflow checks passed: create 578ms, recall 253ms, update 288ms, concurrent saves 381/536ms (one winner), duplicate retries and stale revisions handled correctly. These observations do not guarantee production latency. Dolphy's active Lead access is preserved. All 18 source tabs matched the imported source snapshot at the latest check.
