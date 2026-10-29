<?php
declare(strict_types=1);
require __DIR__.'/backend-independent-mysql.php';
require __DIR__.'/../api/routes/kiosk.php';
require __DIR__.'/backend-grade-cells-cases.php';
$GLOBALS['auth']=['role'=>'teacher','complexId'=>1,'name'=>'fixture'];runGradeCellCases($pdo);
$pdo->exec('UPDATE semesters SET is_active=CASE WHEN id=1 THEN 1 ELSE 0 END');
$first=gradeFixtureOp($pdo,['S','1','days','sun','hifz'],['present'=>true,'value'=>'two'],'grade-op-fork-hifz');
$second=gradeFixtureOp($pdo,['S','1','days','sun','rabt'],['present'=>true,'value'=>'fail'],'grade-op-fork-rabt');
$children=[];foreach([$first,$second] as $op){$pid=pcntl_fork();if($pid===0){try{$GLOBALS['pdo']=connectFixture();gradeFixtureSave($op);exit(0);}catch(Throwable){exit(1);}}if($pid===-1)throw new RuntimeException('fork unavailable');$children[]=$pid;}
foreach($children as $pid){pcntl_waitpid($pid,$status);check(pcntl_wexitstatus($status)===0,'real concurrent grade cells both commit');}
$GLOBALS['pdo']=$pdo=connectFixture();check(gradeFixtureStore($pdo)['S'][1]['days']['sun']['hifz']==='two'&&gradeFixtureStore($pdo)['S'][1]['days']['sun']['rabt']==='fail','real InnoDB row locks retain both concurrent changes');
$before=gradeFixtureStore($pdo);$pdo->exec("ALTER TABLE app_state ADD CONSTRAINT fixture_reject_cell_meta CHECK(value NOT LIKE '%grade-op-partial%')");
$op=gradeFixtureOp($pdo,['S','1','days','sun','hifz'],['present'=>true,'value'=>'one'],'grade-op-partial');gradeFixtureFailure(fn()=>gradeFixtureSave($op),500,'real metadata constraint failure is surfaced');check(gradeFixtureStore($pdo)===$before,'real transaction rolls back grade and metadata together');
