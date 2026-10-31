<?php
declare(strict_types=1);
require __DIR__.'/backend-sard-regression.php';
require __DIR__.'/continuity-calendar-cases.php';
$pdo=seed();app_state_upsert($pdo,'grades',['S'=>[1=>['days'=>['sun'=>['hifz'=>'one','unknown'=>null,'compensationFaces'=>0]]]]],1);app_state_upsert($pdo,'sard_history',[['id'=>'fixture-attempt','percent'=>0]],1);continuityCalendarCases($pdo);
