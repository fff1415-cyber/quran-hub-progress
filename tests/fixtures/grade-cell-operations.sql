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
