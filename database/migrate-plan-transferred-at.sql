/*
  Plan assignment transfer timestamp — run after migrate-education-plans.sql
*/

ALTER TABLE `student_plan_assignments`
  ADD COLUMN `transferred_at` TIMESTAMP NULL DEFAULT NULL AFTER `frozen_at`;
