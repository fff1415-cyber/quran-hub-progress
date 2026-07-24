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

function tenant_info_normalize_subdomain(string $sub): string
{
    $sub = strtolower(trim($sub));
    if ($sub === '' || $sub === 'www') {
        return TENANT_DEFAULT_SUBDOMAIN;
    }
    if (!preg_match('/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/i', $sub)) {
        return TENANT_DEFAULT_SUBDOMAIN;
    }
    return $sub;
}

function tenant_info_fetch_row(PDO $pdo, string $sub, bool $hasSubdomain): ?array
{
    if ($hasSubdomain) {
        $stmt = $pdo->prepare(
            'SELECT id, name, logo_url, primary_color, subdomain
             FROM complexes WHERE subdomain = ? LIMIT 1'
        );
        $stmt->execute([$sub]);
        $row = $stmt->fetch();
        if ($row) {
            return $row;
        }
    }

    if ($sub !== TENANT_DEFAULT_SUBDOMAIN) {
        if ($hasSubdomain) {
            $stmt = $pdo->prepare(
                'SELECT id, name, logo_url, primary_color, subdomain
                 FROM complexes WHERE subdomain = ? LIMIT 1'
            );
            $stmt->execute([TENANT_DEFAULT_SUBDOMAIN]);
            $row = $stmt->fetch();
            if ($row) {
                return $row;
            }
        }
    }

    $stmt = $pdo->query(
        'SELECT id, name, logo_url, primary_color' .
        ($hasSubdomain ? ', subdomain' : '') .
        ' FROM complexes WHERE id = 1 LIMIT 1'
    );
    $row = $stmt->fetch();
    return $row ?: null;
}

function handle_tenant_info(): void
{
    $raw = tenant_info_subdomain_from_request();
    $sub = tenant_info_normalize_subdomain($raw);

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
    $row = tenant_info_fetch_row($pdo, $sub, $hasSubdomain);

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
