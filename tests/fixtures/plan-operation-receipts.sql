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
