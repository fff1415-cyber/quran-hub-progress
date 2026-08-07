-- Fix MariaDB errno 4025 (CONSTRAINT `app_state.value` failed) on shared hosting.
-- Optional if app_state_json_encode is used everywhere; safe to run anyway.
ALTER TABLE `app_state` MODIFY COLUMN `value` LONGTEXT NOT NULL;
