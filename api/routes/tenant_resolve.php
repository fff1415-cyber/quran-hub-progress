<?php

declare(strict_types=1);

function tenant_resolve_normalize_query(string $q): string
{
    return trim($q);
}

function tenant_resolve_validate_subdomain(string $sub): bool
{
    return $sub !== '' && preg_match('/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/i', $sub);
}

function tenant_resolve_row(PDO $pdo, string $q, bool $hasSubdomain): ?array
{
    if ($hasSubdomain && tenant_resolve_validate_subdomain(strtolower($q))) {
        $stmt = $pdo->prepare(
            'SELECT id, name, subdomain FROM complexes WHERE subdomain = ? LIMIT 1'
        );
        $stmt->execute([strtolower($q)]);
        $row = $stmt->fetch();
        if ($row) {
            return $row;
        }
    }

    $stmt = $pdo->prepare(
        'SELECT id, name' . ($hasSubdomain ? ', subdomain' : '') . '
         FROM complexes WHERE name LIKE ? LIMIT 1'
    );
    $stmt->execute(['%' . $q . '%']);
    $row = $stmt->fetch();
    if ($row) {
        return $row;
    }

    return null;
}

function handle_tenant_resolve(): void
{
    $q = tenant_resolve_normalize_query((string) ($_GET['q'] ?? ''));
    if ($q === '') {
        error_response('أدخل اسم المجمع أو الرابط الفرعي', 400);
    }

    try {
        $pdo = db();
    } catch (PDOException) {
        error_response('تعذّر الاتصال بقاعدة البيانات', 503);
    }

    $tables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    if (!in_array('complexes', $tables, true)) {
        error_response('جدول complexes غير موجود', 503);
    }

    $hasSubdomain = table_column_exists($pdo, 'complexes', 'subdomain');
    $row = tenant_resolve_row($pdo, $q, $hasSubdomain);

    if (!$row) {
        error_response('لم يُعثر على مجمع بهذا الاسم — تحقق من الاسم أو سجّل مجمعاً جديداً', 404);
    }

    $sub = $hasSubdomain ? (string) ($row['subdomain'] ?? 'm1') : 'm1';

    json_response([
        'id' => (int) $row['id'],
        'name' => (string) $row['name'],
        'subdomain' => $sub,
    ]);
}

function complex_register_validate_subdomain(string $sub): void
{
    if (!tenant_resolve_validate_subdomain($sub)) {
        error_response('الرابط الفرعي: أحرف إنجليزية وأرقام وشرطة فقط (مثل: my-complex)', 400);
    }
}

function complex_next_subdomain(PDO $pdo): string
{
    $rows = $pdo->query('SELECT subdomain FROM complexes')->fetchAll(PDO::FETCH_COLUMN);
    $maxNum = 0;
    foreach ($rows as $sub) {
        $sub = strtolower(trim((string) $sub));
        if (preg_match('/^m(\d+)$/', $sub, $m)) {
            $maxNum = max($maxNum, (int) $m[1]);
        }
    }

    $candidateNum = $maxNum > 0 ? $maxNum + 1 : max(1, count($rows) + 1);
    $check = $pdo->prepare('SELECT id FROM complexes WHERE subdomain = ? LIMIT 1');

    for ($i = 0; $i < 1000; $i++) {
        $candidate = 'm' . $candidateNum;
        $check->execute([$candidate]);
        if (!$check->fetch()) {
            return $candidate;
        }
        $candidateNum++;
    }

    error_response('تعذّر تخصيص عضوية مجمع — تواصل مع الدعم', 503);
}

function handle_next_subdomain(): void
{
    try {
        $pdo = db();
    } catch (PDOException) {
        error_response('تعذّر الاتصال بقاعدة البيانات', 503);
    }

    $tables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    if (!in_array('complexes', $tables, true)) {
        error_response('جدول complexes غير موجود', 503);
    }

    if (!table_column_exists($pdo, 'complexes', 'subdomain')) {
        error_response('نفّذ migrate-complex-subdomain.sql أولاً', 503);
    }

    $subdomain = complex_next_subdomain($pdo);

    json_response([
        'subdomain' => $subdomain,
    ]);
}

function complex_register_validate_manager_code(string $code): void
{
    $code = trim($code);
    if ($code === '') {
        error_response('رقم عضوية المدير مطلوب', 400);
    }
    if (strlen($code) < 3 || strlen($code) > 50) {
        error_response('رقم العضوية: من 3 إلى 50 حرفاً', 400);
    }
}

function complex_register_validate_phone(string $phone): void
{
    $phone = trim($phone);
    if ($phone === '') {
        error_response('جوال التواصل مطلوب', 400);
    }
    if (strlen($phone) < 9 || strlen($phone) > 20) {
        error_response('أدخل رقم جوال صحيحاً', 400);
    }
}

function complex_register_subdomain_taken(PDO $pdo, string $subdomain): bool
{
    $stmt = $pdo->prepare('SELECT id FROM complexes WHERE subdomain = ? LIMIT 1');
    $stmt->execute([$subdomain]);
    return (bool) $stmt->fetch();
}

