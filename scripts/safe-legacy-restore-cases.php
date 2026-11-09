<?php
function verify_teacher_program_history(PDO $pdo): void {
    $previousAuth = $GLOBALS['testAuth'];
    $pdo->exec('SET TRANSACTION READ ONLY');
    $pdo->beginTransaction();
    try {
        $complex = (int)$pdo->query("SELECT id FROM complexes WHERE subdomain='m6'")->fetchColumn();
        if (!$complex) throw new RuntimeException('m6_missing_in_restore');
        $statuses = [];
        foreach (['teacher', 'assistant'] as $role) {
            $GLOBALS['testAuth'] = ['role'=>$role,'complexId'=>$complex,'name'=>'Isolated program fixture'];
            $response = probe('handle_list_app_state',['key'=>'scientific_grades']);
            $statuses[$role] = $response->getCode();
            if ($response->getCode() !== 200 || empty($response->body[0]['revision'])) {
                throw new RuntimeException('scientific_history_not_readable');
            }
            $weekCounts = [];
            foreach ($response->body[0]['value']['data'] ?? [] as $halaqa) {
                foreach ($halaqa as $student) {
                    foreach ($student as $week => $days) {
                        foreach ($days as $marks) {
                            foreach ($marks as $mark) {
                                if ($mark !== '' && $mark !== null) $weekCounts[$week] = ($weekCounts[$week] ?? 0) + 1;
                            }
                        }
                    }
                }
            }
            if (empty($weekCounts[1]) || empty($weekCounts[10])) throw new RuntimeException('historical_weeks_missing');
        }
        ksort($weekCounts);
        echo json_encode(['m6_scientific_history'=>$weekCounts,'reads'=>$statuses,'database'=>'isolated_test'],JSON_THROW_ON_ERROR).PHP_EOL;
        if (getenv('QHP_PROGRAM_DISPLAY_ACCEPTANCE') === '1') {
            $calendar = probe('handle_get_active_semester')->body;
            $programs = probe('handle_list_app_state',['key'=>'halaqa_programs'])->body[0]['value'] ?? [];
            $grades = probe('handle_list_app_state',['key'=>'halaqa_program_grades'])->body[0]['value'] ?? [];
            $students = $pdo->prepare('SELECT id,halaqa_id FROM students WHERE complex_id=?');
            $students->execute([$complex]);
            echo 'QHP_PRIVATE_PROGRAM_FIXTURE '.json_encode([
                'calendar'=>$calendar,'scientific'=>$response->body[0]['value'],
                'programs'=>$programs,'grades'=>$grades,'students'=>$students->fetchAll(),
            ],JSON_THROW_ON_ERROR).PHP_EOL;
        }
    } finally {
        $pdo->rollBack();
        $GLOBALS['testAuth'] = $previousAuth;
    }
}
// Appended to the isolated-restore probe after the read checks. Runs only on
// its verified test PDO; all synthetic changes are in an outer transaction.
function test_safe_legacy_restore(PDO $pdo, int $cid, array $reads): void {
    foreach ($reads as $checks) foreach ($checks as $status) {
        if ($status !== 200) throw new RuntimeException('restored_data_read_failed');
    }
    $grades = grade_body(probe('handle_list_app_state', ['key'=>'grades']));
    $weekly = probe('handle_list_app_state', ['key'=>'weekly_tests'])->body;
    $receiptCount = (int)$pdo->query('SELECT COUNT(*) FROM grade_operation_receipts')->fetchColumn();
    $context = grade_cells_context($pdo,$cid);
    $id = 'rollback-probe-'.bin2hex(random_bytes(8));
    $fields = [[$id,'1','days','sun','attendance'],[$id,'1','days','sun','wajib']];
    $calendar = grade_cells_calendar($pdo,$cid,false);
    $snapshot = grade_cells_store($pdo,$cid,'grades',false);
    $packets = [];
    foreach ($fields as $i=>$path) {
        $packets[] = ['operation_id'=>$id.'-'.$i,'calendar_context'=>$calendar,'changes'=>[[
            'path'=>$path,'base'=>grade_cells_at($snapshot,$path),'stamp'=>grade_cells_stamp($pdo,$context,'grades',$path,false),
            'next'=>['present'=>true,'value'=>$i===0?'present':'pass'],
        ]]];
    }
    $write = static fn(array $packet)=>probe('handle_set_app_state',[],['key'=>'grades','grade_write_protocol'=>1,'value'=>$packet]);
    $pdo->beginTransaction();
    $GLOBALS['testAuth']['role'] = 'teacher';
    $a = $write($packets[0]);
    $GLOBALS['testAuth']['role'] = 'assistant';
    $b = $write($packets[1]);
    $replay = $write($packets[0]);
    $both = grade_body(probe('handle_list_app_state',['key'=>'grades']));
    $sample = $both[$id][1]['days']['sun'] ?? null;
    unset($both[$id]);
    if ($pdo->inTransaction()) $pdo->rollBack();
    if ($a->getCode()!==200 || $b->getCode()!==200 || ($replay->body['replayed'] ?? false)!==true ||
        $sample!==['attendance'=>'present','wajib'=>'pass'] || $both!==$grades) throw new RuntimeException('isolated_atomic_write_failed');

    $stale = $packets[0];
    $stale['operation_id'] .= '-stale';
    $stale['calendar_context']['active_semester_id'] = $id;
    $pdo->beginTransaction();
    $staleStatus = $write($stale)->getCode();
    if ($pdo->inTransaction()) $pdo->rollBack();
    $bulk = [];
    foreach (['grades','weekly_tests'] as $key) $bulk[$key] = probe('handle_set_app_state',[],['key'=>$key,'value'=>[]])->getCode();
    if ($staleStatus!==409 || $bulk!==['grades'=>409,'weekly_tests'=>409] ||
        grade_body(probe('handle_list_app_state',['key'=>'grades']))!==$grades ||
        probe('handle_list_app_state',['key'=>'weekly_tests'])->body!==$weekly ||
        (int)$pdo->query('SELECT COUNT(*) FROM grade_operation_receipts')->fetchColumn()!==$receiptCount) {
        throw new RuntimeException('restore_preservation_failed');
    }
    $GLOBALS['stage'] = 'tarbawi_preservation';
    $tarbawiBefore = probe('handle_list_app_state',['key'=>'tarbawi_program'])->body;
    $semester = $calendar['active_semester_id'];
    $tarbawi = static fn(array $packet) => isset($packet['tarbawi_write_protocol'])
        ? probe('handle_write_tarbawi_record',[],$packet)
        : probe('handle_set_app_state',[],['key'=>'tarbawi_program']+$packet);
    $settings = ['semesterId'=>$semester,'paragraphTypes'=>[],'weeklyRequiredCount'=>2,'halaqaSpans'=>[]];
    $programPlan = ['semesterId'=>$semester,'halaqaId'=>2000000000,'status'=>'draft','items'=>[['id'=>$id]]];
    $edit = static fn(string $section, string $sem, ?array $base, array $next) =>
        ['tarbawi_write_protocol'=>1,'value'=>['semesterId'=>$sem,'section'=>$section,'base'=>$base,'next'=>$next]];
    $pdo->beginTransaction();
    $planWrite = $tarbawi($edit('plans',$semester,null,$programPlan))->getCode();
    $withPlan = probe('handle_list_app_state',['key'=>'tarbawi_program'])->body;
    $oldSettings = $withPlan[0]['value']['settingsBySemester'][$semester] ?? null;
    if ($oldSettings === $settings) $settings['weeklyRequiredCount']++;
    $settingsWrite = $tarbawi($edit('settingsBySemester',$semester,$oldSettings,$settings))->getCode();
    $bothRecords = probe('handle_list_app_state',['key'=>'tarbawi_program'])->body;
    $tarbawiStatuses = [
        $tarbawi(['value'=>['settingsBySemester'=>[],'plans'=>[]]])->getCode(),
        $tarbawi($edit('plans',$id,null,array_replace($programPlan,['semesterId'=>$id,'items'=>[]])))->getCode(),
        $tarbawi($edit('settingsBySemester',$semester,$oldSettings,array_replace($settings,['weeklyRequiredCount'=>10])))->getCode(),
    ];
    $unchanged = probe('handle_list_app_state',['key'=>'tarbawi_program'])->body === $bothRecords;
    $pdo->rollBack();
    if ($planWrite!==200 || $settingsWrite!==200 || $tarbawiStatuses!==[409,409,409] || !$unchanged ||
        probe('handle_list_app_state',['key'=>'tarbawi_program'])->body!==$tarbawiBefore) {
        throw new RuntimeException('tarbawi_preservation_failed');
    }
    $GLOBALS['stage'] = 'login_and_transitions';
    $more = test_safe_legacy_login_and_transitions($pdo,$cid,$id);
    $GLOBALS['stage'] = 'scientific_config_and_scores';
    $scientific = test_scientific_config_and_scores($pdo,$cid,$id);
    $GLOBALS['stage'] = 'legacy_plan_atomic_save';
    $plan = test_legacy_plan_atomic_save($pdo,$cid,$id);
    if (getenv('QHP_PERCENTAGE_SAMPLE') === '1') test_percentage_sample($pdo);
    echo json_encode(['database'=>'isolated_test','reads'=>$reads,'teacher_and_assistant_write'=>[200,200],
        'receipt_replayed'=>true,'stale_status'=>$staleStatus,'empty_replacements'=>$bulk,
        'tarbawi_rejections'=>$tarbawiStatuses,'tarbawi_preserved'=>true,
        'historical_values_unchanged'=>true,'synthetic_changes_reverted'=>true,'production_writes'=>false]+$more+$scientific+$plan,JSON_THROW_ON_ERROR).PHP_EOL;
}

