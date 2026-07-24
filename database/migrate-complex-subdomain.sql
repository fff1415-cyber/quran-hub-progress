/*
  Add subdomain column to complexes for multi-tenant routing (m1.example.com).

  Run once in phpMyAdmin after migrate-multi-tenant.sql.
  Safe to re-run (IF NOT EXISTS / idempotent updates).
*/

ALTER TABLE `complexes`
  ADD COLUMN IF NOT EXISTS `subdomain` VARCHAR(50) NULL DEFAULT NULL AFTER `name`;

UPDATE `complexes`
SET `subdomain` = 'm1'
WHERE `id` = 1 AND (`subdomain` IS NULL OR TRIM(`subdomain`) = '');

UPDATE `complexes`
SET `subdomain` = CONCAT('m', `id`)
WHERE (`subdomain` IS NULL OR TRIM(`subdomain`) = '') AND `id` > 1;

ALTER TABLE `complexes`
  MODIFY COLUMN `subdomain` VARCHAR(50) NOT NULL;

ALTER TABLE `complexes`
  ADD UNIQUE KEY IF NOT EXISTS `uk_complexes_subdomain` (`subdomain`);

SELECT 'migrate-complex-subdomain completed' AS status;
