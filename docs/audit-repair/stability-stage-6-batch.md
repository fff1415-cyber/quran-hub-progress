# Stage 6 independent roster-batch transaction candidate

The students and halaqat batch endpoints could save early rows before a later validation/SQL error. They now prepare and validate the existing row parameters first, then execute all rows in one transaction, rolling back on any write failure. Existing SQL fields, auth and tenant rules are unchanged. Errors use the stage 1 diagnostic reference without exposing SQL or student values.

`php tests/stage6-batch.php` calls both actual handlers with isolated SQLite fixtures: repeat upsert, second-row trigger failure after a first-row update, complete rollback and second-row tenant validation before writes. This is not a MySQL concurrency proof or an atomic transaction across roster import and subsequent plan linking. Native database and end-to-end acceptance remain required before deployment, which is held by the project restoration/isolation gates.
