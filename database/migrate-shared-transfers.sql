-- Run only after restoration/isolation acceptance. Never executed by HTTP requests.
CREATE TABLE IF NOT EXISTS transfer_threads (
 complex_id INT NOT NULL,
 id VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 halaqa_id INT NOT NULL,
 target_role VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
 version VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 value LONGTEXT NOT NULL,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(complex_id,id),
 KEY transfer_halaqa(complex_id,halaqa_id),
 KEY transfer_target(complex_id,target_role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS transfer_receipts (
 complex_id INT NOT NULL,
 operation_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 actor_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 input_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 value LONGTEXT NOT NULL,
 applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(complex_id,operation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
