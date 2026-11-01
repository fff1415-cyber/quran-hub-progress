# Explicit grade transport compatibility floor (F09/F11 prerequisite)
Base: c805c5dad15dc12552751580f9eeae9fbc614f66.

The existing set-app-state handler accepts whole store snapshots. A client using a future explicit transport packet must not have that packet saved as the grade store by an older server. This release rejects any top-level grade_write_protocol marker on grades, weekly_tests and scientific_grades with HTTP 503 before database access. It does not advertise or activate a new writer. Untagged current clients use their exact existing path; nested user fields and unrelated stores remain ordinary data.

The guard follows all original role/key guards. The committee weekly-empty-reset exception does not allow a tagged packet. No auth, roles, tokens, access scope, ownership, GET behavior, schema, calendar, scoring or stored-data changes. No old score repair or attribution; existing ordinary-page data stays in place.

## Isolated acceptance
The exact previous API is a negative control: an explicit packet replaces a synthetic grade store there. Candidate and alternative reject seven marker forms on all three stores with no PDO available, proving no DB action; raw rows remain equivalent. Current untagged saves preserve prior/new fields, nested lookalike data, zero, blank, null and object shape. Existing authorization rejections remain first. SQLite and native MySQL/MariaDB run the same cases plus existing grade-lock contention, failure rollback and first initialization. Candidate -> alternative -> candidate native writes preserve earlier and newer fields. Scope assertions remove only the literal guard and compare the whole API with the published baseline.

## Deployment and rollback
Only api/routes/app_state.php changes in application code. CI packages an independently expressed equivalent guard, retaining the c805c5d initializer fix. It syntax-checks and runs real handlers against the alternative and checks exact ZIP contents and hashes. Deployment performs a private backup and static/hash/php-l verification, without production application data requests.

Use a new reviewed commit with the tested bounded alternative if needed; do not restore a pre-floor API once explicit modern requests may exist or deploy an old full file over later changes. No database restore, deletion, semester reassignment, or frontend rollback is involved. The floor itself writes nothing, so records created before and after it retain their current meaning.

## Remaining dependent work
Future clients must confirm server protocol capability before sending packets, retain unconfirmed local drafts, and use CAS/idempotent endpoints and coherent grade/plan bindings. Legacy-writer cutover, public readers/writers, historical ambiguity, complete browser acceptance, and a modern grade-UI-compatible rollback remain separate. This preparatory guard does not fix current whole-snapshot lost updates or claim F09/F10/F11 complete. Production schema proposal #36 remains unexecuted and requires specific approval.
