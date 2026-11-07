<?php

declare(strict_types=1);

require_once __DIR__ . '/../schema.php';
require_once __DIR__ . '/../diagnostics.php';

function students_column_exists(PDO $pdo, string $column): bool
{
    return table_column_exists($pdo, 'students', $column);
}

function students_tenant_enabled(PDO $pdo): bool
{
    return students_column_exists($pdo, 'complex_id');
}

function students_ensure_extended_columns(PDO $pdo): void
{
    schema_require_columns($pdo, 'students', ['student_phone', 'institute_level', 'phase_number', 'assigned_assistant_code']);
}

function handle_list_students_public(): void
{
    $pdo = db();
    students_ensure_extended_columns($pdo);
    $tenants = students_tenant_enabled($pdo);
    $cid = public_complex_id_from_request();

    if ($tenants) {
        $stmt = $pdo->prepare(
            'SELECT id, name, halaqa_id, level, level_type, institute_level, phase_number,
                    assigned_to, assigned_assistant_code, memorized, complex_id
             FROM students WHERE complex_id = ? ORDER BY name'
        );
        $stmt->execute([$cid]);
        $rows = $stmt->fetchAll();
    } else {
        $rows = $pdo->query(
            'SELECT id, name, halaqa_id, level, level_type, institute_level, phase_number,
                    assigned_to, assigned_assistant_code, memorized
             FROM students ORDER BY name'
        )->fetchAll();
    }
    json_response($rows);
}

function handle_list_students(): void
{
    $auth = require_auth();
    $cid = require_complex_id($auth);
    $pdo = db();
    students_ensure_extended_columns($pdo);
    $tenants = students_tenant_enabled($pdo);

    if ($tenants) {
        $stmt = $pdo->prepare('SELECT * FROM students WHERE complex_id = ? ORDER BY name');
        $stmt->execute([$cid]);
        $rows = $stmt->fetchAll();
    } else {
        $rows = $pdo->query('SELECT * FROM students ORDER BY name')->fetchAll();
    }
    json_response($rows);
}

function handle_upsert_students(): void
{
    $auth = require_auth();
    $cid = require_complex_id($auth);
    $input = json_input();
    $students = $input['students'] ?? [];
    if (!is_array($students) || count($students) === 0) {
        json_response(['ok' => true]);
    }

    $pdo = db();
    students_ensure_extended_columns($pdo);
    $tenants = students_tenant_enabled($pdo);

    if ($tenants) {
        $sql = 'INSERT INTO students (
                  id, complex_id, name, halaqa_id, national_id, parent_phone, student_phone,
                  level, level_type, institute_level, phase_number, assigned_to, assigned_assistant_code, memorized
                ) VALUES (
                  :id, :complex_id, :name, :halaqa_id, :national_id, :parent_phone, :student_phone,
                  :level, :level_type, :institute_level, :phase_number, :assigned_to, :assigned_assistant_code, :memorized
                )';
    } else {
        $sql = 'INSERT INTO students (id, name, halaqa_id, national_id, parent_phone, student_phone, level, level_type, institute_level, phase_number, assigned_to, assigned_assistant_code, memorized)
                VALUES (:id, :name, :halaqa_id, :national_id, :parent_phone, :student_phone, :level, :level_type, :institute_level, :phase_number, :assigned_to, :assigned_assistant_code, :memorized)
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
                  assigned_assistant_code = VALUES(assigned_assistant_code),
                  memorized = VALUES(memorized)';
    }
    $stmt = $pdo->prepare($sql);
    if ($tenants) {
        $byId = $pdo->prepare('SELECT id, complex_id FROM students WHERE id = ? FOR UPDATE');
        $byNationalId = $pdo->prepare('SELECT id FROM students WHERE complex_id = ? AND national_id = ? FOR UPDATE');
        $update = $pdo->prepare(
            'UPDATE students SET name = :name, halaqa_id = :halaqa_id, national_id = :national_id,
             parent_phone = :parent_phone, student_phone = :student_phone, level = :level,
             level_type = :level_type, institute_level = :institute_level, phase_number = :phase_number,
             assigned_to = :assigned_to, assigned_assistant_code = :assigned_assistant_code, memorized = :memorized
             WHERE id = :id AND complex_id = :complex_id'
        );
    }

    $preparedRows = [];
    foreach ($students as $s) {
        $phase = isset($s['phase_number']) ? (int) $s['phase_number'] : null;
        $params = [
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
            ':assigned_assistant_code' => $s['assigned_assistant_code'] ?? null,
            ':memorized' => $s['memorized'] ?? null,
        ];
        if ($tenants) {
            if (isset($s['complex_id']) && (int) $s['complex_id'] !== $cid) {
                error_response('Forbidden — complex mismatch', 403);
            }
            $params[':complex_id'] = $cid;
        }
        $preparedRows[] = $params;
    }

    try {
        $pdo->beginTransaction();
        foreach ($preparedRows as $params) {
            if ($tenants) {
                $byId->execute([$params[':id']]);
                $existing = $byId->fetch(PDO::FETCH_ASSOC);
                $byId->closeCursor();
                if ($existing !== false && (int) $existing['complex_id'] !== $cid) {
                    throw new DomainException('Student identifier conflicts with an existing record');
                }
                $targetId = $existing === false ? false : $existing['id'];
                if ($targetId === false) {
                    $byNationalId->execute([$cid, $params[':national_id']]);
                    $targetId = $byNationalId->fetchColumn();
                    $byNationalId->closeCursor();
                }
                if ($targetId !== false) {
                    $params[':id'] = $targetId;
                    $update->execute($params);
                    continue;
                }
            }
            // A concurrent insert can fail safely; never update a duplicate of unknown ownership.
            $stmt->execute($params);
        }
        $pdo->commit();
    } catch (DomainException $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        error_response('Student identifier conflicts with an existing record', 409);
        return;
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        error_response(api_safe_failure_message($error, 'students_batch'), api_database_error_status($error));
    }

    json_response(['ok' => true]);
}

