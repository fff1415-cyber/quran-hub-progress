/*
  Drop legacy global unique on role_accounts.code if multi-tenant migration missed it.
  After this, the same manager code may exist in different complexes (uk_complex_code).

  Run once in phpMyAdmin if registration says "رقم عضوية المدير مستخدم" for new codes.
*/

ALTER TABLE `role_accounts` DROP INDEX IF EXISTS `uk_code`;

SELECT 'migrate-drop-legacy-uk-code completed' AS status;
