<?php

declare(strict_types=1);

function role_accounts_tenant_enabled(PDO $pdo): bool
{
    return table_column_exists($pdo, 'role_accounts', 'complex_id');
}

function handle_list_role_accounts(): void
{
    $auth = require_auth();
    $cid = require_complex_id($auth);
    $pdo = db();
    $tenants = role_accounts_tenant_enabled($pdo);

    if ($tenants) {
        $stmt = $pdo->prepare(
            'SELECT id, role, name, code, permissions, created_at, complex_id
             FROM role_accounts WHERE complex_id = ? ORDER BY created_at'
        );
        $stmt->execute([$cid]);
        $rows = $stmt->fetchAll();
    } else {
        $rows = $pdo->query(
            'SELECT id, role, name, code, permissions, created_at FROM role_accounts ORDER BY created_at'
        )->fetchAll();
    }
    foreach ($rows as &$row) {
        $row['permissions'] = json_decode($row['permissions'] ?? '[]', true) ?: [];
    }
    json_response($rows);
}

function handle_upsert_role_account(): void
{
    $auth = require_auth();
    $cid = require_complex_id($auth);
    $input = json_input();
    $acc = $input['account'] ?? [];
    if (!is_array($acc)) {
        error_response('بيانات الحساب غير صالحة');
    }

    $role = trim((string) ($acc['role'] ?? ''));
    $name = trim((string) ($acc['name'] ?? ''));
    $code = trim((string) ($acc['code'] ?? ''));
    if ($role === '' || $name === '' || $code === '') {
        error_response('الاسم والرمز والدور مطلوبة');
    }

    $allowedRoles = ['manager', 'secretary', 'supervisor', 'program_supervisor', 'musammi'];
    if (!in_array($role, $allowedRoles, true)) {
        error_response('دور غير صالح');
    }

    if (isset($acc['complex_id']) && (int) $acc['complex_id'] !== $cid) {
        error_response('Forbidden — complex mismatch', 403);
    }

    $id = $acc['id'] ?? new_uuid();
    $permissions = json_encode($acc['permissions'] ?? [], JSON_UNESCAPED_UNICODE);

    $pdo = db();
    $tenants = role_accounts_tenant_enabled($pdo);

    if ($tenants) {
        $check = $pdo->prepare('SELECT complex_id FROM role_accounts WHERE id = ? LIMIT 1');
        $check->execute([$id]);
        $existing = $check->fetch();
        if ($existing) {
            assert_row_belongs_to_complex(
                isset($existing['complex_id']) ? (int) $existing['complex_id'] : null,
                $cid
            );
        }
        $sql = 'INSERT INTO role_accounts (id, complex_id, role, name, code, permissions)
                VALUES (:id, :complex_id, :role, :name, :code, :permissions)
                ON DUPLICATE KEY UPDATE
                  role = VALUES(role),
                  name = VALUES(name),
                  code = VALUES(code),
                  permissions = VALUES(permissions),
                  complex_id = VALUES(complex_id)';
    } else {
        $sql = 'INSERT INTO role_accounts (id, role, name, code, permissions)
                VALUES (:id, :role, :name, :code, :permissions)
                ON DUPLICATE KEY UPDATE
                  role = VALUES(role),
                  name = VALUES(name),
                  code = VALUES(code),
                  permissions = VALUES(permissions)';
    }

    try {
        $params = [
            ':id' => $id,
            ':role' => $role,
            ':name' => $name,
            ':code' => $code,
            ':permissions' => $permissions,
        ];
        if ($tenants) {
            $params[':complex_id'] = $cid;
        }
        $pdo->prepare($sql)->execute($params);
    } catch (PDOException $e) {
        if ((int) $e->getCode() === 23000) {
            error_response('الرمز مستخدم مسبقاً — اختر رمزاً مختلفاً', 409);
        }
        error_response('فشل حفظ الحساب في قاعدة البيانات', 500);
    }

    json_response(['ok' => true, 'id' => $id]);
}

function handle_delete_role_account(): void
{
    $auth = require_auth();
    $cid = require_complex_id($auth);
    $input = json_input();
    $id = (string) ($input['id'] ?? '');
    if ($id === '') {
        error_response('Missing id');
    }

    $pdo = db();
    $tenants = role_accounts_tenant_enabled($pdo);

    if ($tenants) {
        $stmt = $pdo->prepare('DELETE FROM role_accounts WHERE id = ? AND complex_id = ?');
        $stmt->execute([$id, $cid]);
        if ($stmt->rowCount() === 0) {
            error_response('Not found', 404);
        }
    } else {
        $pdo->prepare('DELETE FROM role_accounts WHERE id = ?')->execute([$id]);
    }
    json_response(['ok' => true]);
}
