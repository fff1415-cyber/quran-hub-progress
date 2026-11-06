# Versioned assignment status

Depends on #61 and the complete application stack. Draft only; no production merge/deploy, migration or role/policy change.

Confirmed bug: the same assignment ID remains through freeze/resume cycles. Checking only that ID lets a delayed freeze or a retry after a lost reply undo a newer resume. Status comparison alone also fails after active → frozen → active (ABA).

The existing authorized supervisor/manager status endpoint now requires protocol 1, the displayed status/version and an immutable operation ID. The student row serializes status writes and replacement; status, random version and actor/input-bound receipt commit together in the existing transactional app-state store. No timestamp-based last-writer rule. Replaying the original operation returns its receipt without reapplying its desired status. New requests on an old version conflict, even when the status text matches again. A late receipt failure rolls back the entire update. Existing engine/tenant-key guards apply before writes.

Student-sheet reads include `status_version` without writing anything. New clients store the exact displayed-state packet durably before network access and require same-file authenticated capability confirmation before sending it. Old clients without the protocol are rejected explicitly; old backends cannot receive the new writer through a silent legacy fallback. Deploy backend first and refresh supervisor tabs as part of the gated rollout.

An account-scoped recovery banner retains uncertain/conflicting requests after reopen. Recovery reads the current sheet; if a later operation changed it, the original receipt remains confirmed but the UI reports that the current state differs rather than announcing an outdated status. Quota failure prevents send. Late cross-account plan responses are fenced before reaching callers. No student profile, grades or historical completion is changed by status writes.

Acceptance: actual supervisor callbacks, actual serializer + production PHP router, two independent client sessions, offline-before-send/reopen/lost reply, ABA rejection, stale identity/role checks, same/different concurrent operations on native MySQL/MariaDB, late rollback, retained completions and affected passing-transition tests. Old targeted status fixtures use explicit synthetic protocol packets; they are not a production fallback. Hostinger restore/current backup/domain isolation and real account/browser acceptance remain deployment gates.
