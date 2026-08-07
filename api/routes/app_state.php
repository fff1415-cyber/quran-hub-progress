<?php

declare(strict_types=1);

function app_state_tenant_enabled(PDO $pdo): bool
{
    return table_column_exists($pdo, 'app_state', 'complex_id');
}

/** Encode for app_state.value — always valid JSON (string, object, array, …). */
function app_state_json_encode(mixed $value): string
{
    $json = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    if ($json === false) {
        throw new InvalidArgumentException('تعذّر ترميز البيانات');
    }
    return $json;
}

function app_state_upsert(PDO $pdo, string $key, mixed $value, ?int $complexId = null): void
{
    $json = app_state_json_encode($value);
    $tenants = app_state_tenant_enabled($pdo);

    if ($tenants) {
        if ($complexId === null || $complexId <= 0) {
            throw new InvalidArgumentException('complex_id مطلوب');
        }
        $stmt = $pdo->prepare(
            'INSERT INTO app_state (`complex_id`, `key`, value) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE value = ?'
        );
        $stmt->execute([$complexId, $key, $json, $json]);
        return;
    }

    $stmt = $pdo->prepare(
        'INSERT INTO app_state (`key`, value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE value = ?'
    );
    $stmt->execute([$key, $json, $json]);
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

    $pdo = db();
    try {
        if (app_state_tenant_enabled($pdo)) {
            app_state_upsert($pdo, $key, $input['value'] ?? null, $cid);
        } else {
            app_state_upsert($pdo, $key, $input['value'] ?? null);
        }
    } catch (PDOException $e) {
        if (pdo_is_integrity_violation($e)) {
            error_response(pdo_integrity_error_message($e) . ' | ' . pdo_sql_error_detail($e), 409);
        }
        throw $e;
    } catch (InvalidArgumentException $e) {
        error_response($e->getMessage(), 400);
    }
    json_response(['ok' => true]);
}
