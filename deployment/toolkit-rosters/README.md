# Dated Toolkit roster release

Not activated in production. Keep PR6 draft until backend verification is complete.

1. Apply toolkit-contact-lookup.sql and dated-toolkit-rosters.sql to the existing Supabase project. Both preserve the existing reviewer authorization boundary; only the owner can publish snapshots.
2. Deploy index.bundled.ts to the existing nova-bounty function, preserving its configured secrets and authentication settings.
3. Upload a validated Nova Toolkit roster export through the owner-only publishing control. No Toolkit credentials belong in the export or website.
4. Verify both selected alliances, retrieval dates, row counts, exact UID links, and a failed-read case before merging the frontend.

The source observation date may be unknown. Retrieval date is not a promise of current membership. Never infer departures from a snapshot count. Private roster exports remain outside this repository.

Local verification: 58 deterministic tests, player-picker browser integration, and actual review-layout/Undo mobile regression passed. The SQL has not yet been executed.
