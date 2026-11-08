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
    echo json_encode(['database'=>'isolated_test','reads'=>$reads,'teacher_and_assistant_write'=>[200,200],
        'receipt_replayed'=>true,'stale_status'=>$staleStatus,'empty_replacements'=>$bulk,
        'historical_values_unchanged'=>true,'synthetic_changes_reverted'=>true,'production_writes'=>false],JSON_THROW_ON_ERROR).PHP_EOL;
}
