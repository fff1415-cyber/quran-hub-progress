/*
  Platform admin — add is_active flag to complexes (soft deactivate cancelled contracts).
  Run once in phpMyAdmin on u112851217_msht_io.
  If column already exists, ignore the error.
*/

ALTER TABLE `complexes`
  ADD COLUMN `is_active` TINYINT(1) NOT NULL DEFAULT 1
  AFTER `contact_phone`;

UPDATE `complexes` SET `is_active` = 1;
