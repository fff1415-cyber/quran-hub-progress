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

    $pdo->beginTransaction();
    try {
        $semester=state_active_semester($pdo,$cid,true);
        if(($input['semester_id']??'')!==$semester)throw new RuntimeException('تغيّر الفصل الدراسي — لم يُحفظ اختبار التبويب القديم');
        $op=(string)($input['operation_id']??'');
        if(!preg_match('/^[a-zA-Z0-9:_-]{8,128}$/',$op)||!array_key_exists('base',$input))throw new RuntimeException('حدّث الصفحة؛ مرجع عملية الاختبار مطلوب');
        $insert = $pdo->prepare($tenants
            ? 'INSERT IGNORE INTO app_state (complex_id, `key`, value) VALUES (?, ?, ?)'
            : 'INSERT IGNORE INTO app_state (`key`, value) VALUES (?, ?)');
        $insert->execute($tenants ? [$cid, 'weekly_tests', '{}'] : ['weekly_tests', '{}']);
        $select = $pdo->prepare($tenants
            ? 'SELECT value FROM app_state WHERE complex_id = ? AND `key` = ? FOR UPDATE'
            : 'SELECT value FROM app_state WHERE `key` = ? FOR UPDATE');
        $select->execute($tenants ? [$cid, 'weekly_tests'] : ['weekly_tests']);
        $envelope=state_envelope(json_decode((string)$select->fetchColumn(),true));
        $hash=hash('sha256',state_canonical($input));
        if(isset($envelope['operations'][$op])) {
            if($envelope['operations'][$op]!==$hash)throw new RuntimeException('معرّف الاختبار مستخدم لطلب مختلف');
            $pdo->commit();json_response(['ok'=>true]);return;
        }
        $store=state_scope_value($envelope,'weekly_tests',$semester);
        $row = $store[$studentId][(string) $week] ?? [];
        if (!is_array($row)) $row = [];
        $values = $row[$kind] ?? [];
        if (!is_array($values)) $values = $values === '' ? [] : [$values];
        if(($values[$index]??'')!==$input['base']&&($values[$index]??'')!==$result)throw new RuntimeException('تعارض تعديل الاختبار — حدّث القيمة قبل إعادة المحاولة');
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
        $envelope['scopes'][$semester]=$store;$envelope['operations'][$op]=$hash;$envelope['revision']=($envelope['revision']??0)+1;
        app_state_upsert($pdo, 'weekly_tests', $envelope, $tenants ? $cid : null);
        $pdo->commit();
        json_response(['ok' => true, 'attribution' => $records[$index]]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}
