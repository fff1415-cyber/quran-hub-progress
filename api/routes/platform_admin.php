<?php

declare(strict_types=1);

function platform_admin_secret(): string
{
    global $PLATFORM_ADMIN_SECRET_OVERRIDE;
    if (isset($PLATFORM_ADMIN_SECRET_OVERRIDE) && $PLATFORM_ADMIN_SECRET_OVERRIDE !== '') {
        return (string) $PLATFORM_ADMIN_SECRET_OVERRIDE;
    }
    if (defined('PLATFORM_ADMIN_SECRET')) {
        return (string) PLATFORM_ADMIN_SECRET;
    }
    return '';
}

function require_platform_auth(): array
{
    $auth = require_auth();
    if (($auth['scope'] ?? '') !== 'platform' || ($auth['role'] ?? '') !== 'platform_admin') {
        error_response('Forbidden — platform admin only', 403);
    }
    return $auth;
}

function complexes_has_is_active(PDO $pdo): bool
{
    return table_column_exists($pdo, 'complexes', 'is_active');
}

/** Add is_active to complexes if missing (Hostinger one-time auto-migrate). */
function ensure_complexes_is_active_column(PDO $pdo): void
{
    if (complexes_has_is_active($pdo)) {
        return;
    }
    try {
        $pdo->exec(
            'ALTER TABLE `complexes`
             ADD COLUMN `is_active` TINYINT(1) NOT NULL DEFAULT 1
             AFTER `contact_phone`'
        );
        $pdo->exec('UPDATE `complexes` SET `is_active` = 1');
    } catch (PDOException $e) {
        if (complexes_has_is_active($pdo)) {
            return;
        }
        if (str_contains($e->getMessage(), 'Duplicate column')) {
            return;
        }
        error_response(
            'تعذّر إضافة عمود is_active — نفّذ database/migrate-platform-admin.sql في phpMyAdmin',
            503
        );
    }
}

function assert_complex_exists(PDO $pdo, int $complexId): array
{
    $hasActive = complexes_has_is_active($pdo);
    $cols = $hasActive
        ? 'id, name, subdomain, contact_phone, created_at, is_active'
        : 'id, name, subdomain, contact_phone, created_at';
    $stmt = $pdo->prepare("SELECT $cols FROM complexes WHERE id = ? LIMIT 1");
    $stmt->execute([$complexId]);
    $row = $stmt->fetch();
    if (!$row) {
        error_response('المجمع غير موجود', 404);
    }
    if (!$hasActive) {
        $row['is_active'] = 1;
    }
    return $row;
}

function handle_platform_login(): void
{
    $secret = platform_admin_secret();
    if ($secret === '' || $secret === 'change-this-platform-admin-secret') {
        error_response('لوحة المنصة غير مهيّأة — عيّن PLATFORM_ADMIN_SECRET في api/config.php', 503);
    }

    $input = json_input();
    $password = trim((string) ($input['password'] ?? ''));
    if ($password === '') {
        error_response('كلمة المرور مطلوبة');
    }
    if (!hash_equals($secret, $password)) {
        error_response('كلمة المرور غير صحيحة', 401);
    }

    $token = generate_token([
        'scope' => 'platform',
        'role' => 'platform_admin',
        'name' => 'مدير المنصة',
    ]);

    json_response([
        'token' => $token,
        'role' => 'platform_admin',
        'name' => 'مدير المنصة',
    ]);
}

function handle_platform_list_complexes(): void
{
    require_platform_auth();
    $pdo = db();

    if (!in_array('complexes', $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN), true)) {
        error_response('جدول complexes غير موجود', 503);
    }

    $hasActive = complexes_has_is_active($pdo);
    $activeCol = $hasActive ? ', c.is_active' : ', 1 AS is_active';

    $sql = "SELECT c.id, c.name, c.subdomain, c.contact_phone, c.created_at $activeCol,
            (SELECT COUNT(*) FROM role_accounts ra WHERE ra.complex_id = c.id) AS accounts_count,
            (SELECT COUNT(*) FROM students s WHERE s.complex_id = c.id) AS students_count,
            (SELECT COUNT(*) FROM halaqat h WHERE h.complex_id = c.id) AS halaqat_count
            FROM complexes c
            ORDER BY c.id DESC";

    try {
        $rows = $pdo->query($sql)->fetchAll();
    } catch (PDOException $e) {
        if (str_contains($e->getMessage(), 'role_accounts') || str_contains($e->getMessage(), 'students')) {
            $sql = "SELECT c.id, c.name, c.subdomain, c.contact_phone, c.created_at $activeCol
                    FROM complexes c ORDER BY c.id DESC";
            $rows = $pdo->query($sql)->fetchAll();
            foreach ($rows as &$row) {
                $row['accounts_count'] = 0;
                $row['students_count'] = 0;
                $row['halaqat_count'] = 0;
            }
        } else {
            throw $e;
        }
    }

    foreach ($rows as &$row) {
        $row['id'] = (int) $row['id'];
        $row['is_active'] = (int) ($row['is_active'] ?? 1) === 1;
        $row['accounts_count'] = (int) ($row['accounts_count'] ?? 0);
        $row['students_count'] = (int) ($row['students_count'] ?? 0);
        $row['halaqat_count'] = (int) ($row['halaqat_count'] ?? 0);
    }

    json_response($rows);
}

