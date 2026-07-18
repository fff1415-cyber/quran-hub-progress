<?php

declare(strict_types=1);

function handle_list_role_accounts(): void
{
    require_auth();
    $pdo = db();
    $rows = $pdo->query('SELECT id, role, name, code, permissions, created_at FROM role_accounts ORDER BY created_at')->fetchAll();
    foreach ($rows as &$row) {
        $row['permissions'] = json_decode($row['permissions'] ?? '[]', true) ?: [];
    }
    json_response($rows);
}

function handle_upsert_role_account(): void
{
    require_auth();
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

    $allowedRoles = ['manager', 'secretary', 'supervisor', 'musammi'];
    if (!in_array($role, $allowedRoles, true)) {
        error_response('دور غير صالح');
    }

    $id = $acc['id'] ?? new_uuid();
    $permissions = json_encode($acc['permissions'] ?? [], JSON_UNESCAPED_UNICODE);

    $pdo = db();
    $sql = 'INSERT INTO role_accounts (id, role, name, code, permissions)
            VALUES (:id, :role, :name, :code, :permissions)
            ON DUPLICATE KEY UPDATE
              role = VALUES(role),
              name = VALUES(name),
              code = VALUES(code),
              permissions = VALUES(permissions)';
    try {
        $pdo->prepare($sql)->execute([
            ':id' => $id,
            ':role' => $role,
            ':name' => $name,
            ':code' => $code,
            ':permissions' => $permissions,
        ]);
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
    require_auth();
    $input = json_input();
    $id = (string) ($input['id'] ?? '');
    if ($id === '') {
        error_response('Missing id');
    }
    db()->prepare('DELETE FROM role_accounts WHERE id = ?')->execute([$id]);
    json_response(['ok' => true]);
}