function handle_patch_student(): void
{
    $auth = require_auth();
    $cid = require_complex_id($auth);
    $input = json_input();
    $id = (string) ($input['id'] ?? '');
    $patch = $input['patch'] ?? [];
    if ($id === '' || !is_array($patch) || count($patch) === 0) {
        error_response('Invalid patch');
    }

    $allowed = [
        'name', 'halaqa_id', 'national_id', 'parent_phone', 'student_phone',
        'level', 'level_type', 'institute_level', 'phase_number', 'assigned_to', 'assigned_assistant_code', 'memorized',
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
    $tenants = students_tenant_enabled($pdo);

    if ($tenants) {
        $check = $pdo->prepare('SELECT complex_id FROM students WHERE id = ? LIMIT 1');
        $check->execute([$id]);
        $row = $check->fetch();
        if (!$row) {
            error_response('Not found', 404);
        }
        assert_row_belongs_to_complex(isset($row['complex_id']) ? (int) $row['complex_id'] : null, $cid);
        $params[':complex_id'] = $cid;
        $sql = 'UPDATE students SET ' . implode(', ', $sets) . ' WHERE id = :id AND complex_id = :complex_id';
    } else {
        $sql = 'UPDATE students SET ' . implode(', ', $sets) . ' WHERE id = :id';
    }

    $pdo->prepare($sql)->execute($params);
    json_response(['ok' => true]);
}

function handle_delete_student(): void
{
    $auth = require_auth();
    $cid = require_complex_id($auth);
    $input = json_input();
    $id = (string) ($input['id'] ?? '');
    if ($id === '') {
        error_response('Missing id');
    }

    $pdo = db();
    $tenants = students_tenant_enabled($pdo);

    if ($tenants) {
        $stmt = $pdo->prepare('DELETE FROM students WHERE id = ? AND complex_id = ?');
        $stmt->execute([$id, $cid]);
        if ($stmt->rowCount() === 0) {
            error_response('Not found', 404);
        }
    } else {
        $pdo->prepare('DELETE FROM students WHERE id = ?')->execute([$id]);
    }
    json_response(['ok' => true]);
}
