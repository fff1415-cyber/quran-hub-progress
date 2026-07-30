/*
  Optional contact phone on complexes — run once in phpMyAdmin.
*/

ALTER TABLE `complexes`
  ADD COLUMN IF NOT EXISTS `contact_phone` VARCHAR(30) NULL DEFAULT NULL AFTER `primary_color`;

SELECT 'migrate-complex-contact completed' AS status;
