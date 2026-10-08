-- The dedicated API creates these tables on first use; this migration is also available for manual setup.
CREATE TABLE IF NOT EXISTS academic_report_notes (
  complex_id INT UNSIGNED NOT NULL, student_id VARCHAR(50) NOT NULL,
  note TEXT NOT NULL, updated_by VARCHAR(255) NOT NULL, updated_at DATETIME NOT NULL,
  PRIMARY KEY (complex_id, student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS academic_report_approvals (
  complex_id INT UNSIGNED NOT NULL, fingerprint CHAR(64) NOT NULL,
  scope VARCHAR(20) NOT NULL, period_from DATE NOT NULL, period_to DATE NOT NULL,
  approved_by VARCHAR(255) NOT NULL, approved_at DATETIME NOT NULL,
  snapshot_json LONGTEXT NOT NULL,
  PRIMARY KEY (complex_id, fingerprint)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
