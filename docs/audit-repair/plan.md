# Audit remediation F03–F22

Base: `7e9adf1d4059f20289f182e31613e18fe2cf0877` (latest main at start).
Branch: `fix/audit-f03-f22-preserve-history`.

## Non-negotiable scope

F01/F02 are excluded. Authentication, role membership, membership codes, permission checks, account access scopes, student ownership and tenant isolation behavior must remain unchanged. Each touched handler retains its original authorization preamble. No production calls, migrations, deployments, merges, or historical grade recalculation. Unknown legacy provenance remains unknown; review queues preserve original records. Migrations are explicit and additive, never run by application startup or GET.

## Tracking and acceptance plan

| Item | Proposed repair / dependency | Features and history at risk | Acceptance | Rollback / schema or decision |
|---|---|---|---|---|
| F03 | Shared notification/transfer records with per-item compare-and-set; after shared-state patch foundation | Teacher/admin/supervisor/secretary inboxes and action history | Two clients see create, forward, action, close; retries do not duplicate | Keep shared rows and local legacy inbox; additive state metadata |
| F04 | Assignment-specific completion identity and explicit provenance; phase 1 | Repeated plans, undo, supervisor edits, legacy history | Same plan twice keeps both histories; undo never crosses assignments | Retain new index/data; old code cannot safely resume after new rows; schema |
| F05 | Atomic grade-and-completion operation carrying day/semester/assignment/quantity; after F04/F06/F10 | Diary, plan, compensation, scientific defaults | Failure rolls back both, exact undo, old-day edit leaves next plan alone | Retain operation ledger; paired server/client rollback; schema |
| F06 | Stable request IDs, student/assignment lock, one transaction | Quick taps, compensation, retry | Duplicate response is replayed; concurrent distinct writes survive; partial insert rolls back | Keep operation ledger; schema |
| F07 | Target assignment ID and one-current invariant, ambiguous existing duplicates require review | Freeze, resume, replace, progression | Freeze A/replace B/resume A cannot activate two assignments | No automatic cleanup of existing duplicates; schema/review |
| F08 | Commit progression/profile/audit together under current handler checks; after phase 1 | Sard pass, student phase, academic records | Lost response replay; profile/audit/assignment agree; no extra advancement | Ledger retained; no role change; schema |
| F09 | Server-side cell patches with explicit base and conflict responses | Teacher/assistant concurrent diary | Different cells preserved; same-cell stale edit rejected; failure visible | Keep full legacy blob and revisions; additive |
| F10 | Semester-addressed state, explicit legacy bucket, stale-semester write protection | Diary, tests, scientific grades, reports | Two semesters week 1 isolated; old tab cannot overwrite new semester | Never guess legacy semester; keep all buckets; schema/state version |
| F11 | Scientific per-cell revisions and explicit clears | Auto/manual scientific values and overrides | Clear survives merge, stale device cannot resurrect, manual zero preserved | Retain tombstones/revisions; after F09 |
| F12 | Calendar-aware weekly denominator implementation behind an explicit policy | Weekly ranking, portal, exports, compensation | Holidays/partial/4–6 days once policy approved | **Business decision pending**; keep existing default behavior |
| F13 | Date-exact face aggregation and separately reported undated compensation | Face reports and targets | One-day range counts one day; undated legacy compensation not allocated | Code revert; no stored data change |
| F14 | Durable full history, UI-only pagination | Sard/academic histories beyond 500 | More than 500 remain after save/pull; stable IDs deduplicate | No recovery claims for already lost data; no destructive down migration |
| F15 | Session/tenant-aware settings fetch, shared-save errors, attempt rule snapshot | New evaluations and deferred review | Login fetches current settings; failed save not success; locked attempt stable | No historical recalculation; rule snapshots retained |
| F16 | Shared versioned grade/input settings; prospective day snapshots | Scores, UI, exports, historical ratios | New recording uses approved weights; old recording unchanged | Effective-date policy may need decision; no retroactive rewrite |
| F17 | Shared pulls, deadline ticks and confirmed-save UI | Sard, portal, oversight and transfer queues | Two clients refresh; due item appears without navigation; failed write retry visible | Client/server paired rollback; data untouched |
| F18 | Import updates roster separately; unchanged current link reused; errors preserved | Bulk import and existing assignments | Same file twice creates no new assignment; role refusal reported accurately | Code revert; never change existing role checks |
| F19 | Immutable syllabus versions bound to assignments | Active/transferred plans and content history | Reimport changed syllabus keeps old content and completions | Keep immutable versions; schema |
| F20 | Shared eligible segment range and start validation | Plan progress and completion | Start 11/20 + 10 done => 100%; invalid start rejected | Code revert; no historic edits |
| F21 | Explicit valid hifz values, missing/null treated unassessed | Diary arithmetic and components | Missing/invalid does not count; valid half/one/two remain | Code revert; no data rewrite |
| F22 | Assessment presence independent of numeric score | Scientific program totals/charts | Zero is assessed; empty remains unassessed | Code revert; no schema |

## Stage gates

1. Assignment/history and catalog safeguards; isolated PHP and client regression tests before dependents.
2. Grade/completion/progression consistency; injected rollback and response-loss checks.
3. Shared state/semesters/transfers/history; concurrency and legacy retention checks.
4. Versioned settings; only prospective application, defer ambiguous policies.
5. Pure calculations; no merging distinct metrics or changing rounding/pass/attempt policy.
6. Refresh/confirmation UI; cross-client and failure checks.

Every stage commit records files, test evidence, feature/history impact and rollback notes here or in `validation.md`. No production schema operation is authorized. Before deployment preserve a database backup and test the documented migration against a copy. After new-schema writes, reverting binaries alone may lose visibility or cause corruption: keep schema/ledger/version rows and use a compatibility release rather than dropping data.
