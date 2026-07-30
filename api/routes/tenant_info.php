<?php

declare(strict_types=1);

const TENANT_DEFAULT_SUBDOMAIN = 'm1';

function tenant_info_subdomain_from_request(): string
{
    $sub = trim((string) ($_GET['subdomain'] ?? ''));
    if ($sub !== '') {
        return $sub;
    }
    $uri = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?? '';
    if (preg_match('#/tenant-info/([a-z0-9-]+)/?$#i', $uri, $m)) {
        return $m[1];
    }
    return '';
}

function tenant_info_validate_subdomain(string $sub): bool
{
    return $sub !== '' && preg_match('/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/i', $sub);
}

function handle_tenant_info(): void
{
    $raw = tenant_info_subdomain_from_request();
    $explicit = $raw !== '';

    if ($explicit && !tenant_info_validate_subdomain(strtolower($raw))) {
        error_response('subdomain غير صالح', 400);
    }

    $sub = $explicit ? strtolower($raw) : TENANT_DEFAULT_SUBDOMAIN;

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
        $row = $stmt->fetch();
    } else {
        $row = $sub === TENANT_DEFAULT_SUBDOMAIN || !$explicit
            ? $pdo->query('SELECT id, name, logo_url, primary_color FROM complexes WHERE id = 1 LIMIT 1')->fetch()
            : null;
    }

    if (!$row && !$explicit) {
        $stmt = $pdo->prepare(
            'SELECT id, name, logo_url, primary_color, subdomain
             FROM complexes WHERE subdomain = ? LIMIT 1'
        );
        $stmt->execute([TENANT_DEFAULT_SUBDOMAIN]);
        $row = $stmt->fetch();
    }

    if (!$row) {
        error_response('المجمع غير موجود', 404);
    }

    json_response([
        'id' => (int) $row['id'],
        'name' => (string) $row['name'],
        'logo_url' => $row['logo_url'] !== null ? (string) $row['logo_url'] : null,
        'primary_color' => (string) ($row['primary_color'] ?? '#C9A227'),
        'subdomain' => $hasSubdomain ? (string) ($row['subdomain'] ?? TENANT_DEFAULT_SUBDOMAIN) : TENANT_DEFAULT_SUBDOMAIN,
    ]);
}