function handle_platform_patch_complex(): void
{
    require_platform_auth();
    $input = json_input();
    $complexId = (int) ($input['id'] ?? 0);
    if ($complexId <= 0) {
        error_response('معرّف المجمع مطلوب');
    }

    $pdo = db();
    assert_complex_exists($pdo, $complexId);

    ensure_complexes_is_active_column($pdo);

    if (!array_key_exists('is_active', $input)) {
        error_response('is_active مطلوب');
    }

    $isActive = filter_var($input['is_active'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
    if ($isActive === null) {
        $isActive = (int) $input['is_active'] === 1;
    }

    $pdo->prepare('UPDATE complexes SET is_active = ? WHERE id = ? LIMIT 1')
        ->execute([$isActive ? 1 : 0, $complexId]);

    if (!$isActive && in_array('role_accounts', $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN), true)) {
        $pdo->prepare('DELETE FROM role_accounts WHERE complex_id = ?')->execute([$complexId]);
    }

    json_response(['ok' => true, 'id' => $complexId, 'is_active' => $isActive]);
}

function handle_platform_list_role_accounts(): void
{
    require_platform_auth();
    $complexId = (int) ($_GET['complexId'] ?? $_GET['complex_id'] ?? 0);
    if ($complexId <= 0) {
        error_response('complexId مطلوب');
    }

    $pdo = db();
    assert_complex_exists($pdo, $complexId);

    if (!in_array('role_accounts', $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN), true)) {
        json_response([]);
        return;
    }

    $stmt = $pdo->prepare(
        'SELECT id, complex_id, role, name, code, permissions, created_at
         FROM role_accounts WHERE complex_id = ? ORDER BY created_at'
    );
    $stmt->execute([$complexId]);
    $rows = $stmt->fetchAll();
    foreach ($rows as &$row) {
        $row['complex_id'] = (int) $row['complex_id'];
        $row['permissions'] = json_decode($row['permissions'] ?? '[]', true) ?: [];
    }
    json_response($rows);
}

function handle_platform_delete_role_account(): void
{
    require_platform_auth();
    $input = json_input();
    $id = trim((string) ($input['id'] ?? ''));
    $complexId = (int) ($input['complexId'] ?? $input['complex_id'] ?? 0);
    if ($id === '' || $complexId <= 0) {
        error_response('id و complexId مطلوبان');
    }

    $pdo = db();
    assert_complex_exists($pdo, $complexId);

    $stmt = $pdo->prepare('DELETE FROM role_accounts WHERE id = ? AND complex_id = ?');
    $stmt->execute([$id, $complexId]);
    if ($stmt->rowCount() === 0) {
        error_response('الحساب غير موجود', 404);
    }
    json_response(['ok' => true]);
}

function handle_platform_revoke_access(): void
{
    require_platform_auth();
    $input = json_input();
    $complexId = (int) ($input['complexId'] ?? $input['complex_id'] ?? 0);
    if ($complexId <= 0) {
        error_response('complexId مطلوب');
    }

    $pdo = db();
    assert_complex_exists($pdo, $complexId);

    ensure_complexes_is_active_column($pdo);

    $deleted = 0;
    if (in_array('role_accounts', $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN), true)) {
        $stmt = $pdo->prepare('DELETE FROM role_accounts WHERE complex_id = ?');
        $stmt->execute([$complexId]);
        $deleted = $stmt->rowCount();
    }

    if (complexes_has_is_active($pdo)) {
        $pdo->prepare('UPDATE complexes SET is_active = 0 WHERE id = ? LIMIT 1')->execute([$complexId]);
    }

    json_response(['ok' => true, 'deleted_accounts' => $deleted]);
}