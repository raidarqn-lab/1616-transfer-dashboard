# Owner-managed passwords

Published on the existing active hub project `dycbjythqwumyzseskfh`. The legacy member project remains paused; legacy password hashes were not copied and no user passwords were changed during deployment. Owners create/reissue credentials from Alliance Hub → Administration → Logins & passwords. Google leadership sign-in remains available.

`accounts.sql` installs private RLS-protected account, session, and rate-limit tables plus a service-role-only RPC. Existing linked member account IDs are reused. Active leadership permissions are resolved on every request. `verify.sql` uses synthetic fixtures in a transaction and rolls back all changes.

`node deployment/manual-accounts/build.mjs` builds `index.bundled.ts` for the active project's `nova-auth` Edge Function. It uses the existing SUPABASE_URL, SUPABASE_SECRET_KEYS, FIREBASE_PROJECT_ID, and FIREBASE_API_KEY environment settings. Never include environment secrets in this repository.

The service hashes passwords using PBKDF2-SHA256 (600,000 iterations) with a random 32-byte salt, issues eight-hour random sessions stored only as SHA256 hashes, rate-limits login attempts, and revokes sessions after password/username changes or disabling access. Plaintext passwords are not stored, returned, audited, or logged by this code.

Also deploy the manual-aware Firebase verifier in portal-public, nova-bounty, nova-avatar and nova-magpie. Dependent function snapshots are in `dependents/`; their other behavior is preserved. The member site's login and session modules point to the active nova-auth endpoint. Members whose credentials were only on the paused project need the owner to reissue a login.

Validation: 90 portal tests, 22 member-site tests, PostgreSQL/PLpgSQL syntax parsing, transactional database integration checks, public endpoint rejection checks, and browser UI verification. New credentials are entered and submitted by the owner, not during deployment.
