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
