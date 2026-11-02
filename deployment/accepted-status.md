# Accepted applicants

`Accepted` records that entry to 1616 was approved and accepted through the app. It retains a distinct status from `Approved` and arrival (`Transferred`), but Accepted applicants are also included in Approved groups, filters, and Promised seat counts and rosters. Accepted remains independently filterable, and seat capacity counts each player once. No existing status is migrated automatically.

Accepted applicants remain active, retain their confirmed-seat allocation, can be assigned to a destination alliance, appear in seat confirmations and messenger projections, and remain locked into sandbox capacity totals. The server records `acceptedAt` and `acceptedBy`, preserving the original approval date. Status labels cover all portal and messenger languages.

## Release

1. Run `node --test tests/*.test.mjs` (185 tests).
2. Back up the deployed `portal-public` source and verify it matches the repository base.
3. Apply `backend/accepted-status.sql`. It updates six existing function bodies in place, retaining other behavior and permissions. It does not change player records. The migration is idempotent.
4. Deploy `backend/portal-public.ts` to the existing Edge Function with its settings unchanged.
5. Publish the frontend. Verify the Accepted filter/option in version 1.0.62 without changing a real applicant for testing.

Backend tests cover occupied-seat preservation, capacity rejection with Accepted players present, support restrictions, alliance eligibility, acceptance timestamps, and distinction from arrival. Database checks confirm seat-confirmation eligibility and the private messenger status projection.
