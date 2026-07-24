<?php

declare(strict_types=1);

function app_state_tenant_enabled(PDO $pdo): bool
{
    return table_column_exists($pdo, 'app_state', 'complex_id');
}

function handle_list_app_state(): void
{
    $auth = require_auth();
    $cid = require_complex_id($auth);
    $pdo = db();
    $tenants = app_state_tenant_enabled($pdo);

    if ($tenants) {
        $stmt = $pdo->prepare('SELECT `key`, value FROM app_state WHERE complex_id = ?');
        $stmt->execute([$cid]);
        $rows = $stmt->fetchAll();
    } else {
        $rows = $pdo->query('SELECT `key`, value FROM app_state')->fetchAll();
    }
    foreach ($rows as &$row) {
        $row['value'] = json_decode($row['value'] ?? '{}', true);
    }
    json_response($rows);
}

function handle_set_app_state(): void
{
    $auth = require_auth();
    $cid = require_complex_id($auth);
    $input = json_input();
    $key = (string) ($input['key'] ?? '');
    if ($key === '') {
        error_response('Missing key');
    }
    $value = json_encode($input['value'] ?? null, JSON_UNESCAPED_UNICODE);

    $pdo = db();
    $tenants = app_state_tenant_enabled($pdo);

    if ($tenants) {
        $sql = 'INSERT INTO app_state (`complex_id`, `key`, value) VALUES (:complex_id, :key, :value)
                ON DUPLICATE KEY UPDATE value = VALUES(value)';
        $pdo->prepare($sql)->execute([':complex_id' => $cid, ':key' => $key, ':value' => $value]);
    } else {
        $sql = 'INSERT INTO app_state (`key`, value) VALUES (:key, :value)
                ON DUPLICATE KEY UPDATE value = VALUES(value)';
        $pdo->prepare($sql)->execute([':key' => $key, ':value' => $value]);
    }
    json_response(['ok' => true]);
}
