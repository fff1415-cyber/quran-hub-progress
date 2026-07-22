/*
  Education plans & cumulative tracking — run after schema.sql
  Database: u112851217_msht_io
*/

CREATE TABLE IF NOT EXISTS `education_plans` (
  `id` CHAR(36) NOT NULL,
  `track` ENUM('gold', 'silver') NOT NULL,
  `level_number` INT NOT NULL COMMENT 'Juz (gold 1-30) or phase (silver 1-60)',
  `title` VARCHAR(255) NOT NULL DEFAULT '',
  `segment_count` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_track_level` (`track`, `level_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `plan_segments` (
  `id` CHAR(36) NOT NULL,
  `plan_id` CHAR(36) NOT NULL,
  `segment_index` INT NOT NULL COMMENT '1-based order within plan',
  `hifz_plan` TEXT NOT NULL,
  `rabt_plan` TEXT NOT NULL,
  `muraja_plan` TEXT NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_plan_segment` (`plan_id`, `segment_index`),
  KEY `idx_plan_segments_plan` (`plan_id`),
  CONSTRAINT `fk_plan_segments_plan`
    FOREIGN KEY (`plan_id`) REFERENCES `education_plans` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `student_plan_assignments` (
  `id` CHAR(36) NOT NULL,
  `student_id` VARCHAR(50) NOT NULL,
  `plan_id` CHAR(36) NOT NULL,
  `start_segment_index` INT NOT NULL DEFAULT 1,
  `plan_start_date` DATE NULL DEFAULT NULL,
  `start_muraja_segment` INT NULL DEFAULT NULL,
  `status` ENUM('active', 'frozen', 'transferred') NOT NULL DEFAULT 'active',
  `assigned_by` VARCHAR(255) NOT NULL DEFAULT '',
  `assigned_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `frozen_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_spa_student` (`student_id`),
  KEY `idx_spa_plan` (`plan_id`),
  KEY `idx_spa_status` (`status`),
  CONSTRAINT `fk_spa_plan`
    FOREIGN KEY (`plan_id`) REFERENCES `education_plans` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `segment_completions` (
  `id` CHAR(36) NOT NULL,
  `student_id` VARCHAR(50) NOT NULL,
  `plan_id` CHAR(36) NOT NULL,
  `segment_index` INT NOT NULL,
  `task_type` ENUM('hifz', 'rabt', 'muraja') NOT NULL,
  `completed_at` DATE NOT NULL,
  `recorded_by` VARCHAR(255) NOT NULL DEFAULT '',
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_completion` (`student_id`, `plan_id`, `segment_index`, `task_type`),
  KEY `idx_sc_student` (`student_id`),
  KEY `idx_sc_plan_seg` (`plan_id`, `segment_index`),
  CONSTRAINT `fk_sc_plan`
    FOREIGN KEY (`plan_id`) REFERENCES `education_plans` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
