-- Optional extra assistants per halaqa + per-assistant student assignment.
-- Safe to run multiple times on Hostinger phpMyAdmin.

ALTER TABLE `halaqat`
  ADD COLUMN IF NOT EXISTS `extra_assistants` JSON NULL DEFAULT NULL
  AFTER `assistant_code`;

ALTER TABLE `students`
  ADD COLUMN IF NOT EXISTS `assigned_assistant_code` VARCHAR(50) NULL DEFAULT NULL
  AFTER `assigned_to`;
