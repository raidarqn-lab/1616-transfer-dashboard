# Portal runtime

`portal-public.ts` is the deployed Supabase Edge Function bundle, recovered from the dashboard on October 13, 2026 and retained here so frontend regression tests exercise the production validation contract. The original module sources and bundler were not present in this checkout. Runtime credentials continue to come from environment variables.

Version 1.0.36 adds a `groupsOnly: true` mode to `transferOrganization` writes. Such requests may contain only `groupLeads` and `groupDetails`; assignments and limits are copied from current server state. Ordinary alliance-placement writes still enforce approved-applicant eligibility and capacities. Both paths retain validated group metadata, permissions and revision checks.

Deploy this bundle to the existing `portal-public` function before releasing the matching frontend. Deploying GitHub Pages alone does not update the Edge Function. The backend change was deployed through the Supabase dashboard before the 1.0.36 frontend release. No schema migration is required.

Run `node --test tests/*.test.mjs` from the repository root. The backend regression tests evaluate the exact domain module from this bundle with fictional records; they cover stale placement references, save/reopen/rename/unlink, metadata retention, invalid payloads, support restrictions, revision conflicts and unchanged placement eligibility.

Version 1.0.37 adds isolated `seatSandbox` shared records. The server accepts specific scenario commands, stamps requester/reviewer identities, requires a different admin/lead to approve an exception, and rejects mixed sandbox/live writes. The embedded domain must match `seat-sandbox-core.mjs`; the test suite enforces this. See `deployment/seat-sandbox.md` for release and verification details.

## Alliance guidelines

Apply `alliance-guidelines.sql` to the existing active project. It extends the existing authenticated hub-content routes for kind `alliance-guidelines`, retaining other handlers, and adds only the assigned alliance’s published snapshot to the existing private applicant-status projection. No Edge Function changes or additional credentials are required. R4 leaders edit their assigned alliances; the master can edit all five. Separate draft and published content, optimistic revisions, and private audit history are retained. New tables use RLS with no public table grants.

`verify-alliance-guidelines.sql` checks alliance boundaries, draft privacy, publication, stale revisions, revoked access and applicant status using synthetic fixtures in a rolled-back transaction. No actual rules are seeded. Each document stores English, Spanish, Portuguese, French, Arabic, Vietnamese, Korean and German copies. Drafts may be incomplete; publishing requires introduction and rules in every language. Applicants receive the published language map and display their selected language, with RTL layout for Arabic.

Apply `public-alliance-rules.sql` to expose only published alliance translations and publication time at the public read-only RPC. This supports shareable rules pages without applicant codes. Drafts, audit records, author identities and application data remain private. The hub link opens the corresponding public page.
