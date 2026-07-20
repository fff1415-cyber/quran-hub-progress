/*
  Quran Hub - MySQL schema for Hostinger
  Database: u112851217_msht_io
  Run in phpMyAdmin after selecting that database.
*/

CREATE TABLE IF NOT EXISTS `halaqat` (
  `id` INT NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `is_talqeen` TINYINT(1) NOT NULL DEFAULT 0,
  `teacher_name` VARCHAR(255) NOT NULL DEFAULT '-',
  `teacher_code` VARCHAR(50) NOT NULL DEFAULT '',
  `assistant_name` VARCHAR(255) NOT NULL DEFAULT '-',
  `assistant_code` VARCHAR(50) NOT NULL DEFAULT '',
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_teacher_code` (`teacher_code`),
  KEY `idx_assistant_code` (`assistant_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `students` (
  `id` VARCHAR(50) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `halaqa_id` INT NOT NULL,
  `national_id` VARCHAR(20) NOT NULL,
  `parent_phone` VARCHAR(30) NOT NULL DEFAULT '',
  `level` VARCHAR(10) NOT NULL DEFAULT '1',
  `level_type` ENUM('gold', 'silver') NOT NULL DEFAULT 'gold',
  `assigned_to` ENUM('teacher', 'assistant') NULL DEFAULT NULL,
  `memorized` TEXT NULL DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_national_id` (`national_id`),
  KEY `idx_halaqa` (`halaqa_id`),
  KEY `idx_nid` (`national_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `role_accounts` (
  `id` CHAR(36) NOT NULL,
  `role` VARCHAR(50) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `code` VARCHAR(50) NOT NULL,
  `permissions` JSON NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`),
  KEY `idx_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `app_state` (
  `key` VARCHAR(100) NOT NULL,
  `value` JSON NOT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
