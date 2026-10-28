-- Explicit, additive migration. No existing grade or completion is reassigned.
CREATE TABLE IF NOT EXISTS plan_diary_events (
 id CHAR(36) NOT NULL PRIMARY KEY,
 complex_id INT NOT NULL,
 semester_id CHAR(36) NOT NULL,
 student_id VARCHAR(50) NOT NULL,
 assignment_id CHAR(36) NOT NULL,
 week_number INT NOT NULL,
 day_key VARCHAR(12) NOT NULL,
 field_name VARCHAR(32) NOT NULL,
 completed_at DATE NOT NULL,
 grade_json LONGTEXT NOT NULL,
 requested_quantity DECIMAL(10,3) NOT NULL DEFAULT 0,
 segments_json LONGTEXT NOT NULL,
 operation_id VARCHAR(128) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 revoked_at DATETIME NULL,
 KEY diary_cell (complex_id,semester_id,student_id,week_number,day_key,field_name),
 KEY diary_assignment (assignment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
SET @audit_ddl = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='plan_operations' AND column_name='input_json')=0, 'ALTER TABLE plan_operations ADD COLUMN input_json LONGTEXT NULL', 'SELECT 1');
PREPARE audit_stmt FROM @audit_ddl; EXECUTE audit_stmt; DEALLOCATE PREPARE audit_stmt;