/** Replay one real restored holiday week without exporting names or identifiers. */
function test_percentage_sample(PDO $pdo): void {
    $pdo->exec('SET TRANSACTION READ ONLY');
    $pdo->beginTransaction();
    try {
        $cid=(int)$pdo->query("SELECT id FROM complexes WHERE subdomain='m6'")->fetchColumn();
        $q=$pdo->prepare("SELECT start_date,weeks_count,working_days,excluded_dates FROM semesters WHERE complex_id=? AND is_active=1");
        $q->execute([$cid]); $semester=$q->fetch();
        if (!$semester) throw new RuntimeException('percentage_sample_semester_missing');
        $working=json_decode($semester['working_days'],true,512,JSON_THROW_ON_ERROR);
        $holidays=array_map(static fn($item)=>is_array($item)?$item['date']:$item,json_decode($semester['excluded_dates'],true,512,JSON_THROW_ON_ERROR));
        $week=5;
        $start=new DateTimeImmutable($semester['start_date']);
        $sunday=$start->modify('-'.$start->format('w').' days')->modify('+'.(($week-1)*7).' days');
        $keys=['sun','mon','tue','wed','thu','fri','sat'];
        $eligible=[];
        foreach ($keys as $offset=>$day) {
            $date=$sunday->modify('+'.$offset.' days')->format('Y-m-d');
            if ($date>=$semester['start_date'] && in_array($offset,$working,true) && !in_array($date,$holidays,true)) $eligible[]=$day;
        }
        if (!$eligible || count($eligible)===5) throw new RuntimeException('percentage_sample_holiday_missing');
        $store=grade_cells_store($pdo,$cid,'grades',false);
        $q=$pdo->prepare('SELECT s.id FROM students s JOIN halaqat h ON h.id=s.halaqa_id AND h.complex_id=s.complex_id
            WHERE s.complex_id=? AND s.level_type=\'gold\' AND h.is_talqeen=0');
        $q->execute([$cid]);
        foreach ($q->fetchAll(PDO::FETCH_COLUMN) as $id) {
            $record=$store->{$id}->{$week}??null;
            if (!$record) continue;
            $earned=0; $days=[];
            foreach ($keys as $day) {
                $entry=$record->days->{$day}??null;
                if (!$entry) continue;
                $clean=array_intersect_key((array)$entry,array_flip(['attendance','hifz','rabt','muraja','wajib','compensationFaces']));
                $days[$day]=$clean;
                if (!in_array($day,$eligible,true)) continue;
                $earned+=(['present'=>15,'late'=>10,'excused'=>5][$entry->attendance??'']??0);
                $earned+=in_array($entry->hifz??'', ['half','one','two'],true)?20:0;
                foreach (['rabt','muraja'] as $task) $earned+=(['pass'=>15,'fail'=>5][$entry->{$task}??'']??0);
            }
            $faces=array_sum(array_map(static fn($day)=>(float)($days[$day]['compensationFaces']??0),$eligible));
            if ($earned===0 || $faces!==0.0 || (float)($record->compensationFaces??0)!==0.0) continue;
            echo 'PERCENTAGE_SAMPLE '.json_encode([
                'semester'=>['start_date'=>$semester['start_date'],'weeks_count'=>(int)$semester['weeks_count'],
                    'working_days'=>$working,'excluded_dates'=>array_map(static fn($date)=>['date'=>$date],$holidays)],
                'end'=>$sunday->modify('+6 days')->format('Y-m-d'),'week'=>$week,'days'=>$days,
                'expected'=>(int)round(100*$earned/(65*count($eligible))),
            ],JSON_THROW_ON_ERROR).PHP_EOL;
            return;
        }
        throw new RuntimeException('percentage_sample_not_found');
    } finally { $pdo->rollBack(); }
}

