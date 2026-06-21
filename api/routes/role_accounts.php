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
        error_response('Invalid account');
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
    $pdo->prepare($sql)->execute([
        ':id' => $id,
        ':role' => $acc['role'],
        ':name' => $acc['name'],
        ':code' => $acc['code'],
        ':permissions' => $permissions,
    ]);

    json_response(['ok' => true]);
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
