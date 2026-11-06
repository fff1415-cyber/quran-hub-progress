# Protect referenced catalogs

Depends on #62 and the previous application stack. No production application deployment or merge. Existing roles and educational rules remain unchanged.

Confirmed causes: importing different content under the same track/level overwrote the existing catalog and deleted its segments even when historical assignments/completions referenced it. Deleting a catalog deleted its assignments and completions. Both paths could remove or reinterpret student history.

An identical used-catalog import remains an exact no-op, preserving IDs. A changed used catalog is refused with 409 before mutation. Any current, frozen or transferred assignment, any completion (including orphan legacy rows) or an academic-only reference protects the catalog. Whole mixed import batches roll back on a protected or invalid item; malformed rows/duplicate segment indices cannot silently produce partial success. Truly unused catalogs can still be edited/deleted without removing student records. Used-content version creation remains a separate future operation; no revision is invented or applied retrospectively.

Import/delete and assignment creation lock the same catalog row. Assignment metadata is refreshed under that lock, with its existing start-segment recheck, preventing a catalog from being edited/deleted between reference verification and linking. Existing receipt replay remains ahead of new-link mutations. Engine guards perform metadata reads only and reject nontransactional catalogs. No request-time DDL.

Synthetic tests: identical no-op; current/frozen/transferred/orphan references; immutable metadata/completions; mixed-batch rollback; invalid duplicate segments; genuinely unused operations; native concurrent import/link plus affected freeze/resume and passing-transition acceptance. Only affected tests are included.

The separate backup-refresh workflow runs once on opening this exact branch's PR, using the unchanged, previously validated private export implementation (verified by Git diff against #50). It creates a private consistent production archive outside served files, checks gzip integrity and records a checksum. It does not deploy, restore production or mutate production records. This refresh alone does not prove restoration into the independent test database; that and real main/m1/m2 document-root evidence remain mandatory gates.
