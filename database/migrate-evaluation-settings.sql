/*
  Sard & review evaluation settings (singleton row) — run after schema.sql
  Database: u112851217_msht_io
*/

CREATE TABLE IF NOT EXISTS `evaluation_settings` (
  `id` TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `hifz_max_score` INT NOT NULL DEFAULT 45 COMMENT 'الدرجة الكلية لاختبار الحفظ',
  `review_max_score` INT NOT NULL DEFAULT 50 COMMENT 'الدرجة الكلية لاختبار المراجعة',
  `error_deduction` INT NOT NULL DEFAULT 5 COMMENT 'خصم كل خطأ (حفظ)',
  `warning_deduction` INT NOT NULL DEFAULT 2 COMMENT 'خصم كل تنبيه (حفظ)',
  `review_error_deduction` INT NOT NULL DEFAULT 2 COMMENT 'خصم كل خطأ (مراجعة)',
  `review_warning_deduction` INT NOT NULL DEFAULT 1 COMMENT 'خصم كل تنبيه (مراجعة)',
  `hifz_max_errors` INT NOT NULL DEFAULT 3 COMMENT 'أقصى أخطاء حفظ قبل الرسوب',
  `hifz_max_warnings` INT NOT NULL DEFAULT 5 COMMENT 'أقصى تنبيهات حفظ',
  `review_max_errors_per_segment` INT NOT NULL DEFAULT 3 COMMENT 'أقصى أخطاء لكل مقطع مراجعة',
  `review_max_warnings_per_segment` INT NOT NULL DEFAULT 5 COMMENT 'أقصى تنبيهات لكل مقطع',
  `pass_percent` INT NOT NULL DEFAULT 80 COMMENT 'نسبة الاجتياز',
  `max_minutes_per_face` DECIMAL(5,2) NOT NULL DEFAULT 2.00 COMMENT 'دقائق لكل وجه — الوقت = أوجه × هذا الرقم',
  `review_segments_under_10` INT NOT NULL DEFAULT 3 COMMENT 'مقاطع مراجعة: حفظ أقل من 10 أجزاء',
  `review_segments_10_to_20` INT NOT NULL DEFAULT 4 COMMENT 'مقاطع مراجعة: من 10 إلى 20 جزء',
  `review_segments_over_20` INT NOT NULL DEFAULT 5 COMMENT 'مقاطع مراجعة: أكثر من 20 جزء',
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `chk_eval_singleton` CHECK (`id` = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `evaluation_settings` (`id`) VALUES (1)
ON DUPLICATE KEY UPDATE `id` = `id`;
