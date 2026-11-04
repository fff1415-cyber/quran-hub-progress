<?php
declare(strict_types=1);
require __DIR__.'/backend-sard-regression.php';
require __DIR__.'/assignment-operation-cases.php';
$pdo=seed();$GLOBALS['input']['operation_id']='fixture-no-table';$before=assignmentOperationSnapshot($pdo,'student-1');
assignmentOperationFailure(fn()=>handle_assign_plan(),'إيصالات طلبات الخطط غير مفعّل');
check(assignmentOperationSnapshot($pdo,'student-1')===$before&&!plans_table_exists($pdo,'plan_operation_receipts'),'missing schema fails before mutation and is never created by the route');
$pdo=seed();assignmentReceiptTable($pdo);assignmentOperationCases($pdo,$GLOBALS['input'],'student-1');
$pdo=seed();assignmentReceiptTable($pdo);$GLOBALS['input']['operation_id']='fixture-receipt-failure';$before=assignmentOperationSnapshot($pdo,'student-1');
$pdo->exec("CREATE TRIGGER fixture_receipt_failure BEFORE INSERT ON plan_operation_receipts BEGIN SELECT RAISE(ABORT,'fixture receipt failure'); END");
assignmentOperationFailure(fn()=>handle_assign_plan(),'fixture receipt failure');
check(assignmentOperationSnapshot($pdo,'student-1')===$before&&(int)$pdo->query('SELECT COUNT(*) FROM plan_operation_receipts')->fetchColumn()===0,'receipt failure rolls back assignment closure, new assignment and queue together');
$pdo=seed();assignmentReceiptTable($pdo);$GLOBALS['input']['operation_id']='fixture-queue-failure';$before=assignmentOperationSnapshot($pdo,'student-1');
$pdo->exec("CREATE TRIGGER fixture_queue_failure BEFORE INSERT ON app_state BEGIN SELECT RAISE(ABORT,'fixture queue failure'); END");
assignmentOperationFailure(fn()=>handle_assign_plan(),'fixture queue failure');
check(assignmentOperationSnapshot($pdo,'student-1')===$before&&(int)$pdo->query('SELECT COUNT(*) FROM plan_operation_receipts')->fetchColumn()===0,'queue failure leaves no receipt or partial assignment');
foreach (['bad',null,[],1] as $invalid) {$pdo=seed();assignmentReceiptTable($pdo);$GLOBALS['input']['operation_id']=$invalid;assignmentOperationFailure(fn()=>handle_assign_plan(),'معرّف طلب الخطة غير صالح');}
$pdo=seed();assignmentReceiptTable($pdo);$GLOBALS['input']['operation_id']='fixture-incomplete-plan';$pdo->exec('DELETE FROM segment_completions WHERE segment_index=2');$before=assignmentOperationSnapshot($pdo,'student-1');assignmentOperationFailure(fn()=>handle_assign_plan(),'لم يكتمل حفظ');
check(assignmentOperationSnapshot($pdo,'student-1')===$before&&(int)$pdo->query('SELECT COUNT(*) FROM plan_operation_receipts')->fetchColumn()===0,'new operation identity cannot bypass musammi completion criteria');
$pdo=seed();assignmentReceiptTable($pdo);$GLOBALS['input']['operation_id']='fixture-frozen-plan';$pdo->exec("UPDATE student_plan_assignments SET status='frozen'");assignmentOperationFailure(fn()=>handle_assign_plan(),'المسمّع مخوّل');
$pdo=seed();assignmentReceiptTable($pdo);$GLOBALS['input']['operation_id']='fixture-other-complex';$GLOBALS['auth']['complexId']=2;assignmentOperationFailure(fn()=>handle_assign_plan(),'Forbidden tenant');
$pdo=seed();assignmentReceiptTable($pdo);$GLOBALS['input']['operation_id']='fixture-boolean-probe';$GLOBALS['input']['operation_probe']='false';assignmentOperationFailure(fn()=>handle_assign_plan(),'صيغة استعلام');
echo "PASS: optional assignment receipts, probes, stable retries, original guards and real rollback without legacy mutations\n";
