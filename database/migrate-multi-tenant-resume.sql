/*
  Resume multi-tenant migration if the full script stopped at halaqat DROP PRIMARY KEY.

  Your DB likely already has:
  - table `complexes` with id=1
  - column `halaqat.complex_id` filled with 1

  Run this file only — then verify with migrate-multi-tenant.sql sections 3–8
  OR run the full migrate-multi-tenant.sql again (it skips completed steps).
*/

SET @OLD_FK_CHECKS = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;

UPDATE `halaqat` SET `complex_id` = 1 WHERE `complex_id` IS NULL;

ALTER TABLE `halaqat`
  MODIFY COLUMN `complex_id` INT UNSIGNED NOT NULL;

DROP PROCEDURE IF EXISTS `_mt_drop_fks_to_halaqat`;
DELIMITER $$
CREATE PROCEDURE `_mt_drop_fks_to_halaqat`()
BEGIN
  DECLARE done INT DEFAULT 0;
  DECLARE tbl VARCHAR(64);
  DECLARE cname VARCHAR(64);
  DECLARE cur CURSOR FOR
    SELECT DISTINCT kcu.TABLE_NAME, kcu.CONSTRAINT_NAME
    FROM information_schema.KEY_COLUMN_USAGE kcu
    JOIN information_schema.TABLE_CONSTRAINTS tc
      ON tc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
     AND tc.TABLE_NAME = kcu.TABLE_NAME
     AND tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
     AND tc.CONSTRAINT_TYPE = 'FOREIGN KEY'
    WHERE kcu.CONSTRAINT_SCHEMA = DATABASE()
      AND kcu.REFERENCED_TABLE_NAME = 'halaqat';
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;
  OPEN cur;
  read_loop: LOOP
    FETCH cur INTO tbl, cname;
    IF done THEN LEAVE read_loop; END IF;
    SET @drop = CONCAT('ALTER TABLE `', tbl, '` DROP FOREIGN KEY `', cname, '`');
    PREPARE _s FROM @drop; EXECUTE _s; DEALLOCATE PREPARE _s;
  END LOOP;
  CLOSE cur;
END$$
DELIMITER ;
CALL `_mt_drop_fks_to_halaqat`();
DROP PROCEDURE IF EXISTS `_mt_drop_fks_to_halaqat`;

ALTER TABLE `halaqat` DROP FOREIGN KEY IF EXISTS `fk_halaqat_complex`;

ALTER TABLE `halaqat` DROP PRIMARY KEY;

ALTER TABLE `halaqat`
  ADD PRIMARY KEY (`complex_id`, `id`);

ALTER TABLE `halaqat`
  ADD CONSTRAINT `fk_halaqat_complex`
    FOREIGN KEY (`complex_id`) REFERENCES `complexes` (`id`) ON DELETE RESTRICT;

SET FOREIGN_KEY_CHECKS = @OLD_FK_CHECKS;

SELECT 'halaqat PK migrated — now run migrate-multi-tenant.sql from section 3' AS status;
