# Plan, sard and session regression checks

Run from the repository root after `npm ci`:

```sh
node tests/plan-sard-regression.cjs
node tests/plan-numbering-regression.cjs
node tests/sard-force-review-regression.cjs
node tests/sard-client-sync-regression.cjs
php tests/backend-sard-regression.php
npm run build:hostinger
```

The PHP test requires PHP 8.3 with PDO SQLite. It invokes the real API handlers with isolated in-memory fixtures, translates MySQL metadata/upsert syntax for SQLite, and removes `FOR UPDATE`. It covers atomic plan/queue commits, injected insert and queue-save failures, repeated approval, hifz-only completion, sequential stale-device writes, tenant boundaries, role restrictions and missing task identity. It does **not** prove MySQL row-lock behavior or production credentials/configuration. No production data is used.

The client checks exercise assignment identity, duplicate enqueue prevention, token reconciliation, serialized queue writes, pending-pull protection and rollback after rejected remote writes.

Before production release, additionally verify on a MySQL staging server that two simultaneous approvals produce one advancement, that simultaneous changes to different queue entries survive, and that interrupted requests are reflected after refresh. Deploy frontend and PHP together; old clients submitting whole-queue replacements are intentionally rejected.
