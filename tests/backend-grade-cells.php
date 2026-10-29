<?php
declare(strict_types=1);
require __DIR__.'/backend-sard-regression.php';
require __DIR__.'/../api/routes/kiosk.php';
require __DIR__.'/backend-grade-cells-cases.php';
$pdo=seed();runGradeCellCases($pdo);
$before=gradeFixtureStore($pdo);
$pdo->exec("CREATE TRIGGER fail_cell_meta BEFORE INSERT ON app_state WHEN NEW.`key`='__qhp_grade_cell_versions_v1' AND NEW.value LIKE '%grade-op-partial%' BEGIN SELECT RAISE(ABORT,'fixture metadata failure'); END");
$op=gradeFixtureOp($pdo,['S','1','days','sun','rabt'],['present'=>true,'value'=>'fail'],'grade-op-partial');gradeFixtureFailure(fn()=>gradeFixtureSave($op),500,'failed revision persistence is not reported as a saved grade');check(gradeFixtureStore($pdo)===$before,'grade value rolls back when revision persistence fails');
