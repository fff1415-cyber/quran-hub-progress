/*
  Extended student fields: المستوى (institute_level), رقم المرحلة, جوال الطالب
  PHP also auto-adds via students_ensure_extended_columns()
*/

ALTER TABLE `students`
  ADD COLUMN `student_phone` VARCHAR(30) NOT NULL DEFAULT '' AFTER `parent_phone`,
  ADD COLUMN `institute_level` VARCHAR(50) NULL DEFAULT NULL AFTER `level_type`,
  ADD COLUMN `phase_number` INT UNSIGNED NULL DEFAULT NULL AFTER `institute_level`;
