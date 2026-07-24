<?php

declare(strict_types=1);

function tenant_info_subdomain_from_request(): string
{
    $sub = trim((string) ($_GET['subdomain'] ?? ''));
    if ($sub !== '') {
        return $sub;
    }
    // Optional path segment: /tenant-info/{subdomain}
    $uri = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?? '';
    if (preg_match('#/tenant-info/([a-z0-9-]+)/?$#i', $uri, $m)) {
        return $m[1];
    }
    return '';
}

function tenant_info_validate_subdomain(string $sub): void
{
    if ($sub === '' || !preg_match('/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/i', $sub)) {
        error_response('subdomain غير صالح', 400);
    }
}

function handle_tenant_info(): void
{
    $sub = strtolower(tenant_info_subdomain_from_request());
    tenant_info_validate_subdomain($sub);

    try {
        $pdo = db();
    } catch (PDOException) {
        error_response('تعذّر الاتصال بقاعدة البيانات', 503);
    }

    $tables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    if (!in_array('complexes', $tables, true)) {
        error_response('جدول complexes غير موجود — نفّذ migrate-multi-tenant.sql', 503);
    }

    $hasSubdomain = table_column_exists($pdo, 'complexes', 'subdomain');

    if ($hasSubdomain) {
        $stmt = $pdo->prepare(
            'SELECT id, name, logo_url, primary_color, subdomain
             FROM complexes WHERE subdomain = ? LIMIT 1'
        );
        $stmt->execute([$sub]);
    } else {
        // Before subdomain migration: only default complex id=1 for m1
        if ($sub !== 'm1') {
            error_response('المجمع غير موجود', 404);
        }
        $stmt = $pdo->query(
            'SELECT id, name, logo_url, primary_color FROM complexes WHERE id = 1 LIMIT 1'
        );
    }

    $row = $stmt->fetch();
    if (!$row) {
        error_response('المجمع غير موجود', 404);
    }

    json_response([
        'id' => (int) $row['id'],
        'name' => (string) $row['name'],
        'logo_url' => $row['logo_url'] !== null ? (string) $row['logo_url'] : null,
        'primary_color' => (string) ($row['primary_color'] ?? '#C9A227'),
        'subdomain' => $hasSubdomain ? (string) ($row['subdomain'] ?? $sub) : $sub,
    ]);
}
