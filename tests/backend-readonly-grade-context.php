<?php
declare(strict_types=1);
require __DIR__.'/backend-sard-regression.php';
$pdo=seed();$GLOBALS['auth']=['role'=>'student','studentId'=>'student-1','complexId'=>1];
$pdo->exec('CREATE TABLE semesters(id INTEGER PRIMARY KEY,complex_id INTEGER,is_active INTEGER); INSERT INTO semesters VALUES(1,1,1),(2,1,0),(3,2,1)');
$grades=['student-1'=>[1=>['days'=>['sun'=>['hifz'=>'one','compensationFaces'=>0,'unknown'=>null]]]]];app_state_upsert($pdo,'grades',$grades,1);
$tables=$pdo->query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")->fetchAll();$raw=$pdo->query("SELECT value FROM app_state WHERE `key`='grades'")->fetchColumn();
$_GET=['key'=>'grades'];$pdo->exec('PRAGMA query_only=ON');handle_list_app_state();$pdo->exec('PRAGMA query_only=OFF');
check($GLOBALS['response'][0]['value']===$grades&&$GLOBALS['response'][0]['calendar_context']===['known'=>true,'active_semester_id'=>'1'],'grade values and read-time calendar are returned without rewriting or attributing data');
check($pdo->query("SELECT value FROM app_state WHERE `key`='grades'")->fetchColumn()===$raw&&$pdo->query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")->fetchAll()===$tables,'read-only polling creates neither records nor tables');
$GLOBALS['auth']['complexId']=2;$pdo->exec('PRAGMA query_only=ON');handle_list_app_state();$pdo->exec('PRAGMA query_only=OFF');
check($GLOBALS['response'][0]['context_complex_id']===2&&$GLOBALS['response'][0]['calendar_context']['active_semester_id']==='3'&&(array)$GLOBALS['response'][0]['value']===[],'empty store response keeps the existing complex filter and its own calendar');
$GLOBALS['auth']['complexId']=1;$pdo->exec('UPDATE semesters SET is_active=1 WHERE id=2');handle_list_app_state();check($GLOBALS['response'][0]['calendar_context']['known']===false,'multiple active calendars are not guessed');
$pdo->exec('UPDATE semesters SET is_active=0 WHERE complex_id=1');handle_list_app_state();check($GLOBALS['response'][0]['calendar_context']===['known'=>true,'active_semester_id'=>null],'no active calendar is explicit rather than invented');
