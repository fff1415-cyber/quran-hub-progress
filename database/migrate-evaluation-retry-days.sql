/*
  Add retry_delay_days to evaluation_settings — run once in phpMyAdmin
*/

ALTER TABLE `evaluation_settings`
  ADD COLUMN IF NOT EXISTS `retry_delay_days` INT NOT NULL DEFAULT 2
  COMMENT 'أيام الانتظار قبل إعادة الاختبار بعد الرسوب'
  AFTER `review_segments_over_20`;

UPDATE `evaluation_settings` SET `retry_delay_days` = 2 WHERE `id` = 1 AND (`retry_delay_days` IS NULL OR `retry_delay_days` < 1);
