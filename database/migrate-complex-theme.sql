/*
  Complex branding theme key — run once in phpMyAdmin.
*/

ALTER TABLE `complexes`
  ADD COLUMN IF NOT EXISTS `theme_key` VARCHAR(30) NOT NULL DEFAULT 'navy' AFTER `primary_color`;

UPDATE `complexes`
SET `theme_key` = 'beige'
WHERE `id` = 1 AND (`theme_key` IS NULL OR TRIM(`theme_key`) = '' OR `theme_key` = 'navy')
  AND `primary_color` = '#C9A227';

SELECT 'migrate-complex-theme completed' AS status;
