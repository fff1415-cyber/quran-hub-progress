<?php
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
    echo json_encode(['database'=>'isolated_test','reads'=>$reads,'teacher_and_assistant_write'=>[200,200],
        'receipt_replayed'=>true,'stale_status'=>$staleStatus,'empty_replacements'=>$bulk,
        'tarbawi_rejections'=>$tarbawiStatuses,'tarbawi_preserved'=>true,
        'historical_values_unchanged'=>true,'synthetic_changes_reverted'=>true,'production_writes'=>false]+$more+$scientific,JSON_THROW_ON_ERROR).PHP_EOL;
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
    $pdo->rollBack();
    if ([$enabled,$disabled,$reenabled,$stale,$noPrep,$failedPrep,$earned] !== [200,200,200,409,409,409,200] ||
        $offRead['value']['configs'][$group]['fields']['hifz'] !== false ||
        $afterConfig['value']['configs'][$group]['fields']['hifz'] !== true ||
        ($afterConfig['value']['data'] ?? []) !== ($before['value']['data'] ?? []) ||
        $read()!==$before || grade_body(probe('handle_list_app_state',['key'=>'grades']))!==$grades) {
        throw new RuntimeException('scientific_regression');
    }
    return ['scientific_config_on_off_on'=>[200,200,200], 'stale_settings'=>409,
        'scientific_missing_and_failed_prep'=>[409,409], 'scientific_earned'=>200, 'scientific_history_unchanged'=>true];
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
