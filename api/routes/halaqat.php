<?php

declare(strict_types=1);

function halaqat_tenant_enabled(PDO $pdo): bool
{
    return table_column_exists($pdo, 'halaqat', 'complex_id');
}

function halaqat_ensure_extra_assistants_column(PDO $pdo): void
{
    if (!table_column_exists($pdo, 'halaqat', 'extra_assistants')) {
        $pdo->exec(
            'ALTER TABLE `halaqat`
             ADD COLUMN `extra_assistants` JSON NULL DEFAULT NULL AFTER `assistant_code`'
        );
    }
}

function halaqat_encode_extra_assistants($raw): ?string
{
    if (!is_array($raw) || count($raw) === 0) {
        return null;
    }
    $clean = [];
    foreach ($raw as $item) {
        if (!is_array($item)) {
            continue;
        }
        $name = trim((string) ($item['name'] ?? ''));
        $code = trim((string) ($item['code'] ?? ''));
        if ($name === '' && $code === '') {
            continue;
        }
        $clean[] = ['name' => $name !== '' ? $name : '—', 'code' => $code];
    }
    if (count($clean) === 0) {
        return null;
    }
    return json_encode($clean, JSON_UNESCAPED_UNICODE);
}

function handle_list_halaqat_public(): void
{
    $pdo = db();
    $tenants = halaqat_tenant_enabled($pdo);
    $cid = public_complex_id_from_request();

    if ($tenants) {
        $stmt = $pdo->prepare(
            'SELECT id, name, is_talqeen, teacher_name, assistant_name, complex_id
             FROM halaqat WHERE complex_id = ? ORDER BY id'
        );
        $stmt->execute([$cid]);
        $rows = $stmt->fetchAll();
    } else {
        $rows = $pdo->query(
            'SELECT id, name, is_talqeen, teacher_name, assistant_name FROM halaqat ORDER BY id'
        )->fetchAll();
    }
    json_response($rows);
}

function handle_list_halaqat(): void
{
    $auth = require_auth();
    $cid = require_complex_id($auth);
    $pdo = db();
    halaqat_ensure_extra_assistants_column($pdo);
    $tenants = halaqat_tenant_enabled($pdo);

    if ($tenants) {
        $stmt = $pdo->prepare('SELECT * FROM halaqat WHERE complex_id = ? ORDER BY id');
        $stmt->execute([$cid]);
        $rows = $stmt->fetchAll();
    } else {
        $rows = $pdo->query('SELECT * FROM halaqat ORDER BY id')->fetchAll();
    }
    json_response($rows);
}

