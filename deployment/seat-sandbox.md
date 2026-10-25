# Seat sandbox / Group decision room

The sandbox reads players and capacities but saves only `shared:seatSandbox`. No sandbox command can write a player, transfer organization, or capacity record. `liveItems()` deliberately excludes sandbox state. Scenarios are shared across the transfer team and saved after each action, with revision conflict checks.

Deploy `backend/portal-public.ts` to the existing `portal-public` Edge Function before deploying the frontend. The pre-change deployed source was compared byte-for-byte with repository HEAD on October 22, 2026. Preserve all existing function settings and authentication. No database schema changes are expected: the existing shared-record store is used.

## Rules

- Confirmed colours are used for accepted/transferred players; otherwise current THP determines colour. Unknown colours are counted separately and marked as incomplete totals.
- All accepted and inbound transferred applicants are automatically included once, in every scenario. Only formally accepted players are automatically counted. Use Add remaining members to sandbox to include the rest of a partially accepted group; removing its trial selection keeps every formal approval.
- Whole-group selection follows saved player IDs through group renames. The full current membership is expanded on refresh, including linked prospects/contacts/withdrawn players with a visible warning. Deleted players and outbound transfers are not standalone candidates. A selected group can exceed capacity for exploration.
- Only admins and leads can write. Support can read. Any different admin/lead can approve or reject an exception; nobody can approve their own request, including admins.
- Pending exceptions do not remove anyone. Approved exceptions exclude the person only in that scenario. Restoring an exception reunites the trial group without further approval.
- Membership changes or formal acceptance make an old exception inapplicable; the player returns to the forecast and the request is labelled Needs new review.
- The author, reason, reviewer, decision and timestamps are server-generated/validated and retained. No messages or notifications are sent automatically; reviewers open the scenario’s Group exceptions section.
- Language controls use existing translation hooks; primary sandbox labels and approval safeguards are supplied in all six translated interface languages. Other descriptions retain the portal’s English fallback.

## Verification

Run `node --test tests/*.test.mjs`. Sandbox tests exercise both the pure forecast and the exact Edge Function domain, including independent review, stale revisions, acceptance after exclusion, no live mutation, over-capacity trials, unknown THP, scenario isolation and denied forged/mixed writes.

Browser QA uses a temporary harness with fictional players and the real frontend/domain modules. Do not deploy that harness. Verify scenario creation, whole-group selection, requester/reviewer separation, approve/restore, acceptance sync, and responsive rendering. A deployed smoke check should read the new screen and may create one empty planning scenario; it must not change real applications, memberships or seat settings.

The bundle embeds `seat-sandbox-core.mjs` between BEGIN/END markers. The regression test asserts the embedded copy exactly matches the source; regenerate that block whenever editing the core.

## Version 1.0.40

The seat viewer lists the same forecast members used by the capacity totals, by colour. Formal approvals and trial-only members have separate labels; overflow and unknown colours remain visible. Existing explicit whole-group selections are preserved. Merely having an accepted member no longer silently includes every unaccepted group member. Deploy the updated Edge Function before the frontend so removal of a trial selection from a partially accepted group is supported.

## Version 1.0.57

The applicant roster is one continuous list with every group expanded, groups ordered alphabetically and names ordered alphabetically within each group. Search retains the complete matching group. Group actions resolve their containing roster, and seat-viewer links focus that group in the list. This is a frontend-only update; no Edge Function deployment is needed.
