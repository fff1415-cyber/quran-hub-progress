<?php

declare(strict_types=1);

function handle_login_by_code(): void
{
    $input = json_input();
    $code = trim((string) ($input['code'] ?? ''));
    if ($code === '') {
        error_response('رمز العضوية مطلوب');
    }

    $requestedComplexId = login_complex_id_from_input($input);

    try {
        $pdo = db();
    } catch (PDOException) {
        error_response('تعذّر الاتصال بقاعدة البيانات — راجع إعدادات api/config.php على Hostinger', 503);
    }

    $tenantsRole = table_column_exists($pdo, 'role_accounts', 'complex_id');
    $tenantsHalaqa = table_column_exists($pdo, 'halaqat', 'complex_id');

    assert_complex_login_allowed($pdo, $requestedComplexId);

    try {
        if ($tenantsRole) {
            $stmt = $pdo->prepare(
                'SELECT role, name, code, complex_id FROM role_accounts
                 WHERE complex_id = ? AND code = ? LIMIT 1'
            );
            $stmt->execute([$requestedComplexId, $code]);
        } else {
            $stmt = $pdo->prepare('SELECT role, name, code FROM role_accounts WHERE code = ? LIMIT 1');
            $stmt->execute([$code]);
        }
        $ra = $stmt->fetch();
        if ($ra) {
            $complexId = $tenantsRole ? (int) $ra['complex_id'] : $requestedComplexId;
            $tokenPayload = login_token_payload(
                ['role' => $ra['role'], 'name' => $ra['name']],
                $complexId,
                $tenantsRole,
            );
            json_response([
                'token' => generate_token($tokenPayload),
                'role' => $ra['role'],
                'name' => $ra['name'],
                'halaqaId' => null,
                'complexId' => $tenantsRole ? $complexId : null,
            ]);
        }

        if ($tenantsHalaqa) {
            $stmt = $pdo->prepare(
                'SELECT complex_id, id, teacher_name, teacher_code, assistant_name, assistant_code
                 FROM halaqat
                 WHERE complex_id = ? AND (teacher_code = ? OR assistant_code = ?)
                 LIMIT 1'
            );
            $stmt->execute([$requestedComplexId, $code, $code]);
        } else {
            $stmt = $pdo->prepare(
                'SELECT id, teacher_name, teacher_code, assistant_name, assistant_code
                 FROM halaqat WHERE teacher_code = ? OR assistant_code = ? LIMIT 1'
            );
            $stmt->execute([$code, $code]);
        }
    } catch (PDOException $e) {
        if (str_contains($e->getMessage(), 'role_accounts')) {
            error_response('جدول role_accounts غير موجود — نفّذ database/schema.sql في phpMyAdmin', 503);
        }
        error_response('خطأ في قاعدة البيانات أثناء تسجيل الدخول', 500);
    }

    $h = $stmt->fetch();
    if ($h) {
        $complexId = $tenantsHalaqa ? (int) $h['complex_id'] : $requestedComplexId;
        if ($h['teacher_code'] === $code) {
            $tokenPayload = login_token_payload(
                ['role' => 'teacher', 'name' => $h['teacher_name'], 'halaqaId' => (int) $h['id']],
                $complexId,
                $tenantsHalaqa,
            );
            json_response([
                'token' => generate_token($tokenPayload),
                'role' => 'teacher',
                'name' => $h['teacher_name'],
                'halaqaId' => (int) $h['id'],
                'complexId' => $tenantsHalaqa ? $complexId : null,
            ]);
        }
        if ($h['assistant_code'] === $code) {
            $tokenPayload = login_token_payload(
                ['role' => 'assistant', 'name' => $h['assistant_name'], 'halaqaId' => (int) $h['id']],
                $complexId,
                $tenantsHalaqa,
            );
            json_response([
                'token' => generate_token($tokenPayload),
                'role' => 'assistant',
                'name' => $h['assistant_name'],
                'halaqaId' => (int) $h['id'],
                'complexId' => $tenantsHalaqa ? $complexId : null,
            ]);
        }
    }

    error_response('رمز العضوية غير صحيح', 401);
}

function handle_login_by_national_id(): void
{
    $input = json_input();
    $nid = trim((string) ($input['nationalId'] ?? ''));
    if ($nid === '') {
        error_response('رقم الهوية مطلوب');
    }

    $requestedComplexId = login_complex_id_from_input($input);
    $pdo = db();
    $tenants = table_column_exists($pdo, 'students', 'complex_id');

    assert_complex_login_allowed($pdo, $requestedComplexId);

    if ($tenants) {
        $stmt = $pdo->prepare(
            'SELECT id, name, halaqa_id, complex_id FROM students
             WHERE complex_id = ? AND national_id = ? LIMIT 1'
        );
        $stmt->execute([$requestedComplexId, $nid]);
    } else {
        $stmt = $pdo->prepare('SELECT id, name, halaqa_id FROM students WHERE national_id = ? LIMIT 1');
        $stmt->execute([$nid]);
    }

    $row = $stmt->fetch();
    if (!$row) {
        error_response('رقم الهوية غير مسجل', 401);
    }

    $complexId = $tenants ? (int) $row['complex_id'] : $requestedComplexId;
    $tokenPayload = login_token_payload(
        ['role' => 'student', 'name' => $row['name'], 'studentId' => $row['id']],
        $complexId,
        $tenants,
    );

    json_response([
        'token' => generate_token($tokenPayload),
        'studentId' => $row['id'],
        'name' => $row['name'],
        'halaqaId' => (int) $row['halaqa_id'],
        'complexId' => $tenants ? $complexId : null,
    ]);
}