function test_legacy_plan_atomic_save(PDO $pdo,int $cid,string $student): array {
    $q=$pdo->prepare("SELECT ep.id FROM education_plans ep JOIN plan_segments ps ON ps.plan_id=ep.id WHERE ep.complex_id=? AND ep.track='gold' GROUP BY ep.id HAVING COUNT(*)>=3 LIMIT 1");
    $q->execute([$cid]);$plan=$q->fetchColumn();
    $q=$pdo->prepare('SELECT segment_index FROM plan_segments WHERE plan_id=? ORDER BY segment_index LIMIT 3');
    $q->execute([$plan]);$segments=array_map('intval',$q->fetchAll(PDO::FETCH_COLUMN));
    $q=$pdo->prepare('SELECT id FROM halaqat WHERE complex_id=? LIMIT 1');
    $q->execute([$cid]);$group=(int)$q->fetchColumn();
    $q=$pdo->prepare('SELECT start_date,working_days,excluded_dates FROM semesters WHERE complex_id=? AND is_active=1');
    $q->execute([$cid]);$semester=$q->fetch();
    $start=new DateTimeImmutable($semester['start_date']);
    $weekStart=$start->modify('-'.$start->format('w').' days');
    $holidays=array_map(static fn($day)=>is_string($day)?$day:($day['date']??''),json_decode($semester['excluded_dates'],true)??[]);
    $date=$day=null;
    foreach (json_decode($semester['working_days'],true) as $offset) {
        $candidate=$weekStart->modify('+'.(int)$offset.' days')->format('Y-m-d');
        if ($candidate<$semester['start_date'] || in_array($candidate,$holidays,true)) continue;
        $date=$candidate;$day=['sun','mon','tue','wed','thu','fri','sat'][(int)$offset];break;
    }
    if (!$date || !$group || count($segments)!==3) throw new RuntimeException('plan_regression_fixture_missing');
    $assignment=new_uuid();$legacy=new_uuid();
    $pdo->beginTransaction();
    $pdo->prepare("INSERT INTO students(id,complex_id,name,halaqa_id,national_id) VALUES (?,?,?,?,'')")->execute([$student,$cid,$student,$group]);
    $pdo->prepare('INSERT INTO student_plan_assignments(id,student_id,plan_id,start_segment_index) VALUES (?,?,?,?)')
        ->execute([$assignment,$student,$plan,$segments[0]]);
    $insert=$pdo->prepare("INSERT INTO segment_completions(id,student_id,plan_id,segment_index,task_type,completed_at,recorded_by,assignment_id) VALUES(?,?,?,?,'hifz',?,'Fixture',?)");
    $path=[$student,'1','days',$day,'hifz'];
    $packet=static function(string $value,string $action) use($pdo,$cid,$path,$student,$assignment,$date): array {
        $capture=grade_cells_capture($pdo,$cid,'grades',[$path]);
        return ['operation_id'=>'legacy-plan-fixture-'.bin2hex(random_bytes(8)),'calendar_context'=>$capture['calendar_context'],
            'changes'=>[$capture['cells'][0]+['next'=>['present'=>true,'value'=>$value]]],
            'plan'=>['student_id'=>$student,'expected_assignment_id'=>$assignment,'task_type'=>'hifz','action'=>$action,
                'tap'=>$value==='two'?'two':'one','completed_at'=>$date,'cell_path'=>$path]];
    };
    $write=static function(array $packet,string $role) use($cid,$group): ProbeResponse {
        $GLOBALS['testAuth']=['role'=>$role,'complexId'=>$cid,'halaqaId'=>$group,'name'=>'Fixture'];
        return probe('handle_set_app_state',[],['key'=>'grades','grade_write_protocol'=>1,'value'=>$packet]);
    };
    if (getenv('QHP_DAILY_WITHOUT_SEGMENT')==='1') {
        $rabtPath=[$student,'1','days',$day,'rabt'];
        $makeDaily=static function (string $value,string $action) use ($pdo,$cid,$student,$assignment,$date,$rabtPath): array {
            $capture=grade_cells_capture($pdo,$cid,'grades',[$rabtPath]);
            return ['operation_id'=>'isolated-daily-'.bin2hex(random_bytes(8)), 'calendar_context'=>$capture['calendar_context'],
                'changes'=>[$capture['cells'][0]+['next'=>['present'=>true,'value'=>$value]]],
                'plan'=>['student_id'=>$student,'expected_assignment_id'=>$assignment,'task_type'=>'rabt','action'=>$action,
                    'tap'=>'one','completed_at'=>$date,'cell_path'=>$rabtPath]];
        };
        $daily=$makeDaily('pass','record');
        if ($write($daily,'teacher')->getCode()!==200 || ($write($daily,'assistant')->body['replayed']??false)!==true ||
            (grade_cells_at(grade_cells_store($pdo,$cid,'grades',false),$rabtPath)['value']??null)!=='pass' ||
            $write($makeDaily('','undo'),'assistant')->getCode()!==200) throw new RuntimeException('isolated_daily_mark_without_segment_failed');
        $q=$pdo->prepare('SELECT COUNT(*) FROM segment_completions WHERE student_id=?');
        $q->execute([$student]);
        if ((int)$q->fetchColumn()!==0) throw new RuntimeException('isolated_daily_mark_created_completion');
        echo "PASS: isolated MariaDB daily mark, receipt retry and cancellation with zero invented completions\n";
    }
    $insert->execute([$legacy,$student,$plan,$segments[0],$date,null]);
    try {
        $insert->execute([new_uuid(),$student,$plan,$segments[0],$date,$assignment]);
        throw new RuntimeException('legacy_collision_not_reproduced');
    } catch (PDOException $e) {
        if ((int)($e->errorInfo[1]??0)!==1062) throw $e;
    }
    $read=static function(string $role) use($cid,$group,$student,$path): array {
        $GLOBALS['testAuth']=['role'=>$role,'complexId'=>$cid,'halaqaId'=>$group];
        $grade=probe('handle_list_app_state',['key'=>'grades','grade_protocol'=>'1']);
        $sheet=probe('handle_student_plan_sheet',['student_id'=>$student]);
        if ($grade->getCode()!==200 || $sheet->getCode()!==200) throw new RuntimeException('plan_or_grade_read_failed');
        return [grade_cells_at($grade->body['value'],$path)['value']??null,array_map('intval',array_column($sheet->body['completions'],'segment_index'))];
    };
    $compPath=[$student,'1','days',$day,'compensationFaces'];
    $makeComp=static function (float $faces) use ($pdo,$cid,$compPath,$student,$assignment,$date): array {
        $capture=grade_cells_capture($pdo,$cid,'grades',[$compPath]);
        return ['operation_id'=>'legacy-comp-fixture-'.bin2hex(random_bytes(8)), 'calendar_context'=>$capture['calendar_context'],
            'changes'=>[$capture['cells'][0]+['next'=>['present'=>true,'value'=>$faces]]],
            'plan'=>['student_id'=>$student,'expected_assignment_id'=>$assignment,'task_type'=>'hifz','action'=>'compensation',
                'tap'=>'one','completed_at'=>$date,'cell_path'=>$compPath]];
    };
    $comp=$makeComp(1.0);
    $compReceipt=$write($comp,'teacher');
    $compReplay=$write($comp,'assistant');
    $compSegments=grade_cells_at(grade_cells_store($pdo,$cid,'grades',false),[$student,'1','compensationPlanSegments']);
    if ($compReceipt->getCode()!==200 || ($compReplay->body['replayed']??false)!==true ||
        ($compSegments['value']??null)!==[$segments[1]] || $write($makeComp(0.0),'assistant')->getCode()!==200) {
        throw new RuntimeException('legacy_compensation_atomic_receipt_failed');
    }
    $first=$packet('one','record');
    $receipt=$write($first,'teacher');
    $retry=$write($first,'teacher');
    [$value,$done]=$read('assistant');sort($done);
    if ($receipt->getCode()!==200 || ($receipt->body['operation_id']??null)!==$first['operation_id'] ||
        ($retry->body['replayed']??false)!==true || $value!=='one' || $done!==array_slice($segments,0,2)) {
        throw new RuntimeException('legacy_atomic_receipt_failed');
    }
    if ($write($packet('','undo'),'assistant')->getCode()!==200 || $read('teacher')!==['',[$segments[0]]]) {
        throw new RuntimeException('legacy_atomic_cancel_failed');
    }
    if ($write($packet('two','record'),'teacher')->getCode()!==200) throw new RuntimeException('legacy_atomic_correct_failed');
    [$value,$done]=$read('assistant');sort($done);
    if ($value!=='two' || $done!==$segments) throw new RuntimeException('legacy_atomic_correct_read_failed');
    $linked = [];
    foreach (['rabt'=>'assistant','muraja'=>'teacher'] as $task=>$role) {
        $taskPath = [$student,'1','days',$day,$task];
        $capture=grade_cells_capture($pdo,$cid,'grades',[$taskPath]);
        $request = ['operation_id'=>'linked-'.$task.'-'.bin2hex(random_bytes(8)), 'calendar_context'=>$capture['calendar_context'],
            'changes'=>[$capture['cells'][0]+['next'=>['present'=>true,'value'=>'pass']]],
            'plan'=>['student_id'=>$student,'expected_assignment_id'=>$assignment,'task_type'=>$task,'action'=>'record',
                'tap'=>'one','completed_at'=>$date,'cell_path'=>$taskPath]];
        $written=$write($request,$role);
        $retry=$write($request,$role);
        $q=$pdo->prepare('SELECT COUNT(*) FROM segment_completions WHERE student_id=? AND assignment_id=? AND task_type=?');
        $q->execute([$student,$assignment,$task]);
        if ($written->getCode()!==200 || ($retry->body['replayed']??false)!==true || (int)$q->fetchColumn()!==1) {
            throw new RuntimeException('isolated_'.$task.'_write_failed_'.$written->getCode());
        }
        $linked[$task]=$written->getCode();
    }
    $q=$pdo->prepare('SELECT assignment_id FROM segment_completions WHERE id=?');
    $q->execute([$legacy]);
    if ($q->fetchColumn()!==null) throw new RuntimeException('legacy_completion_changed');
    $pdo->rollBack();
    return ['mysql_duplicate_reproduced'=>1062,'linked_hifz_receipt'=>200,'linked_hifz_retry_once'=>true,
        'linked_hifz_assistant_reads_grade_and_plan'=>true,'linked_hifz_cancel_and_correct'=>true,'legacy_completion_preserved'=>true,
        'linked_rabt_muraja_receipts'=>$linked,'legacy_compensation_receipt_replayed'=>true];
}

