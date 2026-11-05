<?php

declare(strict_types=1);

/** Save one result under a row lock so committee members cannot overwrite each other. */
function handle_patch_weekly_test(): void
{
    $auth = require_auth();
    $role = (string) ($auth['role'] ?? '');
    if (!in_array($role, ['teacher', 'assistant', 'manager', 'secretary', 'supervisor', 'test_member', 'test_chair'], true)) {
        error_response('غير مصرح بتسجيل الاختبارات', 403);
    }
    $cid = require_complex_id($auth);
    $input = json_input();
    $studentId = trim((string) ($input['studentId'] ?? ''));
    $week = (int) ($input['week'] ?? 0);
    $kind = (string) ($input['kind'] ?? '');
    $index = (int) ($input['index'] ?? -1);
    $result = (string) ($input['result'] ?? '');
    if ($studentId === '' || $week < 1 || $week > 60 || !in_array($kind, ['muraja', 'rabt'], true)
        || $index < 0 || $index > 5 || !in_array($result, ['', 'pass', 'fail'], true)) {
        error_response('بيانات الاختبار غير صالحة', 400);
    }

    $pdo = db();
    $tenants = app_state_tenant_enabled($pdo);
    $studentQuery = table_column_exists($pdo, 'students', 'complex_id')
        ? 'SELECT halaqa_id FROM students WHERE id = ? AND complex_id = ? LIMIT 1'
        : 'SELECT halaqa_id FROM students WHERE id = ? LIMIT 1';
    $studentStmt = $pdo->prepare($studentQuery);
    $studentStmt->execute(str_contains($studentQuery, 'complex_id') ? [$studentId, $cid] : [$studentId]);
    $student = $studentStmt->fetch();
    if (!$student) error_response('الطالب غير موجود', 404);
    if (in_array($role, ['teacher', 'assistant'], true) && (int) ($auth['halaqaId'] ?? 0) !== (int) $student['halaqa_id']) {
        error_response('الحلقة غير مصرح بها', 403);
    }

    if(array_key_exists('grade_write_protocol',$input)){
        if($input['grade_write_protocol']!==1||!shared_grade_writes_enabled('weekly_tests'))error_response('الحفظ المؤكد للاختبارات غير مفعّل؛ بقيت المسودة على الجهاز',503);
        $packet=$input['value']??[];
        if(!is_array($packet))error_response('طلب الاختبار غير صالح',400);
        $changes=$packet['changes']??[];$path=[$studentId,(string)$week,$kind,(string)$index];
        if(!is_array($changes)||count($changes)!==1||($changes[0]['path']??null)!==$path||($changes[0]['next']??null)!==['present'=>true,'value'=>$result]||isset($packet['plan']))error_response('طلب الاختبار لا يطابق الخانة المحددة',400);
        $operation=(string)($packet['operation_id']??'');
        $effect=static function(stdClass $store,string $versionKey)use($pdo,$cid,$auth,$studentId,$week,$kind,$index,$result,$operation):void{
            $row=$store->{$studentId}->{(string)$week};$attribution=$row->attribution??new stdClass();if(!$attribution instanceof stdClass)$attribution=new stdClass();
            $records=$attribution->{$kind}??[];if(!is_array($records))throw new RuntimeException('سجل إسناد الاختبار يحتاج مراجعة؛ لم تُمح بياناته',409);
            $records=array_pad(array_values($records),$index+1,null);
            $records[$index]=$result===''?null:(object)['result'=>$result,'byName'=>(string)($auth['name']??''),'byId'=>(string)($auth['accountId']??''),'at'=>gmdate('Y-m-d\TH:i:s\Z')];
            $attribution->{$kind}=$records;$row->attribution=$attribution;
            grade_cells_record_version($pdo,grade_cells_context($pdo,$cid),$versionKey,[$studentId,(string)$week,'attribution',$kind,(string)$index],$operation);
        };
        try{$receipt=grade_cells_apply($pdo,$cid,'weekly_tests',$operation,$packet['calendar_context']??[],$changes,0,$effect);json_response(['ok'=>true]+$receipt);return;}
        catch(Throwable $error){error_response($error instanceof PDOException?api_safe_failure_message($error,'weekly_atomic'):$error->getMessage(),$error instanceof PDOException?api_database_error_status($error):(in_array($error->getCode(),[400,409],true)?$error->getCode():503));}
    }
    if(shared_grade_writes_enabled('weekly_tests'))error_response('حدّث واجهة الاختبارات لتأكيد الحفظ؛ لم تُحفظ عملية قديمة',409);
    $pdo->beginTransaction();
    try {
        $insert = $pdo->prepare($tenants
            ? 'INSERT IGNORE INTO app_state (complex_id, `key`, value) VALUES (?, ?, ?)'
            : 'INSERT IGNORE INTO app_state (`key`, value) VALUES (?, ?)');
        $insert->execute($tenants ? [$cid, 'weekly_tests', '{}'] : ['weekly_tests', '{}']);
        $select = $pdo->prepare($tenants
            ? 'SELECT value FROM app_state WHERE complex_id = ? AND `key` = ? FOR UPDATE'
            : 'SELECT value FROM app_state WHERE `key` = ? FOR UPDATE');
        $select->execute($tenants ? [$cid, 'weekly_tests'] : ['weekly_tests']);
        $store = json_decode((string) $select->fetchColumn(), true);
        if (!is_array($store)) $store = [];
        $row = $store[$studentId][(string) $week] ?? [];
        if (!is_array($row)) $row = [];
        $values = $row[$kind] ?? [];
        if (!is_array($values)) $values = $values === '' ? [] : [$values];
        $values = array_pad(array_values($values), $index + 1, '');
        $values[$index] = $result;
        $row[$kind] = $values;
        $attribution = $row['attribution'] ?? [];
        if (!is_array($attribution)) $attribution = [];
        $records = $attribution[$kind] ?? [];
        if (!is_array($records)) $records = [];
        $records = array_pad(array_values($records), $index + 1, null);
        $records[$index] = $result === '' ? null : [
            'result' => $result,
            'byName' => (string) ($auth['name'] ?? ''),
            'byId' => (string) ($auth['accountId'] ?? ''),
            'at' => gmdate('Y-m-d\TH:i:s\Z'),
        ];
        $attribution[$kind] = $records;
        $row['attribution'] = $attribution;
        $store[$studentId][(string) $week] = $row;
        app_state_upsert($pdo, 'weekly_tests', $store, $tenants ? $cid : null);
        $pdo->commit();
        json_response(['ok' => true, 'attribution' => $records[$index]]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}
