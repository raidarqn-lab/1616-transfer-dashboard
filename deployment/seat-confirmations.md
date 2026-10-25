# Seat confirmations

`seat-confirmations.html` implements the selected Directory rows layout alongside Applicant Messenger. Both pages share the existing `applicant_messenger` role. Transfer Hub administrators and leads also have access; support and member accounts do not gain access.

Rows show name, server, current/original alliance, transfer group, assigned group transfer lead, application status, confirmed colour, and confirmer. Gold, Purple, Blue and White use chair icons. Unconfirmed rows are yellow; saved confirmations are green with a trailing check. All/Unconfirmed/Confirmed filters and name search operate locally. Controls and messages use the existing eight languages, including RTL Arabic.

The confirmer list contains active Messenger accounts and Transfer Hub administrators/leads. Messenger names are assigned in Transfer Hub → Settings → Team Access. **Save display name only** updates the dropdown name without resetting credentials or ending sessions. Historical confirmation names remain preserved. Existing confirmations remain green even if their original confirmer is no longer active; an active confirmer must be selected to change them.

## Data and concurrency

Only Pending, Under Review, Approved, and Waitlisted applications are eligible. Contacts, prospects, withdrawn, rejected, transferred, merged and deleted records are excluded. Seat colours are confirmations, never estimates; no status or destination alliance is changed.

The service-only account RPC dispatches to a private, narrowly scoped seat function. Read responses contain only basic row fields, confirmation metadata and opaque confirmer IDs/display names. Contact details, internal notes, staff emails, usernames, and full records are not returned. The applicant reference message is included for the Copy message action.

Saves validate the current authenticated actor, active selected confirmer, four allowed colours, row revision, and approved-seat capacity. The portal control row uses the existing global commit lock. Changes increment record/global revisions, write the existing portal transaction stream, preserve unrelated fields and append an internal audit entry. Authenticated actor and nominated confirmer are recorded separately. Retries use an idempotency key; concurrent edits return a conflict.

## Deployment

1. Apply `backend/seat-confirmations.sql` to the active project `dycbjythqwumyzseskfh`. It patches the existing dispatcher with a guarded, repeatable injection and preserves authentication branches and grants. No player records are modified during installation.
2. Build with `node deployment/manual-accounts/build.mjs` and deploy `deployment/manual-accounts/index.bundled.ts` to the existing `nova-auth` Edge Function, preserving its environment and gateway settings.
3. Publish the frontend through the repository's existing GitHub Pages process.

## Verification

`node --test tests/*.test.mjs` covers role/auth argument isolation, translation completeness, filtering, privacy projection and existing portal behavior. Run `tests/seat-confirmations-postgres.mjs` with `PGLITE_MODULE` pointing to PGlite for transactional tests of revocation, confirmed-by validation, capacity, audit attribution, stale edits, repeated saves and migration idempotence. The existing `tests/applicant-messenger-postgres.mjs` also remains required.

Rollback the frontend and auth bundle to the preceding revision if needed. The private database functions can remain installed without being exposed by the prior auth handler. Do not erase existing seat confirmations or audit history.

To add group lead names to an existing installation, apply `backend/seat-confirmations-transfer-lead.sql` and publish the frontend. This exposes only the assigned player name from `transferOrganization.data.groupLeads`; deleted, merged, moved or ambiguous leaders show as not assigned. No auth bundle update is needed.

The Copy message action uses a separate multilingual follow-up template on Seat confirmations. It rechecks authenticated access and the current application code on every click, preserves unsaved seat selections, and falls back to a selectable dialog when clipboard access fails. Apply `backend/seat-confirmations-message.sql` after the group-lead migration before deploying this frontend. Only the existing applicant-reference message is added to the restricted projection; Applicant Messenger copy remains unchanged.

## Private screenshots (v1.0.54)

Apply `backend/seat-confirmations-images.sql` **after** the existing seat migrations, then rebuild/deploy `nova-auth` and publish the frontend. This migration is repeatable and changes no player records. If reinstalling an earlier seat migration, reapply the image migration last to restore its dispatch and projection additions.

Each eligible player has one screenshot in `transfer_private.seat_images`, separate from player payloads and full snapshots. No public URL or direct client table grant is created. Reads and writes use the existing helper/owner/lead authorization; writes revalidate active accounts under the existing commit lock. Replacements require the current image version, support retry idempotency, and record uploader/time plus an audit event. Uploading does not confirm the seat or change application status, record revision, or unsaved choices.

JPG/PNG/WebP input is limited to 15 MiB, re-encoded as JPEG with metadata removed, resized to at most 1920 pixels on the long edge, and bounded at 1,200,000 data-URL characters. PostgreSQL validates size and JPEG markers. The `?upload=seat-image` route accepts the bounded image body only for `seat-image-save`; existing auth actions retain their 4 KiB request limit. Lists return only the image version; the image itself is fetched on demand after a fresh access check.

Validation: 122 Node tests, both local PostgreSQL suites, and a browser fixture using fictional players verified upload/view, uploader metadata, and preserving an unsaved Gold selection. No real applicant screenshots or seat colours were changed during verification.

## Helper access messages (v1.0.55)

Transfer Hub → Settings → Team Access → Applicant Messenger includes **Copy access message…** in an active helper's account dialog. Successful login setup/reset opens the message builder automatically with the saved username/display name and the password just entered. Existing accounts use an explicit password placeholder; the owner may enter a known password only for the message. This does not call a password-reset API.

The builder includes the login link, seat-confirmation and screenshot steps, accuracy/approval guidance, and Applicant Messenger instructions. Work timing is editable before copying. Password/message fields are cleared on dialog close, account change, disable, and composer close; nothing is added to local storage or sent to the backend for this feature. Clipboard failure selects the preview for manual copying. Only the existing owner-only messenger administration UI mounts this function.

Validation: 125 Node tests and a local browser fixture verified saved-credential autofill, copying, and clearing credentials when reopening. No live accounts were created or changed. Frontend-only release; no SQL or Edge Function deployment is needed.