function handle_upsert_halaqat(): void
{
    $auth = require_auth();
    $cid = require_complex_id($auth);
    $input = json_input();
    $halaqat = $input['halaqat'] ?? [];
    if (!is_array($halaqat) || count($halaqat) === 0) {
        json_response(['ok' => true]);
    }

    $pdo = db();
    halaqat_ensure_extra_assistants_column($pdo);
    $tenants = halaqat_tenant_enabled($pdo);
    $hasExtras = table_column_exists($pdo, 'halaqat', 'extra_assistants');

    if ($tenants) {
        $sql = $hasExtras
            ? 'INSERT INTO halaqat (complex_id, id, name, is_talqeen, teacher_name, teacher_code, assistant_name, assistant_code, extra_assistants)
                VALUES (:complex_id, :id, :name, :is_talqeen, :teacher_name, :teacher_code, :assistant_name, :assistant_code, :extra_assistants)
                ON DUPLICATE KEY UPDATE
                  name = VALUES(name),
                  is_talqeen = VALUES(is_talqeen),
                  teacher_name = VALUES(teacher_name),
                  teacher_code = VALUES(teacher_code),
                  assistant_name = VALUES(assistant_name),
                  assistant_code = VALUES(assistant_code),
                  extra_assistants = VALUES(extra_assistants),
                  complex_id = VALUES(complex_id)'
            : 'INSERT INTO halaqat (complex_id, id, name, is_talqeen, teacher_name, teacher_code, assistant_name, assistant_code)
                VALUES (:complex_id, :id, :name, :is_talqeen, :teacher_name, :teacher_code, :assistant_name, :assistant_code)
                ON DUPLICATE KEY UPDATE
                  name = VALUES(name),
                  is_talqeen = VALUES(is_talqeen),
                  teacher_name = VALUES(teacher_name),
                  teacher_code = VALUES(teacher_code),
                  assistant_name = VALUES(assistant_name),
                  assistant_code = VALUES(assistant_code),
                  complex_id = VALUES(complex_id)';
    } else {
        $sql = $hasExtras
            ? 'INSERT INTO halaqat (id, name, is_talqeen, teacher_name, teacher_code, assistant_name, assistant_code, extra_assistants)
                VALUES (:id, :name, :is_talqeen, :teacher_name, :teacher_code, :assistant_name, :assistant_code, :extra_assistants)
                ON DUPLICATE KEY UPDATE
                  name = VALUES(name),
                  is_talqeen = VALUES(is_talqeen),
                  teacher_name = VALUES(teacher_name),
                  teacher_code = VALUES(teacher_code),
                  assistant_name = VALUES(assistant_name),
                  assistant_code = VALUES(assistant_code),
                  extra_assistants = VALUES(extra_assistants)'
            : 'INSERT INTO halaqat (id, name, is_talqeen, teacher_name, teacher_code, assistant_name, assistant_code)
                VALUES (:id, :name, :is_talqeen, :teacher_name, :teacher_code, :assistant_name, :assistant_code)
                ON DUPLICATE KEY UPDATE
                  name = VALUES(name),
                  is_talqeen = VALUES(is_talqeen),
                  teacher_name = VALUES(teacher_name),
                  teacher_code = VALUES(teacher_code),
                  assistant_name = VALUES(assistant_name),
                  assistant_code = VALUES(assistant_code)';
    }
    $stmt = $pdo->prepare($sql);

    try {
        foreach ($halaqat as $h) {
            $name = trim((string) ($h['name'] ?? ''));
            if ($name === '') {
                error_response('اسم الحلقة مطلوب');
            }
            if ($tenants && isset($h['complex_id']) && (int) $h['complex_id'] !== $cid) {
                error_response('Forbidden — complex mismatch', 403);
            }
            $params = [
                ':id' => (int) $h['id'],
                ':name' => $name,
                ':is_talqeen' => !empty($h['is_talqeen']) ? 1 : 0,
                ':teacher_name' => trim((string) ($h['teacher_name'] ?? '')) ?: '—',
                ':teacher_code' => trim((string) ($h['teacher_code'] ?? '')),
                ':assistant_name' => trim((string) ($h['assistant_name'] ?? '')) ?: '—',
                ':assistant_code' => trim((string) ($h['assistant_code'] ?? '')),
            ];
            if ($hasExtras) {
                $params[':extra_assistants'] = halaqat_encode_extra_assistants($h['extra_assistants'] ?? null);
            }
            if ($tenants) {
                $params[':complex_id'] = $cid;
            }
            $stmt->execute($params);
        }
    } catch (PDOException $e) {
        error_response('فشل حفظ الحلقة في قاعدة البيانات', 500);
    }

    json_response(['ok' => true]);
}

function handle_delete_halaqa(): void
{
    $auth = require_auth();
    $cid = require_complex_id($auth);
    $input = json_input();
    $id = (int) ($input['id'] ?? 0);
    if ($id <= 0) {
        error_response('Missing id');
    }

    $pdo = db();
    $tenants = halaqat_tenant_enabled($pdo);

    if ($tenants) {
        $stmt = $pdo->prepare('DELETE FROM halaqat WHERE id = ? AND complex_id = ?');
        $stmt->execute([$id, $cid]);
        if ($stmt->rowCount() === 0) {
            error_response('Not found', 404);
        }
    } else {
        $pdo->prepare('DELETE FROM halaqat WHERE id = ?')->execute([$id]);
    }
    json_response(['ok' => true]);
}
