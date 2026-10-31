<?php
declare(strict_types=1);
function assignmentReceiptTable(PDO $pdo): void {
    if ($pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite') {
        $pdo->exec('CREATE TABLE plan_operation_receipts(context_id INTEGER NOT NULL,operation_id TEXT NOT NULL,student_id TEXT NOT NULL,operation_kind TEXT NOT NULL,input_sha256 TEXT NOT NULL,response_json TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(context_id,operation_id))');
    } else {
        // Exact proposed DDL, not an application migration or an operator action.
        $pdo->exec(file_get_contents(__DIR__.'/fixtures/plan-operation-receipts.sql'));
    }
}
function assignmentOperationSnapshot(PDO $pdo, string $student): array {
    $out=[];
    foreach (['student_plan_assignments','segment_completions'] as $table) {
        $st=$pdo->prepare("SELECT * FROM $table WHERE student_id=?");$st->execute([$student]);
        $rows=$st->fetchAll();usort($rows,fn($a,$b)=>strcmp(serialize($a),serialize($b)));$out[$table]=$rows;
    }
    $out['queue']=$pdo->query("SELECT value FROM app_state WHERE complex_id=1 AND `key`='sard_queue'")->fetchColumn();
    return $out;
}
function assignmentOperationFailure(callable $run, string $message): void {
    try {$run();} catch (Throwable $e) {check(str_contains($e->getMessage(),$message),$message);return;}
    throw new RuntimeException('expected operation rejection: '.$message);
}
function assignmentOperationCases(PDO $pdo, array $request, string $student): void {
    $GLOBALS['auth']=['role'=>'supervisor','complexId'=>1,'name'=>'fixture'];
    $request['operation_id']='fixture-assign-operation';$GLOBALS['input']=$request;
    $before=assignmentOperationSnapshot($pdo,$student);
    $GLOBALS['input']['operation_probe']=true;handle_assign_plan();
    check($GLOBALS['response']['operation_applied']===false&&assignmentOperationSnapshot($pdo,$student)===$before,'unknown request probe never assigns or resets current work');
    check((int)$pdo->query('SELECT COUNT(*) FROM plan_operation_receipts')->fetchColumn()===0,'probe creates no synthetic receipt');
    $GLOBALS['input']=$request;handle_assign_plan();$first=$GLOBALS['response'];$after=assignmentOperationSnapshot($pdo,$student);
    check($first['operation_applied']===true&&$first['operation_id']===$request['operation_id'],'assignment is acknowledged only with a committed receipt');
    check($after['segment_completions']===$before['segment_completions'],'request receipts never copy, rebind or erase legacy completions');
    $GLOBALS['input']=array_reverse($request,true);handle_assign_plan();
    check($GLOBALS['response']['assignment_id']===$first['assignment_id']&&$GLOBALS['response']['replayed']===true&&$GLOBALS['response']['sard_queue']===null,'lost-response retry and reordered JSON return the original assignment without an old queue snapshot');
    check(assignmentOperationSnapshot($pdo,$student)===$after,'receipt retry does not replace a plan or regenerate its timestamps');
    $GLOBALS['input']['operation_probe']=true;handle_assign_plan();
    check($GLOBALS['response']['assignment_id']===$first['assignment_id']&&assignmentOperationSnapshot($pdo,$student)===$after,'known request probe confirms the result without any write');
    $GLOBALS['input']=$request;$GLOBALS['input']['start_segment_index']=2;
    assignmentOperationFailure(fn()=>handle_assign_plan(),'بيانات مختلفة');
    check(assignmentOperationSnapshot($pdo,$student)===$after,'same request identity with changed payload never modifies current work');
    foreach (['teacher','assistant','secretary','student','parent'] as $role) {
        $GLOBALS['auth']['role']=$role;$GLOBALS['input']=$request;
        assignmentOperationFailure(fn()=>handle_assign_plan(),'Forbidden');
    }
    $GLOBALS['auth']['role']='supervisor';
    $pdo->prepare('UPDATE plan_operation_receipts SET response_json=? WHERE context_id=1 AND operation_id=?')->execute(['{}',$request['operation_id']]);
    $GLOBALS['input']=$request;assignmentOperationFailure(fn()=>handle_assign_plan(),'إيصال طلب الخطة غير مكتمل');
    check(assignmentOperationSnapshot($pdo,$student)===$after,'damaged receipt is retained and never replaced by another assignment');
    $st=$pdo->prepare('UPDATE plan_operation_receipts SET response_json=? WHERE context_id=1 AND operation_id=?');
    $st->execute([json_encode($first),$request['operation_id']]);
    // A legitimate later operation may change the current plan; replay still must not undo it.
    $GLOBALS['input']=$request;$GLOBALS['input']['operation_id']='fixture-later-operation';$GLOBALS['input']['expected_assignment_id']=$first['assignment_id'];unset($GLOBALS['input']['sard_result']);
    handle_assign_plan();$later=$GLOBALS['response']['assignment_id'];$newer=assignmentOperationSnapshot($pdo,$student);
    $GLOBALS['input']=$request;handle_assign_plan();
    check($GLOBALS['response']['assignment_id']===$first['assignment_id']&&$later!==$first['assignment_id']&&assignmentOperationSnapshot($pdo,$student)===$newer,'replaying an older receipt leaves a legitimate later assignment and every write intact');
}
