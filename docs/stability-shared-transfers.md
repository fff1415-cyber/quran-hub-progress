# Shared transfer candidate — explicit role approval

The user separately approved the transfer access proposal on 2026-11-05. This approval applies to this workflow only: teacher/assistant create and follow up within their halaqa; manager reads the complex's transfers and routes a pending case to secretary or supervisor; secretary/supervisor read and close only cases routed to their role. Other roles are denied. No broader account permissions were changed.

Base: PR #58, preserving #50–#56. This is not a production release and does not waive restoration, backup or domain-isolation gates.

## Persistence and access

Two dedicated InnoDB tables hold transfer threads and immutable receipts. They are not `app_state` blobs: an older generic app-state reader/writer cannot disclose, inject or replace new transfer records. The read endpoint filters complex/halaqa/recipient in SQL and validates row ownership metadata again. General app-state endpoints also reserve transfer namespaces and require canonical lowercase ASCII key identifiers, preventing collation-alias bypasses of reserved keys.

Each change locks its thread, checks the observed version and writes the state, audit event and receipt in one transaction. Operation IDs are unique per complex across actors; a receipt cannot be reused by another actor or payload. Known retries return only the original acknowledgement. Concurrent writes to one thread produce an explicit conflict; independent threads retain both changes. Attributions and times are server-generated. Routing an already routed/closed case cannot create a second destination. Recipient actions update both original and recipient projections in the same thread value.

Request handlers do not create or alter tables. Before a write, schema readiness checks require the dedicated columns, InnoDB engines and composite primary keys. An incompatible preexisting schema fails before the first mutation.

## Browser behavior

Immutable per-operation local-storage entries survive offline requests and browser reopening. Pending duplicate callbacks reuse their packet. A late tab failure cannot downgrade another tab's confirmed receipt. Global visible-page polling retries pending work and refreshes authorized inboxes every 15 seconds, with online/focus/visibility resume. Session/complex/role/account/halaqa fences prevent a delayed response from entering another account's view.

Teacher creation, manager forwarding, recipient closure and teacher follow-up wait for matching server acknowledgements. Pending/conflicting work has a persistent status banner and manual review; no automatic rerouting or overwrite is offered. Shared records stay in per-account caches. Read/hide marks affect only that account; hiding an alert does not delete its server history or another user's inbox.

Previously local transfer records are retained without truncation, bulk upload, recipient guesses or ID conversion. Their existing local callbacks remain available and explicitly report device-only persistence. New shared records are never copied into the browser-wide legacy notification cache. Other notification types and external push dispatch behavior are retained.

## Rollout requirements

`database/migrate-shared-transfers.sql` must first be executed and repeated on the independently credentialed restored test database. Verify all preexisting data before/after. Test the frontend/PHP/table changes together and enable `QHP_TRANSFER_WRITES_V1=true` only for the isolated candidate. The switch defaults off. Do not apply any migration or activate this flag on production before the required real restore, fresh recoverable production backup, main-domain isolation proof and acceptance results are available. Do not modify m1 or m2.

Synthetic acceptance is in `tests/transfer-sessions.cjs` (actual client serializer + production PHP router, isolated role sessions), `tests/transfer-client.cjs` (actual manager UI/runtime, receipt timing, storage failures, scope fencing and legacy retention), and `tests/transfers-native.php` (MySQL/MariaDB row races, receipt rollback, repeatable migration and fail-closed schema checks). Legacy-local transfer fixtures remain applicable; the previous byte-for-byte scope assertion that prohibited all shared transport is superseded by the user's separate approval for this candidate.

Still required: test restoration and domain isolation on Hostinger; real hosted-device acceptance after the safety gates; and the remaining non-transfer daily/program workflows. No production writes, deployment or historical migration are performed by this PR.
