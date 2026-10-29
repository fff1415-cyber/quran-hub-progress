<?php
declare(strict_types=1);
require __DIR__.'/backend-sard-regression.php';
require __DIR__.'/assignment-quota-cases.php';
$pdo=seed();quotaCases($pdo,'current');
$pdo->exec("UPDATE student_plan_assignments SET daily_hifz_faces=9 WHERE id='quota-current'; CREATE TRIGGER reject_quota BEFORE UPDATE ON student_plan_assignments WHEN NEW.id='quota-current' BEGIN SELECT RAISE(ABORT,'fixture quota failure'); END");
$before=$pdo->query('SELECT * FROM student_plan_assignments ORDER BY id')->fetchAll();
quotaFailure(fn()=>handle_patch_assignment_quotas(),'fixture quota failure');
check($pdo->query('SELECT * FROM student_plan_assignments ORDER BY id')->fetchAll()===$before,'failed quota write rolls back and reports the actual error');
