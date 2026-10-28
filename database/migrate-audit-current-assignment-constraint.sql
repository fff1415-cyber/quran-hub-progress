-- Apply ONLY after reviewing plan_duplicate_current_review and approving each
-- resolution from real evidence. This migration never chooses/deletes a row.
-- A duplicate causes UNIQUE creation to fail without changing any assignment.
SET @audit_ddl = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='student_plan_assignments' AND column_name='integrity_current_student')=0, 'ALTER TABLE student_plan_assignments ADD COLUMN integrity_current_student VARCHAR(50) GENERATED ALWAYS AS (CASE WHEN status IN (''active'',''frozen'') THEN student_id ELSE NULL END) STORED', 'SELECT 1');
PREPARE audit_stmt FROM @audit_ddl; EXECUTE audit_stmt; DEALLOCATE PREPARE audit_stmt;
SET @audit_ddl = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='student_plan_assignments' AND index_name='uk_integrity_current_student')=0, 'CREATE UNIQUE INDEX uk_integrity_current_student ON student_plan_assignments(integrity_current_student)', 'SELECT 1');
PREPARE audit_stmt FROM @audit_ddl; EXECUTE audit_stmt; DEALLOCATE PREPARE audit_stmt;
