/*
  Multi-tenant (Multi-Complex) — Step 1
  Compatible with MySQL 8+ and MariaDB 10.4+

  Run once in phpMyAdmin (select your database first).
  If a step fails because the change already exists, skip that step and continue.

  Existing data is assigned to complex_id = 1 (default مجمع).
*/

-- ─── 1. complexes ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `complexes` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `logo_url` VARCHAR(512) NULL DEFAULT NULL,
  `primary_color` VARCHAR(20) NOT NULL DEFAULT '#C9A227',
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `complexes` (`id`, `name`, `primary_color`)
VALUES (1, 'مجمع حلقات الشتيوي', '#C9A227')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);


-- ─── 2. halaqat ─────────────────────────────────────────────────────────────

ALTER TABLE `halaqat`
  ADD COLUMN IF NOT EXISTS `complex_id` INT UNSIGNED NULL DEFAULT NULL AFTER `id`;

UPDATE `halaqat` SET `complex_id` = 1 WHERE `complex_id` IS NULL;

ALTER TABLE `halaqat`
  MODIFY COLUMN `complex_id` INT UNSIGNED NOT NULL;

ALTER TABLE `halaqat` DROP PRIMARY KEY;

ALTER TABLE `halaqat`
  ADD PRIMARY KEY (`complex_id`, `id`);

ALTER TABLE `halaqat`
  ADD KEY IF NOT EXISTS `idx_halaqat_complex` (`complex_id`);

-- FK (ignore error if already exists)
ALTER TABLE `halaqat`
  ADD CONSTRAINT `fk_halaqat_complex`
    FOREIGN KEY (`complex_id`) REFERENCES `complexes` (`id`) ON DELETE RESTRICT;


-- ─── 3. students ────────────────────────────────────────────────────────────

ALTER TABLE `students`
  ADD COLUMN IF NOT EXISTS `complex_id` INT UNSIGNED NULL DEFAULT NULL AFTER `id`;

UPDATE `students` SET `complex_id` = 1 WHERE `complex_id` IS NULL;

ALTER TABLE `students`
  MODIFY COLUMN `complex_id` INT UNSIGNED NOT NULL;

ALTER TABLE `students` DROP INDEX IF EXISTS `uk_national_id`;

ALTER TABLE `students`
  ADD UNIQUE KEY IF NOT EXISTS `uk_complex_national_id` (`complex_id`, `national_id`);

ALTER TABLE `students`
  ADD KEY IF NOT EXISTS `idx_students_complex` (`complex_id`);

ALTER TABLE `students`
  ADD KEY IF NOT EXISTS `idx_students_complex_halaqa` (`complex_id`, `halaqa_id`);

ALTER TABLE `students`
  ADD CONSTRAINT `fk_students_complex`
    FOREIGN KEY (`complex_id`) REFERENCES `complexes` (`id`) ON DELETE RESTRICT;

ALTER TABLE `students`
  ADD CONSTRAINT `fk_students_halaqa`
    FOREIGN KEY (`complex_id`, `halaqa_id`) REFERENCES `halaqat` (`complex_id`, `id`) ON DELETE RESTRICT;


-- ─── 4. role_accounts ───────────────────────────────────────────────────────

ALTER TABLE `role_accounts`
  ADD COLUMN IF NOT EXISTS `complex_id` INT UNSIGNED NULL DEFAULT NULL AFTER `id`;

UPDATE `role_accounts` SET `complex_id` = 1 WHERE `complex_id` IS NULL;

ALTER TABLE `role_accounts`
  MODIFY COLUMN `complex_id` INT UNSIGNED NOT NULL;

ALTER TABLE `role_accounts` DROP INDEX IF EXISTS `uk_code`;

ALTER TABLE `role_accounts`
  ADD UNIQUE KEY IF NOT EXISTS `uk_complex_code` (`complex_id`, `code`);

ALTER TABLE `role_accounts`
  ADD KEY IF NOT EXISTS `idx_role_accounts_complex` (`complex_id`);

