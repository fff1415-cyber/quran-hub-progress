# Stage 2 independent roster/cache safeguards — candidate only

This branch depends on the unpublished stage 1 candidate. Publication remains held by restored-database access and complete main/subdomain isolation. It is not the full cell-sync release.

Changes: authenticated roster failures preserve the previously confirmed private roster instead of replacing it with an empty/public partial copy; confirmed empty responses remain distinct. Freshness is scoped by account, complex and role. Failed app-state pulls never mark the cache fresh. Responses received after an account/complex switch cannot replace the new cache. Pulling data no longer uploads legacy local financial/tarbawi stores merely because the server has no corresponding key. A visible failure banner offers a real forced retry.

Acceptance: `node tests/stage2-roster.cjs` exercises offline preservation, complete vs empty reads, scoped freshness, failed state pulls, stale account responses, absence of pull-initiated writes and the actual retry component. Existing calendar-continuity regression still passes. No role checks, grading rules or data formats change.

Remaining stage 2 work: integrate atomic cell writes, server conflict detection and durable per-session pending operations with all general/scientific/kiosk writers; protect old-client cutover and rollback; validate two independent writing sessions on the restored environment. These requirements are not claimed complete by roster safeguards.
