-- Explicit operator migration, NOT called by API or GET. Back up before applying.
-- Preserve segment_completions unchanged. Only existing explicit assignment IDs
-- whose student AND plan match are copied; NULL/mismatched provenance is not guessed.
-- Rerunnable after an interrupted DDL run; MySQL DDL is not transactional.
SET @audit_ddl = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='education_plans' AND column_name='catalog_archived_at')=0, 'ALTER TABLE education_plans ADD COLUMN catalog_archived_at DATETIME NULL', 'SELECT 1');
PREPARE audit_stmt FROM @audit_ddl; EXECUTE audit_stmt; DEALLOCATE PREPARE audit_stmt;
SET @audit_ddl = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='student_plan_assignments' AND column_name='content_snapshot')=0, 'ALTER TABLE student_plan_assignments ADD COLUMN content_snapshot LONGTEXT NULL', 'SELECT 1');
PREPARE audit_stmt FROM @audit_ddl; EXECUTE audit_stmt; DEALLOCATE PREPARE audit_stmt;
SET @audit_ddl = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='segment_completions' AND column_name='assignment_id')=0, 'ALTER TABLE segment_completions ADD COLUMN assignment_id CHAR(36) NULL', 'SELECT 1');
PREPARE audit_stmt FROM @audit_ddl; EXECUTE audit_stmt; DEALLOCATE PREPARE audit_stmt;
CREATE TABLE IF NOT EXISTS plan_assignment_completions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL,
  plan_id CHAR(36) NOT NULL,
  assignment_id CHAR(36) NOT NULL,
  segment_index INT NOT NULL,
  task_type ENUM('hifz','rabt','muraja') NOT NULL,
  completed_at DATE NOT NULL,
  recorded_by VARCHAR(255) NOT NULL DEFAULT '',
  operation_id VARCHAR(128) NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME NULL,
  UNIQUE KEY uk_assignment_task_segment (assignment_id, task_type, segment_index),
  KEY idx_assignment_student (student_id, assignment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO plan_assignment_completions
 (id, student_id, plan_id, assignment_id, segment_index, task_type, completed_at, recorded_by, created_at)
 SELECT c.id, c.student_id, c.plan_id, c.assignment_id, c.segment_index, c.task_type, c.completed_at, c.recorded_by, c.created_at
 FROM segment_completions c JOIN student_plan_assignments a
 ON a.id = c.assignment_id AND a.student_id = c.student_id AND a.plan_id = c.plan_id;
CREATE TABLE IF NOT EXISTS plan_operations (
 id VARCHAR(128) NOT NULL PRIMARY KEY,
 student_id VARCHAR(50) NOT NULL,
 operation_kind VARCHAR(40) NOT NULL,
 input_hash CHAR(64) NOT NULL,
 response_json LONGTEXT NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY idx_plan_operation_student (student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Review reports retain every ambiguous row. Never auto-pick a current assignment.
CREATE OR REPLACE VIEW plan_legacy_completion_review AS
 SELECT c.* FROM segment_completions c LEFT JOIN student_plan_assignments a
 ON a.id = c.assignment_id AND a.student_id = c.student_id AND a.plan_id = c.plan_id
 WHERE a.id IS NULL;
CREATE OR REPLACE VIEW plan_duplicate_current_review AS
 SELECT a.* FROM student_plan_assignments a JOIN
 (SELECT student_id FROM student_plan_assignments WHERE status IN ('active','frozen') GROUP BY student_id HAVING COUNT(*) > 1) d
 ON d.student_id = a.student_id WHERE a.status IN ('active','frozen');