function complex_register_manager_code_taken(PDO $pdo, string $code, bool $roleTenants): bool
{
    if (table_index_exists($pdo, 'role_accounts', 'uk_code')) {
        $stmt = $pdo->prepare('SELECT id FROM role_accounts WHERE code = ? LIMIT 1');
        $stmt->execute([$code]);
        return (bool) $stmt->fetch();
    }

    if ($roleTenants && table_index_exists($pdo, 'role_accounts', 'uk_complex_code')) {
        return false;
    }

    $stmt = $pdo->prepare('SELECT id FROM role_accounts WHERE code = ? LIMIT 1');
    $stmt->execute([$code]);
    return (bool) $stmt->fetch();
}

function handle_complex_register(): void
{
    $input = json_input();
    $name = trim((string) ($input['name'] ?? ''));
    $subdomain = strtolower(trim((string) ($input['subdomain'] ?? '')));
    $managerName = trim((string) ($input['manager_name'] ?? $input['contact_name'] ?? ''));
    $contactPhone = preg_replace('/\s+/', '', trim((string) ($input['contact_phone'] ?? '')));
    $managerCode = trim((string) ($input['manager_code'] ?? $input['admin_id'] ?? $input['code'] ?? ''));

    if ($name === '') {
        error_response('اسم المجمع مطلوب', 400);
    }
    if ($managerName === '') {
        error_response('اسم مدير المجمع / المشرف العام مطلوب', 400);
    }
    complex_register_validate_phone($contactPhone);
    complex_register_validate_manager_code($managerCode);

    try {
        $pdo = db();
    } catch (PDOException) {
        error_response('تعذّر الاتصال بقاعدة البيانات', 503);
    }

    $tables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    if (!in_array('complexes', $tables, true)) {
        error_response('جدول complexes غير موجود', 503);
    }

    $hasSubdomain = table_column_exists($pdo, 'complexes', 'subdomain');
    if (!$hasSubdomain) {
        error_response('نفّذ migrate-complex-subdomain.sql أولاً', 503);
    }

    if ($subdomain === '') {
        $subdomain = complex_next_subdomain($pdo);
    }
    complex_register_validate_subdomain($subdomain);

    if (complex_register_subdomain_taken($pdo, $subdomain)) {
        error_response('رمز المجمع (العضوية) مستخدم — اختر رمزاً آخر أو حدّث الصفحة', 409);
    }

    $hasRoleAccounts = in_array('role_accounts', $tables, true);
    $roleTenants = $hasRoleAccounts && table_column_exists($pdo, 'role_accounts', 'complex_id');

    if ($hasRoleAccounts && complex_register_manager_code_taken($pdo, $managerCode, $roleTenants)) {
        error_response('رقم عضوية المدير مستخدم مسبقاً — اختر رقماً مختلفاً', 409);
    }

    $hasContactPhone = table_column_exists($pdo, 'complexes', 'contact_phone');
    $hasTheme = table_column_exists($pdo, 'complexes', 'theme_key');
    $defaultPrimary = '#1e3a5f';

    try {
        $pdo->beginTransaction();

        if ($hasContactPhone && $hasTheme) {
            $stmt = $pdo->prepare(
                'INSERT INTO complexes (name, subdomain, primary_color, theme_key, contact_phone)
                 VALUES (?, ?, ?, ?, ?)'
            );
            $stmt->execute([$name, $subdomain, $defaultPrimary, 'navy', $contactPhone]);
        } elseif ($hasContactPhone) {
            $stmt = $pdo->prepare(
                'INSERT INTO complexes (name, subdomain, primary_color, contact_phone) VALUES (?, ?, ?, ?)'
            );
            $stmt->execute([$name, $subdomain, $defaultPrimary, $contactPhone]);
        } elseif ($hasTheme) {
            $stmt = $pdo->prepare(
                'INSERT INTO complexes (name, subdomain, primary_color, theme_key) VALUES (?, ?, ?, ?)'
            );
            $stmt->execute([$name, $subdomain, $defaultPrimary, 'navy']);
        } else {
            $stmt = $pdo->prepare(
                'INSERT INTO complexes (name, subdomain, primary_color) VALUES (?, ?, ?)'
            );
            $stmt->execute([$name, $subdomain, $defaultPrimary]);
        }
        $id = (int) $pdo->lastInsertId();

        if ($hasRoleAccounts) {
            $managerId = new_uuid();
            if ($roleTenants) {
                $ra = $pdo->prepare(
                    'INSERT INTO role_accounts (id, complex_id, role, name, code, permissions)
                     VALUES (?, ?, ?, ?, ?, ?)'
                );
                $ra->execute([$managerId, $id, 'manager', $managerName, $managerCode, '[]']);
            } else {
                $ra = $pdo->prepare(
                    'INSERT INTO role_accounts (id, role, name, code, permissions)
                     VALUES (?, ?, ?, ?, ?)'
                );
                $ra->execute([$managerId, 'manager', $managerName, $managerCode, '[]']);
            }
        }

        $pdo->commit();
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        if (pdo_is_integrity_violation($e)) {
            error_response(pdo_integrity_error_message($e), 409);
        }
        error_response('فشل تسجيل المجمع — حاول مرة أخرى', 500);
    }

    json_response([
        'ok' => true,
        'id' => $id,
        'name' => $name,
        'subdomain' => $subdomain,
        'manager_name' => $managerName,
        'manager_code' => $managerCode,
        'contact_phone' => $contactPhone,
    ], 201);
}