function test_scientific_config_and_scores(PDO $pdo,int $cid,string $student): array {
    $GLOBALS['testAuth'] = ['role'=>'teacher','complexId'=>$cid,'halaqaId'=>2000000000];
    $read = static fn()=>probe('handle_list_app_state',['key'=>'scientific_grades'])->body[0];
    $write = static fn(array $payload)=>probe('handle_write_scientific_store',[],$payload)->getCode();
    $before = $read();
    $grades = grade_body(probe('handle_list_app_state',['key'=>'grades']));
    $pdo->beginTransaction();
    $group = 2000000000;
    $config = ['visible'=>true,'fields'=>['attendance'=>false,'hifz'=>true,'rabt'=>true,'muraja'=>true],
        'defaultScores'=>['hifz'=>'11','rabt'=>'7','muraja'=>'5']];
    $edit = static fn(array $state,array $settings)=>$write(['scientific_base'=>$state['revision'],
        'scientific_config'=>['halaqaId'=>$group,'settings'=>$settings]]);
    $enabled = $edit($before,$config);
    $on = $read();
    $off = $config;
    $off['fields']['hifz'] = false;
    $disabled = $edit($on,$off);
    $offRead = $read();
    $stale = $write(['scientific_base'=>$offRead['revision'],'value'=>$on['value']]);
    $reenabled = $edit($offRead,$config);
    $afterConfig = $read();
    $next = $afterConfig['value'];
    $next['data'][$group][$student][1]['sun'] = ['hifz'=>'11','rabt'=>'7','muraja'=>'5'];
    $noPrep = $write(['scientific_base'=>$afterConfig['revision'],'value'=>$next]);
    $prep = grade_cells_store($pdo,$cid,'grades',true);
    $prep->{$student} = (object)['1'=>(object)['days'=>(object)['sun'=>(object)['hifz'=>'one','rabt'=>'fail','muraja'=>'fail']]]];
    app_state_upsert($pdo,'grades',$prep,$cid);
    $failedPrep = $write(['scientific_base'=>$afterConfig['revision'],'value'=>$next]);
    $prep->{$student}->{'1'}->days->sun->rabt = 'pass';
    $prep->{$student}->{'1'}->days->sun->muraja = 'pass';
    app_state_upsert($pdo,'grades',$prep,$cid);
    $earned = $write(['scientific_base'=>$afterConfig['revision'],'value'=>$next]);
    $q = $pdo->prepare('SELECT id FROM halaqat WHERE complex_id=? LIMIT 1');
    $q->execute([$cid]);
    $realGroup = (int)$q->fetchColumn();
    $pdo->prepare("INSERT INTO students(id,complex_id,name,halaqa_id,national_id) VALUES (?,?,?,?,'')")->execute([$student,$cid,$student,$realGroup]);
    $program = $read();
    $projectConfig = $config;
    $projectConfig['fields']['attendance'] = true;
    $projectConfig['defaultScores']['attendance'] = ['present'=>'9'];
    if ($write(['scientific_base'=>$program['revision'],'scientific_config'=>['halaqaId'=>$realGroup,'settings'=>$projectConfig]])!==200) {
        throw new RuntimeException('attendance_config_fixture');
    }
    $mark = static function (string $field,string $value,string $day='mon',string $role='teacher') use ($pdo,$cid,$student,$realGroup): void {
        $path = [$student,'1','days',$day,$field];
        $capture = grade_cells_capture($pdo,$cid,'grades',[$path]);
        $change = $capture['cells'][0]+['next'=>['present'=>true,'value'=>$value]];
        grade_write_request($pdo,$cid,['operation_id'=>'fixture-'.bin2hex(random_bytes(8)),
            'calendar_context'=>$capture['calendar_context'],'changes'=>[$change]],['role'=>$role,'complexId'=>$cid,'halaqaId'=>$realGroup]);
    };
    $mark('attendance','present');
    $present = $read()['value']['data'][$realGroup][$student][1]['mon'];
    $rawDay = (array)(grade_write_snapshot($pdo,$cid)['value']->{$student}->{'1'}->days->mon??[]);
    if ($present !== ['attendance'=>'9'] || $rawDay !== ['attendance'=>'present']) {
        throw new RuntimeException('attendance_awarded_task');
    }
    $mark('hifz','one');
    // Simulate an old automatic result plus a real teacher override on the same day.
    $legacy = grade_cells_store($pdo,$cid,'scientific_grades',true);
    $day = $legacy->data->{$realGroup}->{$student}->{'1'}->mon;
    $day->rabt = '7';
    $day->muraja = '5';
    $legacy->overrides = (object)($legacy->overrides ?? []);
    $legacy->overrides->{$realGroup} = (object)($legacy->overrides->{$realGroup} ?? []);
    $legacy->overrides->{$realGroup}->{$student} = (object)['1'=>(object)['mon'=>(object)['muraja'=>true]]];
    app_state_upsert($pdo,'scientific_grades',$legacy,$cid);
    $mark('attendance','');
    $cleared = $read();
    $day = $cleared['value']['data'][$realGroup][$student][1]['mon'];
    $staleAttendance = $cleared['value'];
    $staleAttendance['data'][$realGroup][$student][1]['mon']['attendance'] = '9';
    if ($day!==['attendance'=>'','hifz'=>'11','rabt'=>'','muraja'=>'5'] ||
        $write(['scientific_base'=>$cleared['revision'],'value'=>$staleAttendance])!==409) {
        throw new RuntimeException('attendance_projection_regression');
    }
    foreach (['attendance'=>'present','hifz'=>'one','rabt'=>'pass','muraja'=>'pass'] as $field=>$value) {
        $mark($field,$value,'tue','teacher');
        if ((grade_write_snapshot($pdo,$cid)['value']->{$student}->{'1'}->days->tue->{$field}??null)!==$value) {
            throw new RuntimeException('registration_not_visible_in_test_database');
        }
        $mark($field,'','tue','assistant');
        if ((grade_write_snapshot($pdo,$cid)['value']->{$student}->{'1'}->days->tue->{$field}??null)!=='') {
            throw new RuntimeException('cancellation_not_visible_in_test_database');
        }
    }
    $pdo->rollBack();
    if ([$enabled,$disabled,$reenabled,$stale,$noPrep,$failedPrep,$earned] !== [200,200,200,409,409,409,200] ||
        $offRead['value']['configs'][$group]['fields']['hifz'] !== false ||
        $afterConfig['value']['configs'][$group]['fields']['hifz'] !== true ||
        ($afterConfig['value']['data'] ?? []) !== ($before['value']['data'] ?? []) ||
        $read()!==$before || grade_body(probe('handle_list_app_state',['key'=>'grades']))!==$grades) {
        throw new RuntimeException('scientific_regression');
    }
    return ['scientific_config_on_off_on'=>[200,200,200], 'stale_settings'=>409,
        'scientific_missing_and_failed_prep'=>[409,409], 'scientific_earned'=>200, 'scientific_history_unchanged'=>true,
        'attendance_only'=>true,'clear_preserves_confirmed_and_manual_scores'=>true,'stale_attendance_rejected'=>409,
        'four_grade_cancellations_persist_in_isolated_database'=>true];
}

