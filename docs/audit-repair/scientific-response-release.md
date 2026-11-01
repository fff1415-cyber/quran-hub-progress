# Preserve newer scientific drafts after an older upload ACK (F09/F11/F17 subset)
Base: 1bb0b54c4084877ab58d246fac57ed539f6fb607.

The scientific full-store upload previously wrote its confirmed snapshot into local storage even if the teacher had edited a newer score, explicit clear or manual override while the request was in flight. The cloud may have saved the older request successfully; that success is not confirmation of the later local edit. This release captures the submitted snapshot at call time (before queue scheduling or caller mutation), keeps the existing serial upload/merge/transport policy, and applies a confirmed snapshot locally only when local content still equals that submitted snapshot. A later local draft and its existing queued upload stay intact.

This changes only pushMergedScientificGrades in application code. It does not change roles/login/tokens/access scope, API transport, merge formula, scientific defaults, manual overrides, clearing semantics, storage format, periods or old scores. If a newer draft exists, remote additions can wait for the next ordinary read/confirmation instead of replacing current work. Current whole-store writes can still lose concurrent edits between devices; this is not the server CAS or semester-isolation fix.

## Isolated acceptance and limits
The exact published function is a negative control: its old ACK erases a synthetic newer local zero. Tests use the actual compiled cloud-sync function and real scientific storage/merge functions, with deferred mock transport: newer 0, explicit empty + override, later other fields; two serial queued requests; failed older upload followed by retry; caller mutation after submission; newer data before queued callback start; unchanged settled draft accepting remote fields; local quota failure and sync-flag restoration. Other students, weeks, manual masks and existing score values remain.

No live student tests, notifications or stored-score recalculation. Existing PHP/SQLite and native MySQL/MariaDB checks are rerun although the API is unchanged. Type/build and exact scope assertions guard all other writers, permissions and business rules. This is callback/transport-level acceptance, not full real-account multi-device browser testing.

## Release and rollback
No database/schema action or write pause. CI builds and tests an independently expressed equivalent response guard over the exact published frontend baseline, preserving explicit scientific clears and the invalid-hifz guard. The frontend archive is hash/CRC/content checked. Rollback uses that bounded frontend alternative; API protocol floor and c805c5d locking remain deployed, no old data restore. No new stored format means all current and newer values stay readable. Never reintroduce the unconditional ACK-to-local overwrite merely to roll back.

Post-release verification reads only the marker, HTML and static entry assets. Full cell-CAS, reliable public grade/plan protocol, semester separation and their compatible UI rollback are still separate held work.
