# Alternate account identification

Player records support `isAlt` (boolean), `altOwnerName`, and `altOwnerAlliance` (up to 100 characters each). Main/alt links take precedence: their main account is never labelled ALT, and each alternate displays the linked main player's current name and current alliance. Manual details cover main players who are not in the directory. Ownership-history links and similar names do not imply ALT status.

Before publishing the frontend, deploy the rebuilt private portal-public bundle using deployment/applicant-toolkit/build-edge.mjs and apply backend/player-alt-flags.sql. Apply the ALT migration after any complete replacement of the Welcome, seat, messenger or leadership projection functions. It is repeatable and aborts atomically if expected projection definitions are absent. Existing authentication and SQL access controls stay in place. No player records are bulk-modified by deployment.

The small ALT badge is included in player lists, CRM profiles, transfer organization, Sandbox, Welcome desks/master list, seat confirmations, applicant messenger, and downloadable leadership/alliance forms. Restricted projections and exported forms receive only the boolean flag, not the private main-account graph or owner details. Existing linked accounts gain their badge without a backfill.

Validation: node --test tests/player-alt.test.mjs and PGLITE_MODULE=<PGlite module> node tests/player-alt-postgres.mjs. The database test covers manual and linked flags, main exclusion, four real projections, private-field exclusion, repeat application and grants. UI checks exercise saving owner details, clearing the ALT setting, locked linked fields and compact badges with group focus.
