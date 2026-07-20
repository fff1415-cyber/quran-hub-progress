/*
  ترقية قاعدة موجودة — أضف جداول التقويم الأكاديمي فقط
  نفّذ في phpMyAdmin على قاعدة: u112851217_msht_io
*/

CREATE TABLE IF NOT EXISTS `semesters` (
  `id` CHAR(36) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `start_date` DATE NOT NULL,
  `weeks_count` INT NOT NULL,
  `working_days` JSON NOT NULL,
  `excluded_dates` JSON NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_semesters_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `academic_weeks` (
  `id` CHAR(36) NOT NULL,
  `semester_id` CHAR(36) NOT NULL,
  `week_number` INT NOT NULL,
  `start_date` DATE NOT NULL,
  `end_date` DATE NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_semester_week` (`semester_id`, `week_number`),
  KEY `idx_academic_weeks_semester` (`semester_id`),
  CONSTRAINT `fk_academic_weeks_semester`
    FOREIGN KEY (`semester_id`) REFERENCES `semesters` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
