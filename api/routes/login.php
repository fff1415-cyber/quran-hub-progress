<?php

declare(strict_types=1);

function handle_login_by_code(): void
{
    $input = json_input();
    $code = trim((string) ($input['code'] ?? ''));
    if ($code === '') {
        error_response('رمز العضوية مطلوب');
    }

    try {
        $pdo = db();
    } catch (PDOException) {
        error_response('تعذّر الاتصال بقاعدة البيانات — راجع إعدادات api/config.php على Hostinger', 503);
    }

    try {
        $stmt = $pdo->prepare('SELECT role, name, code FROM role_accounts WHERE code = ? LIMIT 1');
        $stmt->execute([$code]);
        $ra = $stmt->fetch();
        if ($ra) {
            json_response([
                'token' => generate_token(['role' => $ra['role'], 'name' => $ra['name']]),
                'role' => $ra['role'],
                'name' => $ra['name'],
                'halaqaId' => null,
            ]);
        }

        $stmt = $pdo->prepare(
            'SELECT id, teacher_name, teacher_code, assistant_name, assistant_code
             FROM halaqat WHERE teacher_code = ? OR assistant_code = ? LIMIT 1'
        );
        $stmt->execute([$code, $code]);
    } catch (PDOException $e) {
        if (str_contains($e->getMessage(), 'role_accounts')) {
            error_response('جدول role_accounts غير موجود — نفّذ database/schema.sql في phpMyAdmin', 503);
        }
        error_response('خطأ في قاعدة البيانات أثناء تسجيل الدخول', 500);
    }
    $h = $stmt->fetch();
    if ($h) {
        if ($h['teacher_code'] === $code) {
            json_response([
                'token' => generate_token(['role' => 'teacher', 'name' => $h['teacher_name'], 'halaqaId' => (int) $h['id']]),
                'role' => 'teacher',
                'name' => $h['teacher_name'],
                'halaqaId' => (int) $h['id'],
            ]);
        }
        if ($h['assistant_code'] === $code) {
            json_response([
                'token' => generate_token(['role' => 'assistant', 'name' => $h['assistant_name'], 'halaqaId' => (int) $h['id']]),
                'role' => 'assistant',
                'name' => $h['assistant_name'],
                'halaqaId' => (int) $h['id'],
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

    $pdo = db();
    $stmt = $pdo->prepare('SELECT id, name, halaqa_id FROM students WHERE national_id = ? LIMIT 1');
    $stmt->execute([$nid]);
    $row = $stmt->fetch();
    if (!$row) {
        error_response('رقم الهوية غير مسجل', 401);
    }

    json_response([
        'token' => generate_token(['role' => 'student', 'name' => $row['name'], 'studentId' => $row['id']]),
        'studentId' => $row['id'],
        'name' => $row['name'],
        'halaqaId' => (int) $row['halaqa_id'],
    ]);
}
