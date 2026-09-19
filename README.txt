1616 Transfer Portal — Google Sheets live workspace

Open the hosted index.html or sign-in.html using HTTP(S), then sign in with Google. Local address: http://localhost:8768/1616-transfer-dashboard-real-data/sign-in.html
The app reads saved records from Google Sheets. No player directory or fictional applications are bundled in this distribution.

TEAM ACCESS
Sign in as raidarqn@gmail.com, open Settings > Team access, enter the teammate name and Google email, choose Transfer Team Lead or Transfer Support, then Save team access. Share the hosted portal address with them. This authorizes access; it does not send an email. The sole administrator is fixed. Leads can edit players. Supports can view players and send/reply to pings. The server checks each request. Teammates do not require direct spreadsheet access.

DATA
The one-time import contains 11,057 LWServers public-snapshot contacts for servers 1605–1636, imported September 19, 2026. It reflects the available snapshots, not instantaneous game state. Only Applicants and Prospects are eligible for subsequent manual LWServers checks. Proposed changes require approval.
Real website submissions in the Applications sheet are imported on workspace refresh (approximately every minute when not editing). Original submission fields are retained in Record management. Application matching requires human identity review. Questions are shown in Application matching.
Edits are journaled in PortalChanges, with timestamps and the authenticated user. Original Applications and PortalPlayers source rows are preserved. Do not rename tabs or remove journal rows. The save bar shows Saving, Saved, or NOT SAVED. Retry an interrupted save using Retry save; conflicting edits require refresh. Do not leave while a change is unsaved.

WORKSPACE
Set actual seat capacities in Settings before approving confirmed seats; no invented limits are supplied. Personal preferences, notes, pings, history, aliases, previous names and account links are saved to the sheet. Confidential ping content is withheld from users other than sender, recipient and administrator. Spreadsheet owners still have access to its contents.
Trash supports recoverable archiving; permanent purge is not enabled in this live version. Reminders and ping sounds work while the app is open; no email or background push service is configured. Some descriptive interface text still falls back to English.

HOSTING
This local address works only on this computer. Publish these frontend files to an HTTPS host and add its hostname to Firebase Authentication authorized domains before sharing with the team. The existing Apps Script deployment is the backend; do not replace the separate application website's submission script.
