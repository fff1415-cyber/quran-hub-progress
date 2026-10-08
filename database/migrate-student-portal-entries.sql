-- Optional manual migration. The dedicated API also creates this table on first use.
CREATE TABLE IF NOT EXISTS `student_portal_entries` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `complex_id` INT UNSIGNED NOT NULL,
  `student_id` VARCHAR(50) NOT NULL,
  `visit_key` CHAR(36) NOT NULL,
  `visit_date` DATE NOT NULL,
  `visited_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_student_portal_entry` (`complex_id`, `visit_key`),
  KEY `idx_student_portal_date` (`complex_id`, `visit_date`, `student_id`),
  KEY `idx_student_portal_student` (`complex_id`, `student_id`, `visit_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