ALTER TABLE `role_accounts`
  ADD CONSTRAINT `fk_role_accounts_complex`
    FOREIGN KEY (`complex_id`) REFERENCES `complexes` (`id`) ON DELETE RESTRICT;


-- ─── 5. app_state ───────────────────────────────────────────────────────────

ALTER TABLE `app_state`
  ADD COLUMN IF NOT EXISTS `complex_id` INT UNSIGNED NULL DEFAULT NULL FIRST;

UPDATE `app_state` SET `complex_id` = 1 WHERE `complex_id` IS NULL;

ALTER TABLE `app_state`
  MODIFY COLUMN `complex_id` INT UNSIGNED NOT NULL;

ALTER TABLE `app_state` DROP PRIMARY KEY;

ALTER TABLE `app_state`
  ADD PRIMARY KEY (`complex_id`, `key`);

ALTER TABLE `app_state`
  ADD CONSTRAINT `fk_app_state_complex`
    FOREIGN KEY (`complex_id`) REFERENCES `complexes` (`id`) ON DELETE CASCADE;


-- ─── 6. semesters ───────────────────────────────────────────────────────────

ALTER TABLE `semesters`
  ADD COLUMN IF NOT EXISTS `complex_id` INT UNSIGNED NULL DEFAULT NULL AFTER `id`;

UPDATE `semesters` SET `complex_id` = 1 WHERE `complex_id` IS NULL;

ALTER TABLE `semesters`
  MODIFY COLUMN `complex_id` INT UNSIGNED NOT NULL;

ALTER TABLE `semesters`
  ADD KEY IF NOT EXISTS `idx_semesters_complex` (`complex_id`);

ALTER TABLE `semesters`
  ADD KEY IF NOT EXISTS `idx_semesters_complex_active` (`complex_id`, `is_active`);

ALTER TABLE `semesters`
  ADD CONSTRAINT `fk_semesters_complex`
    FOREIGN KEY (`complex_id`) REFERENCES `complexes` (`id`) ON DELETE RESTRICT;


-- ─── 7. education_plans (only if table exists) ────────────────────────────────

SET @plans_exists := (
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'education_plans'
);

