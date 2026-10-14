# Portal runtime

`portal-public.ts` is the deployed Supabase Edge Function bundle, recovered from the dashboard on October 13, 2026 and retained here so frontend regression tests exercise the production validation contract. The original module sources and bundler were not present in this checkout. Runtime credentials continue to come from environment variables.

Version 1.0.36 adds a `groupsOnly: true` mode to `transferOrganization` writes. Such requests may contain only `groupLeads` and `groupDetails`; assignments and limits are copied from current server state. Ordinary alliance-placement writes still enforce approved-applicant eligibility and capacities. Both paths retain validated group metadata, permissions and revision checks.

Deploy this bundle to the existing `portal-public` function before releasing the matching frontend. Deploying GitHub Pages alone does not update the Edge Function. The backend change was deployed through the Supabase dashboard before the 1.0.36 frontend release. No schema migration is required.

Run `node --test tests/*.test.mjs` from the repository root. The backend regression tests evaluate the exact domain module from this bundle with fictional records; they cover stale placement references, save/reopen/rename/unlink, metadata retention, invalid payloads, support restrictions, revision conflicts and unchanged placement eligibility.