function test_safe_legacy_login_and_transitions(PDO $pdo,int $cid,string $fixture): array {
    $q = $pdo->prepare("SELECT code FROM role_accounts WHERE complex_id=? AND role='manager' AND code<>'' LIMIT 1");
    $q->execute([$cid]);
    $manager = $q->fetchColumn();
    $q = $pdo->prepare("SELECT teacher_code,assistant_code FROM halaqat WHERE complex_id=? AND teacher_code<>'' AND assistant_code<>'' LIMIT 1");
    $q->execute([$cid]);
    $codes = $q->fetch();
    $login = [];
    foreach (['manager'=>$manager,'teacher'=>$codes['teacher_code'] ?? null,'assistant'=>$codes['assistant_code'] ?? null] as $role=>$code) {
        if (!$code) throw new RuntimeException('login_fixture_missing');
        $result = probe('handle_login_by_code',[],['code'=>(string)$code,'complexId'=>$cid]);
        $token = verify_token($result->body['token'] ?? null);
        if ($result->getCode()!==200 || ($token['role'] ?? null)!==$role || ($token['complexId'] ?? null)!==$cid) {
            throw new RuntimeException('real_login_handler_failed');
        }
        $login[$role] = 200;
    }
    if (probe('handle_login_by_code',[],['code'=>$fixture,'complexId'=>$cid])->getCode()!==401) {
        throw new RuntimeException('invalid_login_handler_failed');
    }
    $q = $pdo->prepare('SELECT id FROM halaqat WHERE complex_id=? ORDER BY id LIMIT 2');
    $q->execute([$cid]); $groups = $q->fetchAll(PDO::FETCH_COLUMN);
    $q = $pdo->prepare("SELECT id FROM education_plans WHERE complex_id=? AND track='gold' ORDER BY level_number LIMIT 2");
    $q->execute([$cid]); $plans = $q->fetchAll(PDO::FETCH_COLUMN);
    if (count($groups)!==2 || count($plans)!==2) throw new RuntimeException('transition_fixture_missing');
    $student = new_uuid(); $assignment = new_uuid();
    try {
        $pdo->prepare("INSERT INTO students(id,complex_id,name,halaqa_id,national_id) VALUES (?,?,?,?,'')")->execute([$student,$cid,$fixture,$groups[0]]);
        $pdo->prepare('INSERT INTO student_plan_assignments(id,student_id,plan_id) VALUES (?,?,?)')->execute([$assignment,$student,$plans[0]]);
        $GLOBALS['testAuth'] = ['role'=>'manager','complexId'=>$cid,'name'=>'Isolated test'];
        $transfer = probe('handle_patch_student',[],['id'=>$student,'patch'=>['halaqa_id'=>(int)$groups[1]]]);
        $GLOBALS['testAuth']['role'] = 'supervisor';
        $assign = probe('handle_assign_plan',[],['student_id'=>$student,'plan_id'=>$plans[1],
            'expected_assignment_id'=>$assignment,'start_segment_index'=>1]);
        $q = $pdo->prepare('SELECT halaqa_id FROM students WHERE id=? AND complex_id=?');
        $q->execute([$student,$cid]);
        if ($transfer->getCode()!==200 || (int)$q->fetchColumn()!==(int)$groups[1] || $assign->getCode()!==200) {
            throw new RuntimeException('transition_handler_failed');
        }
        $q = $pdo->prepare('SELECT id,plan_id,status FROM student_plan_assignments WHERE student_id=?');
        $q->execute([$student]);
        $history = array_column($q->fetchAll(),'status','plan_id');
        if (($history[$plans[0]] ?? null)!=='transferred' || ($history[$plans[1]] ?? null)!=='active') {
            throw new RuntimeException('transition_history_failed');
        }
    } finally {
        if ($pdo->inTransaction()) $pdo->rollBack();
        $pdo->prepare('DELETE FROM student_plan_assignments WHERE student_id=?')->execute([$student]);
        $pdo->prepare('DELETE FROM students WHERE id=? AND complex_id=?')->execute([$student,$cid]);
    }
    return ['login'=>$login,'invalid_login'=>401,'halaqa_transfer'=>200,'plan_transition'=>200,'prior_assignment_retained'=>true];
}
