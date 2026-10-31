-- PROPOSAL ONLY: explicit production approval required before execution.
-- Additive empty tables. No existing ALTER, backfill, reassignment, archive, reset or activation.
-- Preflight must reject an existing namesake with a different definition; see procedure.
-- Never include this file from an application route or deployment workflow.
CREATE TABLE IF NOT EXISTS plan_content_versions (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
 plan_id CHAR(36) NOT NULL,
 content_json LONGTEXT NOT NULL,
 content_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 source_kind ENUM('new_content','observed_current') NOT NULL,
 captured_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uk_content_version(plan_id,content_sha256)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS plan_catalog_versions (
 plan_id CHAR(36) NOT NULL PRIMARY KEY,
 content_version_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT fk_catalog_version FOREIGN KEY(content_version_id) REFERENCES plan_content_versions(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS plan_assignment_versions (
 assignment_id CHAR(36) NOT NULL PRIMARY KEY,
 student_id VARCHAR(50) NOT NULL,
 plan_id CHAR(36) NOT NULL,
 content_version_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 captured_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT fk_assignment_version FOREIGN KEY(content_version_id) REFERENCES plan_content_versions(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS plan_operation_receipts (
 context_id INT NOT NULL,
 operation_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 student_id VARCHAR(50) NOT NULL,
 operation_kind VARCHAR(40) NOT NULL,
 input_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 response_json LONGTEXT NOT NULL,
 applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(context_id,operation_id),
 KEY idx_plan_receipt_student(student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS plan_completion_events (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
 context_id INT NOT NULL,
 operation_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 assignment_id CHAR(36) NOT NULL,
 student_id VARCHAR(50) NOT NULL,
 plan_id CHAR(36) NOT NULL,
 segment_index INT NOT NULL,
 task_type ENUM('hifz','rabt','muraja') NOT NULL,
 event_kind ENUM('complete','revoke') NOT NULL,
 reverses_event_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 completed_at DATE NULL,
 source_reference_json LONGTEXT NULL,
 recorded_by VARCHAR(255) NOT NULL DEFAULT '',
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY idx_completion_assignment(assignment_id,task_type,segment_index),
 CONSTRAINT fk_completion_operation FOREIGN KEY(context_id,operation_id) REFERENCES plan_operation_receipts(context_id,operation_id) ON DELETE RESTRICT,
 CONSTRAINT fk_completion_reversal FOREIGN KEY(reverses_event_id) REFERENCES plan_completion_events(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS plan_completion_heads (
 assignment_id CHAR(36) NOT NULL,
 task_type ENUM('hifz','rabt','muraja') NOT NULL,
 segment_index INT NOT NULL,
 current_event_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 is_completed TINYINT NOT NULL,
 PRIMARY KEY(assignment_id,task_type,segment_index),
 CONSTRAINT ck_completion_flag CHECK(is_completed IN (0,1)),
 CONSTRAINT fk_completion_head FOREIGN KEY(current_event_id) REFERENCES plan_completion_events(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS grade_cell_versions (
 context_id INT NOT NULL,
 store_key VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 path_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 path_json LONGTEXT NOT NULL,
 direct_version VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NULL,
 subtree_version VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NULL,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(context_id,store_key,path_sha256)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS grade_operation_receipts (
 context_id INT NOT NULL,
 store_key VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 operation_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 input_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(context_id,store_key,operation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
