/*
  Extend student plan assignments — run once after migrate-education-plans.sql
  Database: u112851217_msht_io
*/

ALTER TABLE `student_plan_assignments`
  ADD COLUMN `plan_start_date` DATE NULL DEFAULT NULL AFTER `start_segment_index`,
  ADD COLUMN `start_muraja_segment` INT NULL DEFAULT NULL AFTER `plan_start_date`;