SET @sql := IF(
  @plans_exists > 0,
  'ALTER TABLE `education_plans` ADD COLUMN IF NOT EXISTS `complex_id` INT UNSIGNED NULL DEFAULT NULL AFTER `id`',
  'SELECT 1 AS _skip'
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @sql := IF(
  @plans_exists > 0,
  'UPDATE `education_plans` SET `complex_id` = 1 WHERE `complex_id` IS NULL',
  'SELECT 1 AS _skip'
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @sql := IF(
  @plans_exists > 0,
  'ALTER TABLE `education_plans` MODIFY COLUMN `complex_id` INT UNSIGNED NOT NULL',
  'SELECT 1 AS _skip'
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @sql := IF(
  @plans_exists > 0,
  'ALTER TABLE `education_plans` DROP INDEX IF EXISTS `uk_track_level`',
  'SELECT 1 AS _skip'
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @sql := IF(
  @plans_exists > 0,
  'ALTER TABLE `education_plans` ADD UNIQUE KEY IF NOT EXISTS `uk_complex_track_level` (`complex_id`, `track`, `level_number`)',
  'SELECT 1 AS _skip'
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @sql := IF(
  @plans_exists > 0,
  'ALTER TABLE `education_plans` ADD KEY IF NOT EXISTS `idx_plans_complex` (`complex_id`)',
  'SELECT 1 AS _skip'
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @sql := IF(
  @plans_exists > 0,
  'ALTER TABLE `education_plans` ADD CONSTRAINT `fk_plans_complex` FOREIGN KEY (`complex_id`) REFERENCES `complexes` (`id`) ON DELETE RESTRICT',
  'SELECT 1 AS _skip'
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;


-- ─── 8. evaluation_settings — rebuild (MariaDB-safe, no DROP CHECK) ─────────

SET @eval_exists := (
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'evaluation_settings'
);

SET @eval_has_complex := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'evaluation_settings'
    AND column_name = 'complex_id'
);

-- 8a. Already migrated → skip rebuild
SET @sql := IF(
  @eval_exists > 0 AND @eval_has_complex > 0,
  'SELECT 1 AS _eval_already_migrated',
  'SELECT 1 AS _skip'
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

-- 8b. Rebuild table: copy data, drop old (removes CHECK + old PK), rename
SET @sql := IF(
  @eval_exists > 0 AND @eval_has_complex = 0,
  'CREATE TABLE `evaluation_settings_mt` (
    `complex_id` INT UNSIGNED NOT NULL,
    `hifz_max_score` INT NOT NULL DEFAULT 45,
    `review_max_score` INT NOT NULL DEFAULT 50,
    `error_deduction` INT NOT NULL DEFAULT 5,
    `warning_deduction` INT NOT NULL DEFAULT 2,
    `review_error_deduction` INT NOT NULL DEFAULT 2,
    `review_warning_deduction` INT NOT NULL DEFAULT 1,
    `hifz_max_errors` INT NOT NULL DEFAULT 3,
    `hifz_max_warnings` INT NOT NULL DEFAULT 5,
    `review_max_errors_per_segment` INT NOT NULL DEFAULT 3,
    `review_max_warnings_per_segment` INT NOT NULL DEFAULT 5,
    `pass_percent` INT NOT NULL DEFAULT 80,
    `max_minutes_per_face` DECIMAL(5,2) NOT NULL DEFAULT 2.00,
    `review_segments_under_10` INT NOT NULL DEFAULT 3,
    `review_segments_10_to_20` INT NOT NULL DEFAULT 4,
    `review_segments_over_20` INT NOT NULL DEFAULT 5,
    `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`complex_id`),
    CONSTRAINT `fk_eval_complex`
      FOREIGN KEY (`complex_id`) REFERENCES `complexes` (`id`) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT 1 AS _skip'
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @sql := IF(
  @eval_exists > 0 AND @eval_has_complex = 0,
  'INSERT INTO `evaluation_settings_mt` (
    `complex_id`, `hifz_max_score`, `review_max_score`, `error_deduction`, `warning_deduction`,
    `review_error_deduction`, `review_warning_deduction`, `hifz_max_errors`, `hifz_max_warnings`,
    `review_max_errors_per_segment`, `review_max_warnings_per_segment`, `pass_percent`,
    `max_minutes_per_face`, `review_segments_under_10`, `review_segments_10_to_20`,
    `review_segments_over_20`, `updated_at`
  )
  SELECT
    1, `hifz_max_score`, `review_max_score`, `error_deduction`, `warning_deduction`,
    `review_error_deduction`, `review_warning_deduction`, `hifz_max_errors`, `hifz_max_warnings`,
    `review_max_errors_per_segment`, `review_max_warnings_per_segment`, `pass_percent`,
    `max_minutes_per_face`, `review_segments_under_10`, `review_segments_10_to_20`,
    `review_segments_over_20`, `updated_at`
  FROM `evaluation_settings`
  LIMIT 1',
  'SELECT 1 AS _skip'
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @sql := IF(
  @eval_exists > 0 AND @eval_has_complex = 0,
  'DROP TABLE `evaluation_settings`',
  'SELECT 1 AS _skip'
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @sql := IF(
  @eval_exists > 0 AND @eval_has_complex = 0,
  'RENAME TABLE `evaluation_settings_mt` TO `evaluation_settings`',
  'SELECT 1 AS _skip'
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

-- Ensure default row for complex 1 (only if table exists)
SET @eval_final := (
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'evaluation_settings'
);

SET @sql := IF(
  @eval_final > 0,
  'INSERT INTO `evaluation_settings` (`complex_id`)
   SELECT 1
   WHERE NOT EXISTS (SELECT 1 FROM `evaluation_settings` WHERE `complex_id` = 1)',
  'SELECT 1 AS _skip'
);
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;


-- ─── Done ───────────────────────────────────────────────────────────────────

SELECT 'migrate-multi-tenant completed' AS status;
