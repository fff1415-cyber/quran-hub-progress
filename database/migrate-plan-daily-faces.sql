/*
  Daily face quotas on plans + assignments — run once after migrate-education-plans.sql
  Database: u112851217_msht_io
  Note: PHP also auto-adds these columns via plans_ensure_daily_faces_columns()
*/

ALTER TABLE `education_plans`
  ADD COLUMN `daily_hifz_faces` TINYINT UNSIGNED NOT NULL DEFAULT 2 AFTER `segment_count`,
  ADD COLUMN `daily_rabt_faces` TINYINT UNSIGNED NOT NULL DEFAULT 2 AFTER `daily_hifz_faces`,
  ADD COLUMN `daily_muraja_faces` TINYINT UNSIGNED NOT NULL DEFAULT 2 AFTER `daily_rabt_faces`,
  ADD COLUMN `faces_per_half` TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER `daily_muraja_faces`,
  ADD COLUMN `faces_per_one` TINYINT UNSIGNED NOT NULL DEFAULT 2 AFTER `faces_per_half`,
  ADD COLUMN `faces_per_two` TINYINT UNSIGNED NOT NULL DEFAULT 4 AFTER `faces_per_one`;

ALTER TABLE `student_plan_assignments`
  ADD COLUMN `daily_hifz_faces` TINYINT UNSIGNED NOT NULL DEFAULT 2 AFTER `start_muraja_segment`,
  ADD COLUMN `daily_rabt_faces` TINYINT UNSIGNED NOT NULL DEFAULT 2 AFTER `daily_hifz_faces`,
  ADD COLUMN `daily_muraja_faces` TINYINT UNSIGNED NOT NULL DEFAULT 2 AFTER `daily_rabt_faces`,
  ADD COLUMN `faces_per_half` TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER `daily_muraja_faces`,
  ADD COLUMN `faces_per_one` TINYINT UNSIGNED NOT NULL DEFAULT 2 AFTER `faces_per_half`,
  ADD COLUMN `faces_per_two` TINYINT UNSIGNED NOT NULL DEFAULT 4 AFTER `faces_per_one`;
