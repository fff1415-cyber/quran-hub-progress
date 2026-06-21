<?php

declare(strict_types=1);

function handle_list_students_public(): void
{
    $pdo = db();
    $rows = $pdo->query(
        'SELECT id, name, halaqa_id, level, level_type, assigned_to, memorized
         FROM students ORDER BY name'
    )->fetchAll();
    json_response($rows);
}

function handle_list_students(): void
{
    require_auth();
    $pdo = db();
    $rows = $pdo->query('SELECT * FROM students ORDER BY name')->fetchAll();
    json_response($rows);
}

function handle_upsert_students(): void
{
    require_auth();
    $input = json_input();
    $students = $input['students'] ?? [];
    if (!is_array($students) || count($students) === 0) {
        json_response(['ok' => true]);
    }

    $pdo = db();
    $sql = 'INSERT INTO students (id, name, halaqa_id, national_id, parent_phone, level, level_type, assigned_to, memorized)
            VALUES (:id, :name, :halaqa_id, :national_id, :parent_phone, :level, :level_type, :assigned_to, :memorized)
            ON DUPLICATE KEY UPDATE
              name = VALUES(name),
              halaqa_id = VALUES(halaqa_id),
              national_id = VALUES(national_id),
              parent_phone = VALUES(parent_phone),
              level = VALUES(level),
              level_type = VALUES(level_type),
              assigned_to = VALUES(assigned_to),
              memorized = VALUES(memorized)';
    $stmt = $pdo->prepare($sql);

    foreach ($students as $s) {
        $stmt->execute([
            ':id' => $s['id'],
            ':name' => $s['name'],
            ':halaqa_id' => (int) $s['halaqa_id'],
            ':national_id' => $s['national_id'],
            ':parent_phone' => $s['parent_phone'] ?? '',
            ':level' => $s['level'] ?? '1',
            ':level_type' => $s['level_type'] ?? 'gold',
            ':assigned_to' => $s['assigned_to'] ?? null,
            ':memorized' => $s['memorized'] ?? null,
        ]);
    }

    json_response(['ok' => true]);
}

function handle_patch_student(): void
{
    require_auth();
    $input = json_input();
    $id = (string) ($input['id'] ?? '');
    $patch = $input['patch'] ?? [];
    if ($id === '' || !is_array($patch) || count($patch) === 0) {
        error_response('Invalid patch');
    }

    $allowed = ['name', 'halaqa_id', 'national_id', 'parent_phone', 'level', 'level_type', 'assigned_to', 'memorized'];
    $sets = [];
    $params = [':id' => $id];
    foreach ($patch as $key => $value) {
        if (!in_array($key, $allowed, true)) {
            continue;
        }
        $sets[] = "$key = :$key";
        $params[":$key"] = $value;
    }
    if (count($sets) === 0) {
        json_response(['ok' => true]);
    }

    $pdo = db();
    $sql = 'UPDATE students SET ' . implode(', ', $sets) . ' WHERE id = :id';
    $pdo->prepare($sql)->execute($params);
    json_response(['ok' => true]);
}

function handle_delete_student(): void
{
    require_auth();
    $input = json_input();
    $id = (string) ($input['id'] ?? '');
    if ($id === '') {
        error_response('Missing id');
    }
    db()->prepare('DELETE FROM students WHERE id = ?')->execute([$id]);
    json_response(['ok' => true]);
}
