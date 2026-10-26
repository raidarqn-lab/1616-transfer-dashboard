# Applicant Messenger

Owner-managed, password-only logins that can search the active applicant list and copy the existing prepared message. These accounts have no linked player or leadership identity. Their API returns an explicit allowlist: row ID, applicant name, server, transfer group, application status, approval, destination alliance, confirmed seat, applicant-facing rejection reason and prepared message; missing or ambiguous codes produce an unavailable message. Contacts, prospects, transfers, withdrawn, merged and deleted records are excluded, matching the active Applicants view.

## Owner workflow

Transfer Hub → Settings → Team Access → Access level: Applicant Messenger → **Create Applicant Messenger login**. Enter a display name, username, password and reason. Share the credentials privately. The owner enters new credentials; deployment does not create accounts or send messages. Search the username later to reset or disable it. Reset/disable invalidates existing sessions.

Sign in at `https://portal.join1616.com/sign-in.html`. This account type goes directly to `applicant-messenger.html`, including when a sign-in URL asks for the full portal. Copying rechecks authorization and the current message. The page clears its list on an authorization failure and also refreshes when returning to the tab and every minute while visible.

## Release (pending production approval)

1. Preserve the current `nova-auth` bundle and database functions. The two pre-change database bodies were compared with the existing source and matched on October 24, 2026.
2. Run `backend/applicant-messenger.sql` without its final commit, followed by `backend/verify-applicant-messenger.sql` and the body of `deployment/manual-accounts/verify.sql`, then roll back. This verifies the deployed schema and existing login flows without retaining test accounts. Local PostgreSQL verification has already passed.
3. Apply `backend/applicant-messenger.sql` on the active project. It adds two columns and a scope constraint, extends the existing owner-only account administration function, and adds an explicit limited projection. It does not change existing account roles, passwords, sessions, player data or grants. It is safe to reapply.
4. Run `node deployment/manual-accounts/build.mjs`, then deploy `deployment/manual-accounts/index.bundled.ts` to the existing `nova-auth` function. Preserve its environment configuration and gateway settings. No other Edge Function requires a change: existing staff verifiers reject identities without a verified leader email.
5. Publish this frontend revision through the existing GitHub Pages workflow. Verify owner creation controls, sign-in routing, name search, exact plain-text copying, missing-code behavior, and denial of full portal/staff APIs. A real username/password is configured by the owner after release.

## Validation

- `node --test tests/*.test.mjs`: all 104 tests pass, including authenticated projection routing, rejection of absent/invalid sessions, forbidden staff access, owner creation, Unicode search and main portal redirect.
- `PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node tests/applicant-messenger-postgres.mjs`: local PostgreSQL integration tests cover the exact migration, restricted response fields, eligible applicants, code selection, owner checks, reset/expiry/disable, existing member/leader flows, rate limits, repeated migration and rollback. Local crypto compatibility helpers are used only for this isolated test database; production continues using its existing pgcrypto functions and password hashing.
- Browser preview: search by accent-insensitive name, exact clipboard text, missing-message state, revoked access clearing, and owner setup dialog verified with fictional data.

## Rollback

Restore the prior `nova-auth` bundle and frontend first. For an urgent shutdown, disable Applicant Messenger accounts and bump their versions; existing leadership/member accounts are unaffected. Revert the two modified database functions using the saved pre-change definitions. Retain the new columns and constraint while any messenger accounts exist; never drop those accounts or cascade-delete sessions as part of rollback. No automatic grant or account conversion occurs during deployment.

Transfer Hub administrators and leads can open **Applicant Messenger** from the sidebar. Their existing staff session loads the authorized workspace and projects the same active applicant-facing details/messages into the shared directory component. Restricted helper accounts still use only the limited `applicant-messenger-list` endpoint. Staff have a return link to Transfer Hub; helpers do not.

## Applicant detail update

Apply `backend/applicant-messenger-details.sql` to an existing installation. It adds a private projection helper and narrowly replaces only the directory expression in the deployed account function, with an expected-definition guard. It preserves every authentication branch and grant. Status, approval, alliance, confirmed seat and rejection gates mirror `transfer_application_status`; only the saved applicant-facing reason is exposed. Preferences and anticipated seat colours are never substituted for confirmed assignments.

Validated with 106 JS tests, local PostgreSQL old-to-new/repeated migration checks, and rollback-only production tests including private-field exclusion and session revocation.

## Applicant language defaults

Apply `backend/applicant-messenger-language.sql` before publishing the updated frontend. This guarded, repeatable migration adds only `applicationLanguage` to the existing restricted detail projection. The original application's language takes precedence over the profile language; legacy records fall back to the saved profile language. Explicitly blank application values remain unspecified.

The directory displays the stated language. Copied access messages use that language independently of the staff interface language, with English for missing or unsupported languages. Templates support English, Korean, Vietnamese, German, French, Portuguese, Spanish and Arabic. Unsupported language labels remain visible with the English fallback indicated.

Validated with 139 JavaScript tests, local PostgreSQL migration/permission regression checks, and a rollback-only production schema check.
