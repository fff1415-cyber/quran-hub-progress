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

function handle_complex_register(): void
{
    $input = json_input();
    $name = trim((string) ($input['name'] ?? ''));
    $subdomain = strtolower(trim((string) ($input['subdomain'] ?? '')));
    $contactName = trim((string) ($input['contact_name'] ?? ''));
    $contactPhone = trim((string) ($input['contact_phone'] ?? ''));

    if ($name === '') {
        error_response('اسم المجمع مطلوب', 400);
    }
    if ($subdomain === '') {
        error_response('الرابط الفرعي (subdomain) مطلوب', 400);
    }
    complex_register_validate_subdomain($subdomain);

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

    $check = $pdo->prepare('SELECT id FROM complexes WHERE subdomain = ? LIMIT 1');
    $check->execute([$subdomain]);
    if ($check->fetch()) {
        error_response('الرابط الفرعي مستخدم — اختر اسماً آخر', 409);
    }

    $stmt = $pdo->prepare(
        'INSERT INTO complexes (name, subdomain, primary_color) VALUES (?, ?, ?)'
    );
    $stmt->execute([$name, $subdomain, '#C9A227']);
    $id = (int) $pdo->lastInsertId();

    json_response([
        'ok' => true,
        'id' => $id,
        'name' => $name,
        'subdomain' => $subdomain,
        'contact_name' => $contactName,
        'contact_phone' => $contactPhone,
    ], 201);
}
