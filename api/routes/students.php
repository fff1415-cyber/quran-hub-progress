<?php

declare(strict_types=1);

function students_column_exists(PDO $pdo, string $column): bool
{
    $stmt = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?'
    );
    $stmt->execute(['students', $column]);
    return (int) $stmt->fetchColumn() > 0;
}

function students_ensure_extended_columns(PDO $pdo): void
{
    if (!students_column_exists($pdo, 'student_phone')) {
        $pdo->exec(
            'ALTER TABLE `students`
             ADD COLUMN `student_phone` VARCHAR(30) NOT NULL DEFAULT \'\' AFTER `parent_phone`'
        );
    }
    if (!students_column_exists($pdo, 'institute_level')) {
        $pdo->exec(
            'ALTER TABLE `students`
             ADD COLUMN `institute_level` VARCHAR(50) NULL DEFAULT NULL AFTER `level_type`'
        );
    }
    if (!students_column_exists($pdo, 'phase_number')) {
        $pdo->exec(
            'ALTER TABLE `students`
             ADD COLUMN `phase_number` INT UNSIGNED NULL DEFAULT NULL AFTER `institute_level`'
        );
    }
}

function handle_list_students_public(): void
{
    $pdo = db();
    students_ensure_extended_columns($pdo);
    $rows = $pdo->query(
        'SELECT id, name, halaqa_id, level, level_type, institute_level, phase_number, assigned_to, memorized
         FROM students ORDER BY name'
    )->fetchAll();
    json_response($rows);
}

function handle_list_students(): void
{
    require_auth();
    $pdo = db();
    students_ensure_extended_columns($pdo);
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
    students_ensure_extended_columns($pdo);
    $sql = 'INSERT INTO students (id, name, halaqa_id, national_id, parent_phone, student_phone, level, level_type, institute_level, phase_number, assigned_to, memorized)
            VALUES (:id, :name, :halaqa_id, :national_id, :parent_phone, :student_phone, :level, :level_type, :institute_level, :phase_number, :assigned_to, :memorized)
            ON DUPLICATE KEY UPDATE
              name = VALUES(name),
              halaqa_id = VALUES(halaqa_id),
              national_id = VALUES(national_id),
              parent_phone = VALUES(parent_phone),
              student_phone = VALUES(student_phone),
              level = VALUES(level),
              level_type = VALUES(level_type),
              institute_level = VALUES(institute_level),
              phase_number = VALUES(phase_number),
              assigned_to = VALUES(assigned_to),
              memorized = VALUES(memorized)';
    $stmt = $pdo->prepare($sql);

    foreach ($students as $s) {
        $phase = isset($s['phase_number']) ? (int) $s['phase_number'] : null;
        $stmt->execute([
            ':id' => $s['id'],
            ':name' => $s['name'],
            ':halaqa_id' => (int) $s['halaqa_id'],
            ':national_id' => $s['national_id'],
            ':parent_phone' => $s['parent_phone'] ?? '',
            ':student_phone' => $s['student_phone'] ?? '',
            ':level' => $s['level'] ?? '1',
            ':level_type' => $s['level_type'] ?? 'gold',
            ':institute_level' => $s['institute_level'] ?? null,
            ':phase_number' => $phase > 0 ? $phase : null,
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

    $allowed = [
        'name', 'halaqa_id', 'national_id', 'parent_phone', 'student_phone',
        'level', 'level_type', 'institute_level', 'phase_number', 'assigned_to', 'memorized',
    ];
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
    students_ensure_extended_columns($pdo);
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
