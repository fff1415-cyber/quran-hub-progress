<?php

declare(strict_types=1);

function handle_list_app_state(): void
{
    require_auth();
    $pdo = db();
    $rows = $pdo->query('SELECT `key`, value FROM app_state')->fetchAll();
    foreach ($rows as &$row) {
        $row['value'] = json_decode($row['value'] ?? '{}', true);
    }
    json_response($rows);
}

function handle_set_app_state(): void
{
    require_auth();
    $input = json_input();
    $key = (string) ($input['key'] ?? '');
    if ($key === '') {
        error_response('Missing key');
    }
    $value = json_encode($input['value'] ?? null, JSON_UNESCAPED_UNICODE);

    $pdo = db();
    $sql = 'INSERT INTO app_state (`key`, value) VALUES (:key, :value)
            ON DUPLICATE KEY UPDATE value = VALUES(value)';
    $pdo->prepare($sql)->execute([':key' => $key, ':value' => $value]);
    json_response(['ok' => true]);
}
