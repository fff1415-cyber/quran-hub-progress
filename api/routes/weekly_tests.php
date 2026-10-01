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
