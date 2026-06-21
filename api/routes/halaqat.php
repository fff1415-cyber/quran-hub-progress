<?php

declare(strict_types=1);

function handle_list_halaqat_public(): void
{
    $pdo = db();
    $rows = $pdo->query(
        'SELECT id, name, is_talqeen, teacher_name, assistant_name FROM halaqat ORDER BY id'
    )->fetchAll();
    json_response($rows);
}

function handle_list_halaqat(): void
{
    require_auth();
    $pdo = db();
    $rows = $pdo->query('SELECT * FROM halaqat ORDER BY id')->fetchAll();
    json_response($rows);
}

function handle_upsert_halaqat(): void
{
    require_auth();
    $input = json_input();
    $halaqat = $input['halaqat'] ?? [];
    if (!is_array($halaqat) || count($halaqat) === 0) {
        json_response(['ok' => true]);
    }

    $pdo = db();
    $sql = 'INSERT INTO halaqat (id, name, is_talqeen, teacher_name, teacher_code, assistant_name, assistant_code)
            VALUES (:id, :name, :is_talqeen, :teacher_name, :teacher_code, :assistant_name, :assistant_code)
            ON DUPLICATE KEY UPDATE
              name = VALUES(name),
              is_talqeen = VALUES(is_talqeen),
              teacher_name = VALUES(teacher_name),
              teacher_code = VALUES(teacher_code),
              assistant_name = VALUES(assistant_name),
              assistant_code = VALUES(assistant_code)';
    $stmt = $pdo->prepare($sql);

    foreach ($halaqat as $h) {
        $stmt->execute([
            ':id' => (int) $h['id'],
            ':name' => $h['name'],
            ':is_talqeen' => !empty($h['is_talqeen']) ? 1 : 0,
            ':teacher_name' => $h['teacher_name'] ?? '—',
            ':teacher_code' => $h['teacher_code'] ?? '',
            ':assistant_name' => $h['assistant_name'] ?? '—',
            ':assistant_code' => $h['assistant_code'] ?? '',
        ]);
    }

    json_response(['ok' => true]);
}

function handle_delete_halaqa(): void
{
    require_auth();
    $input = json_input();
    $id = (int) ($input['id'] ?? 0);
    if ($id <= 0) {
        error_response('Missing id');
    }
    db()->prepare('DELETE FROM halaqat WHERE id = ?')->execute([$id]);
    json_response(['ok' => true]);
}
