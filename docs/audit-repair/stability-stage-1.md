# Stage 1: database stability candidate

Baseline verified 2026-11-04: main and the public msht.io deploy marker both resolve to `5ab482d8aa213c097e3b6c835b81ac2d439f0803`. This branch is a candidate, not a published fix. No production DDL or record writes are authorized by this document.

## Behavior

- Health checks distinguish connection establishment from metadata/query failure. Complete current multi-tenant column and unique-key requirements and app-state capacity determine readiness. Missing optional retry duration retains existing two-day compatibility.
- Request-time schema helpers inspect metadata and fail clearly on missing prerequisites. They no longer add columns or create tables. Roles, tenant checks, scoring, completion attribution and record formats are unchanged.
- Database errors have connection, permission, schema, SQL, integrity, lock-conflict and timeout categories. Public responses use a reference; private logs include category, SQLSTATE, driver errno, file/line and missing schema, without raw SQL, record values, credentials or tokens.
- A lost connection during an active transaction is not silently replaced. Unknown write outcomes are not automatically retried.
- Main grade/plan request wrappers have bounded headers/body time and preserve caller cancellation. This does not make a timeout proof of rollback.
- Grade, scientific, financial and staff merge writers stop if their required cloud read fails. This does not yet solve whole-store concurrency; that is stage 2.
- CLI schema inspection defaults to read-only planning. Additive former runtime column migrations use a database advisory lock and are resumable and repeatable. There is deliberately no production apply CLI in this candidate. Missing base tables, invalid unique keys, capacity changes, historical reconciliation and tenant conversions require a separately tested plan.

## Acceptance

Run `php tests/stage1-database.php`, `php tests/stage1-health.php`, `node tests/stage1-client.cjs`, existing assignment/response and retry settings regressions, the TypeScript diagnostic baseline comparison, and `npm run build:hostinger`.

Native tests accept only `mysql:host=127.0.0.1;port=3307;dbname=audit_test;charset=utf8mb4`, create disposable fixtures, preserve seeded student values through repeated additions, keep schema guards inside READ ONLY transactions, reject missing columns without writes, and verify complete column/index/capacity readiness. CI runs MySQL 8 and MariaDB 11.8 separately.

The production CI probe uses existing deployment credentials exclusively for SSH metadata/SELECT LIMIT 0 inspection. It invokes no application handlers, applies no DDL, modifies no database rows or files, and outputs no credentials or student records. It reports whether expected m1/m2 API/config paths or database identities are shared, without printing those identities. It does not claim a verified database backup.

## Mandatory publication gates

1. Record all native/isolated acceptance results and no additional TypeScript errors. Existing 33 diagnostics are not claimed fixed in stage 1.
2. Confirm the real production columns/indexes/capacity; the old public health success is insufficient.
3. Verify a recent real database backup by restoring into a separate database, including all stored records and required schema. Existing code rollback archives alone do not satisfy this gate.
4. Prove main API/frontend paths are not the m1/m2 roots or shared symlink targets. The existing deploy workflow can upload to subdomain folders depending on its variables, so it must not be used unchanged to publish this stage under a main-only instruction.
5. Check database sharing: schema changes or data reconciliation in a shared database would affect the excluded sites. None are applied by this branch.
6. Prepare a main-only code backup, exact changed-file package and rollback, and test candidate/old-client compatibility on an isolated copy. Test teacher/assistant/musammi read/write journeys in isolated sessions and safe production acceptance using a designated test context; never move real students for testing.
7. Only after the above, publish a specifically scoped main-site package and verify the deployed commit, file hashes, read/write results and available logs. Do not merge just to trigger the existing deployment while these gates are unresolved.

If any gate fails or cannot be established, keep this PR draft and stop dependent production phases. Existing authorization rules and scoring-policy choices remain outside this candidate.
