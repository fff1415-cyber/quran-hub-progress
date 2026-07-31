<?php

declare(strict_types=1);

function plans_require_roles(array $auth, array $roles): void
{
    $role = (string) ($auth['role'] ?? '');
    if ($role === 'manager') {
        return;
    }
    if (!in_array($role, $roles, true)) {
        error_response('Forbidden', 403);
    }
}

function plans_table_exists(PDO $pdo, string $table): bool
{
    $stmt = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.tables
         WHERE table_schema = DATABASE() AND table_name = ?'
    );
    $stmt->execute([$table]);
    return (int) $stmt->fetchColumn() > 0;
}

function plans_column_exists(PDO $pdo, string $table, string $column): bool
{
    return table_column_exists($pdo, $table, $column);
}

function plans_tenant_enabled(PDO $pdo): bool
{
    return plans_column_exists($pdo, 'education_plans', 'complex_id');
}

function plans_students_tenant_scoped(PDO $pdo, bool $plansTenants): bool
{
    return $plansTenants && plans_column_exists($pdo, 'students', 'complex_id');
}

function plans_assert_student_in_complex(PDO $pdo, string $studentId, int $cid, bool $tenants): void
{
    if (!plans_students_tenant_scoped($pdo, $tenants)) {
        return;
    }
    $st = $pdo->prepare('SELECT complex_id FROM students WHERE id = ? LIMIT 1');
    $st->execute([$studentId]);
    $row = $st->fetch();
    if (!$row) {
        error_response('Not found', 404);
    }
    assert_row_belongs_to_complex(isset($row['complex_id']) ? (int) $row['complex_id'] : null, $cid);
}

function plans_assert_plan_in_complex(PDO $pdo, string $planId, int $cid, bool $tenants): void
{
    if (!$tenants) {
        return;
    }
    $st = $pdo->prepare('SELECT complex_id FROM education_plans WHERE id = ? LIMIT 1');
    $st->execute([$planId]);
    $row = $st->fetch();
    if (!$row) {
        error_response('الخطة غير موجودة', 404);
    }
    assert_row_belongs_to_complex(isset($row['complex_id']) ? (int) $row['complex_id'] : null, $cid);
}

function plans_assert_teacher_student_access(PDO $pdo, array $auth, string $studentId, bool $tenants): void
{
    $role = (string) ($auth['role'] ?? '');
    if ($role !== 'teacher' && $role !== 'assistant') {
        return;
    }
    $halaqaId = (int) ($auth['halaqaId'] ?? 0);
    if (plans_students_tenant_scoped($pdo, $tenants)) {
        $cid = require_complex_id($auth);
        $st = $pdo->prepare('SELECT halaqa_id FROM students WHERE id = ? AND complex_id = ? LIMIT 1');
        $st->execute([$studentId, $cid]);
    } else {
        $st = $pdo->prepare('SELECT halaqa_id FROM students WHERE id = ? LIMIT 1');
        $st->execute([$studentId]);
    }
    $row = $st->fetch();
    if (!$row) {
        error_response('الطالب غير موجود أو لا ينتمي لهذا المجمع', 404);
    }
    if ((int) $row['halaqa_id'] !== $halaqaId) {
        error_response('لا يمكنك عرض خطة طالب من حلقة أخرى', 403);
    }
}

/** Add plan_start_date / start_muraja_segment when table predates migrate-plan-assignments-v2.sql */
function plans_ensure_assignment_v2_columns(PDO $pdo): void
{
    if (!plans_table_exists($pdo, 'student_plan_assignments')) {
        return;
    }
    if (!plans_column_exists($pdo, 'student_plan_assignments', 'plan_start_date')) {
        $pdo->exec(
            'ALTER TABLE `student_plan_assignments`
             ADD COLUMN `plan_start_date` DATE NULL DEFAULT NULL AFTER `start_segment_index`'
        );
    }
    if (!plans_column_exists($pdo, 'student_plan_assignments', 'start_muraja_segment')) {
        $pdo->exec(
            'ALTER TABLE `student_plan_assignments`
             ADD COLUMN `start_muraja_segment` INT NULL DEFAULT NULL AFTER `plan_start_date`'
        );
    }
}

function plans_ensure_daily_faces_columns(PDO $pdo): void
{
    $planCols = [
        'daily_hifz_faces' => 'TINYINT UNSIGNED NOT NULL DEFAULT 2',
        'daily_rabt_faces' => 'TINYINT UNSIGNED NOT NULL DEFAULT 2',
        'daily_muraja_faces' => 'TINYINT UNSIGNED NOT NULL DEFAULT 2',
        'faces_per_half' => 'TINYINT UNSIGNED NOT NULL DEFAULT 1',
        'faces_per_one' => 'TINYINT UNSIGNED NOT NULL DEFAULT 2',
        'faces_per_two' => 'TINYINT UNSIGNED NOT NULL DEFAULT 4',
    ];
    if (plans_table_exists($pdo, 'education_plans')) {
        $after = 'segment_count';
        foreach ($planCols as $col => $def) {
            if (!plans_column_exists($pdo, 'education_plans', $col)) {
                $pdo->exec("ALTER TABLE `education_plans` ADD COLUMN `$col` $def AFTER `$after`");
            }
            $after = $col;
        }
    }
    if (plans_table_exists($pdo, 'student_plan_assignments')) {
        $after = 'start_muraja_segment';
        if (!plans_column_exists($pdo, 'student_plan_assignments', 'start_muraja_segment')) {
            if (plans_column_exists($pdo, 'student_plan_assignments', 'plan_start_date')) {
                $after = 'plan_start_date';
            } else {
                $after = 'start_segment_index';
            }
        }
        foreach ($planCols as $col => $def) {
            if (!plans_column_exists($pdo, 'student_plan_assignments', $col)) {
                $pdo->exec("ALTER TABLE `student_plan_assignments` ADD COLUMN `$col` $def AFTER `$after`");
            }
            $after = $col;
        }
    }
}

function plans_face_row(array $row): array
{
    return [
        'daily_hifz_faces' => (int) ($row['daily_hifz_faces'] ?? 2),
        'daily_rabt_faces' => (int) ($row['daily_rabt_faces'] ?? 2),
        'daily_muraja_faces' => (int) ($row['daily_muraja_faces'] ?? 2),
        'faces_per_half' => (int) ($row['faces_per_half'] ?? 1),
        'faces_per_one' => (int) ($row['faces_per_one'] ?? 2),
        'faces_per_two' => (int) ($row['faces_per_two'] ?? 4),
    ];
}

function plan_row(array $row): array
{
    return array_merge([
        'id' => $row['id'],
        'track' => $row['track'],
        'level_number' => (int) $row['level_number'],
        'title' => $row['title'],
        'segment_count' => (int) $row['segment_count'],
        'created_at' => $row['created_at'] ?? null,
    ], plans_face_row($row));
}

function segment_row(array $row): array
{
    return [
        'id' => $row['id'],
        'plan_id' => $row['plan_id'],
        'segment_index' => (int) $row['segment_index'],
        'hifz_plan' => $row['hifz_plan'],
        'rabt_plan' => $row['rabt_plan'],
        'muraja_plan' => $row['muraja_plan'],
    ];
}

function completion_row(array $row): array
{
    return [
        'segment_index' => (int) $row['segment_index'],
        'task_type' => $row['task_type'],
        'completed_at' => $row['completed_at'],
        'recorded_by' => $row['recorded_by'],
    ];
}

/** Map quick-tap value to segment count by track. */
function plans_segments_for_tap(string $track, string $tap): int
{
    if ($track === 'gold') {
        return match ($tap) {
            'one' => 1,
            'two' => 2,
            default => 0,
        };
    }
    return match ($tap) {
        'half' => 1,
        'one' => 2,
        'two' => 4,
        default => 0,
    };
}

function handle_list_plans(): void
{
    $auth = require_auth();
    $cid = require_complex_id($auth);
    plans_require_roles($auth, ['supervisor', 'secretary', 'teacher', 'assistant']);
    $pdo = db();
    if (!plans_table_exists($pdo, 'education_plans')) {
        error_response('نفّذ migrate-education-plans.sql على قاعدة البيانات أولاً', 503);
    }
    plans_ensure_daily_faces_columns($pdo);
    $tenants = plans_tenant_enabled($pdo);
    $track = isset($_GET['track']) ? trim((string) $_GET['track']) : '';
    $sql = 'SELECT id, track, level_number, title, segment_count,
            daily_hifz_faces, daily_rabt_faces, daily_muraja_faces,
            faces_per_half, faces_per_one, faces_per_two, created_at
            FROM education_plans';
    $params = [];
    $where = [];
    if ($tenants) {
        $where[] = 'complex_id = ?';
        $params[] = $cid;
    }
    if ($track === 'gold' || $track === 'silver') {
        $where[] = 'track = ?';
        $params[] = $track;
    }
    if (count($where) > 0) {
        $sql .= ' WHERE ' . implode(' AND ', $where);
    }
    $sql .= ' ORDER BY track, level_number';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    json_response(array_map('plan_row', $stmt->fetchAll()));
}

function handle_plan_detail(): void
{
    $auth = require_auth();
    $cid = require_complex_id($auth);
    plans_require_roles($auth, ['supervisor', 'secretary', 'teacher', 'assistant', 'manager']);
    $planId = trim((string) ($_GET['plan_id'] ?? ''));
    if ($planId === '') {
        error_response('plan_id مطلوب');
    }
    $pdo = db();
    if (!plans_table_exists($pdo, 'education_plans')) {
        error_response('جداول الخطط غير مُنشأة بعد', 503);
    }
    $tenants = plans_tenant_enabled($pdo);
    if ($tenants) {
        $stmt = $pdo->prepare(
            'SELECT id, track, level_number, title, segment_count,
                    daily_hifz_faces, daily_rabt_faces, daily_muraja_faces,
                    faces_per_half, faces_per_one, faces_per_two, created_at
             FROM education_plans WHERE id = ? AND complex_id = ?'
        );
        $stmt->execute([$planId, $cid]);
    } else {
        $stmt = $pdo->prepare(
            'SELECT id, track, level_number, title, segment_count,
                    daily_hifz_faces, daily_rabt_faces, daily_muraja_faces,
                    faces_per_half, faces_per_one, faces_per_two, created_at
             FROM education_plans WHERE id = ?'
        );
        $stmt->execute([$planId]);
    }
    $plan = $stmt->fetch();
    if (!$plan) {
        error_response('الخطة غير موجودة', 404);
    }
    $segStmt = $pdo->prepare(
        'SELECT id, plan_id, segment_index, hifz_plan, rabt_plan, muraja_plan
         FROM plan_segments WHERE plan_id = ? ORDER BY segment_index'
    );
    $segStmt->execute([$planId]);
    json_response([
        'plan' => plan_row($plan),
        'segments' => array_map('segment_row', $segStmt->fetchAll()),
    ]);
}

function handle_import_plans(): void
{
    $auth = require_auth();
    $cid = require_complex_id($auth);
    plans_require_roles($auth, ['supervisor']);
    $input = json_input();
    $plans = $input['plans'] ?? [];
    if (!is_array($plans) || count($plans) === 0) {
        error_response('لا توجد خطط للاستيراد');
    }
    $pdo = db();
    if (!plans_table_exists($pdo, 'education_plans')) {
        error_response('نفّذ migrate-education-plans.sql على قاعدة البيانات أولاً', 503);
    }
    $tenants = plans_tenant_enabled($pdo);

    $imported = 0;
    $segmentsTotal = 0;
    $pdo->beginTransaction();
    try {
        foreach ($plans as $p) {
            if (!is_array($p)) {
                continue;
            }
            $track = ($p['track'] ?? '') === 'silver' ? 'silver' : 'gold';
            $level = (int) ($p['level_number'] ?? 0);
            $title = trim((string) ($p['title'] ?? ''));
            $segments = $p['segments'] ?? [];
            if ($level < 1 || !is_array($segments) || count($segments) === 0) {
                continue;
            }
            if ($title === '') {
                $title = $track === 'gold' ? "جزء $level" : "مرحلة $level";
            }

            $planId = new_uuid();
            if ($tenants) {
                $exist = $pdo->prepare(
                    'SELECT id FROM education_plans WHERE complex_id = ? AND track = ? AND level_number = ?'
                );
                $exist->execute([$cid, $track, $level]);
            } else {
                $exist = $pdo->prepare('SELECT id FROM education_plans WHERE track = ? AND level_number = ?');
                $exist->execute([$track, $level]);
            }
            $existing = $exist->fetch();
            if ($existing) {
                $planId = $existing['id'];
                if ($tenants) {
                    $upd = $pdo->prepare(
                        'UPDATE education_plans SET title = ?, segment_count = ? WHERE id = ? AND complex_id = ?'
                    );
                    $upd->execute([$title, count($segments), $planId, $cid]);
                } else {
                    $upd = $pdo->prepare(
                        'UPDATE education_plans SET title = ?, segment_count = ? WHERE id = ?'
                    );
                    $upd->execute([$title, count($segments), $planId]);
                }
                $pdo->prepare('DELETE FROM plan_segments WHERE plan_id = ?')->execute([$planId]);
            } elseif ($tenants) {
                $pdo->prepare(
                    'INSERT INTO education_plans (id, complex_id, track, level_number, title, segment_count)
                     VALUES (?, ?, ?, ?, ?, ?)'
                )->execute([$planId, $cid, $track, $level, $title, count($segments)]);
            } else {
                $pdo->prepare(
                    'INSERT INTO education_plans (id, track, level_number, title, segment_count)
                     VALUES (?, ?, ?, ?, ?)'
                )->execute([$planId, $track, $level, $title, count($segments)]);
            }

            $segIns = $pdo->prepare(
                'INSERT INTO plan_segments (id, plan_id, segment_index, hifz_plan, rabt_plan, muraja_plan)
                 VALUES (?, ?, ?, ?, ?, ?)'
            );
            $idx = 0;
            foreach ($segments as $seg) {
                if (!is_array($seg)) {
                    continue;
                }
                $idx++;
                $segIns->execute([
                    new_uuid(),
                    $planId,
                    (int) ($seg['segment_index'] ?? $idx),
                    trim((string) ($seg['hifz_plan'] ?? '')),
                    trim((string) ($seg['rabt_plan'] ?? '')),
                    trim((string) ($seg['muraja_plan'] ?? '')),
                ]);
                $segmentsTotal++;
            }
            $imported++;
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        error_response('فشل الاستيراد: ' . $e->getMessage(), 500);
    }

    json_response(['ok' => true, 'plans_imported' => $imported, 'segments_imported' => $segmentsTotal]);
}

function plans_plan_phase(int $levelNumber): int
{
    return $levelNumber % 1000;
}

function assignment_row(array $row): array
{
    return array_merge([
        'id' => $row['id'],
        'student_id' => $row['student_id'],
        'plan_id' => $row['plan_id'],
        'start_segment_index' => (int) $row['start_segment_index'],
        'plan_start_date' => $row['plan_start_date'] ?? null,
        'start_muraja_segment' => isset($row['start_muraja_segment']) && $row['start_muraja_segment'] !== null
            ? (int) $row['start_muraja_segment'] : null,
        'status' => $row['status'],
        'assigned_by' => $row['assigned_by'],
        'assigned_at' => $row['assigned_at'] ?? null,
        'frozen_at' => $row['frozen_at'] ?? null,
    ], plans_face_row($row));
}

/** Next segment index to complete for a task (single segment). */
function plans_next_segment_for_task(
    string $taskType,
    int $startHifz,
    ?int $startMuraja,
    int $planLevel,
    array $allSegs,
    array $hifzDone,
    array $taskDone,
): ?int {
    $phase = plans_plan_phase($planLevel);
    $ordered = array_values(array_filter($allSegs, static fn ($s) => $s >= $startHifz));
    sort($ordered);

    if ($taskType === 'hifz') {
        foreach ($ordered as $seg) {
            if (!in_array($seg, $taskDone, true)) {
                return $seg;
            }
        }
        return null;
    }

    if ($taskType === 'muraja' && $phase === 1) {
        $start = $startMuraja ?? $startHifz;
        $murOrdered = array_values(array_filter($allSegs, static fn ($s) => $s >= $start));
        sort($murOrdered);
        foreach ($murOrdered as $seg) {
            if (!in_array($seg, $taskDone, true)) {
                return $seg;
            }
        }
        return null;
    }

    foreach ($ordered as $seg) {
        if (!in_array($seg, $hifzDone, true)) {
            continue;
        }
        if (!in_array($seg, $taskDone, true)) {
            return $seg;
        }
    }
    return null;
}

/** Segments to apply for hifz quick-tap. */
function plans_next_hifz_segments_for_tap(
    string $track,
    string $tap,
    int $startHifz,
    array $allSegs,
    array $hifzDone,
): array {
    $count = plans_segments_for_tap($track, $tap);
    if ($count < 1) {
        return [];
    }
    $ordered = array_values(array_filter($allSegs, static fn ($s) => $s >= $startHifz));
    sort($ordered);
    $next = [];
    foreach ($ordered as $seg) {
        if (!in_array($seg, $hifzDone, true)) {
            $next[] = $seg;
            if (count($next) >= $count) {
                break;
            }
        }
    }
    return $next;
}

function handle_assign_plan(): void
{
    $auth = require_auth();
    $cid = require_complex_id($auth);
    plans_require_roles($auth, ['supervisor']);
    $input = json_input();
    $studentId = trim((string) ($input['student_id'] ?? ''));
    $planId = trim((string) ($input['plan_id'] ?? ''));
    $startSegment = max(1, (int) ($input['start_segment_index'] ?? 1));
    $startMuraja = isset($input['start_muraja_segment']) ? max(1, (int) $input['start_muraja_segment']) : null;
    $planStartDate = trim((string) ($input['plan_start_date'] ?? ''));
    if ($studentId === '' || $planId === '') {
        error_response('student_id و plan_id مطلوبان');
    }
    $pdo = db();
    if (!plans_table_exists($pdo, 'education_plans')) {
        error_response('نفّذ migrate-education-plans.sql على قاعدة البيانات أولاً', 503);
    }
    $tenants = plans_tenant_enabled($pdo);
    plans_assert_student_in_complex($pdo, $studentId, $cid, $tenants);
    plans_assert_plan_in_complex($pdo, $planId, $cid, $tenants);

    try {
        plans_ensure_assignment_v2_columns($pdo);
        plans_ensure_daily_faces_columns($pdo);

        if ($tenants) {
            $planStmt = $pdo->prepare(
                'SELECT level_number, daily_hifz_faces, daily_rabt_faces, daily_muraja_faces,
                        faces_per_half, faces_per_one, faces_per_two
                 FROM education_plans WHERE id = ? AND complex_id = ?'
            );
            $planStmt->execute([$planId, $cid]);
        } else {
            $planStmt = $pdo->prepare(
                'SELECT level_number, daily_hifz_faces, daily_rabt_faces, daily_muraja_faces,
                        faces_per_half, faces_per_one, faces_per_two
                 FROM education_plans WHERE id = ?'
            );
            $planStmt->execute([$planId]);
        }
        $planRow = $planStmt->fetch();
        if (!$planRow) {
            error_response('الخطة غير موجودة', 404);
        }
        if (plans_plan_phase((int) $planRow['level_number']) !== 1) {
            $startMuraja = null;
        }

        $faces = plans_face_row(array_merge($planRow, [
            'daily_hifz_faces' => $input['daily_hifz_faces'] ?? $planRow['daily_hifz_faces'],
            'daily_rabt_faces' => $input['daily_rabt_faces'] ?? $planRow['daily_rabt_faces'],
            'daily_muraja_faces' => $input['daily_muraja_faces'] ?? $planRow['daily_muraja_faces'],
            'faces_per_half' => $input['faces_per_half'] ?? $planRow['faces_per_half'],
            'faces_per_one' => $input['faces_per_one'] ?? $planRow['faces_per_one'],
            'faces_per_two' => $input['faces_per_two'] ?? $planRow['faces_per_two'],
        ]));

        $pdo->prepare(
            "UPDATE student_plan_assignments SET status = 'transferred' WHERE student_id = ? AND status = 'active'"
        )->execute([$studentId]);

        $id = new_uuid();
        $name = (string) ($auth['name'] ?? 'المشرف');
        $dateVal = $planStartDate !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $planStartDate) ? $planStartDate : null;

        $pdo->prepare(
            'INSERT INTO student_plan_assignments
             (id, student_id, plan_id, start_segment_index, plan_start_date, start_muraja_segment,
              daily_hifz_faces, daily_rabt_faces, daily_muraja_faces,
              faces_per_half, faces_per_one, faces_per_two,
              status, assigned_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, \'active\', ?)'
        )->execute([
            $id, $studentId, $planId, $startSegment, $dateVal, $startMuraja,
            $faces['daily_hifz_faces'], $faces['daily_rabt_faces'], $faces['daily_muraja_faces'],
            $faces['faces_per_half'], $faces['faces_per_one'], $faces['faces_per_two'],
            $name,
        ]);

        json_response(['ok' => true, 'assignment_id' => $id]);
    } catch (Throwable $e) {
        error_response('فشل ربط الطالب: ' . $e->getMessage(), 500);
    }
}

function handle_patch_assignment_quotas(): void
{
    $auth = require_auth();
    $cid = require_complex_id($auth);
    plans_require_roles($auth, ['supervisor']);
    $input = json_input();
    $studentId = trim((string) ($input['student_id'] ?? ''));
    if ($studentId === '') {
        error_response('student_id مطلوب');
    }
    $pdo = db();
    $tenants = plans_tenant_enabled($pdo);
    plans_assert_student_in_complex($pdo, $studentId, $cid, $tenants);
    plans_ensure_daily_faces_columns($pdo);
    $faces = plans_face_row($input);
    $stmt = $pdo->prepare(
        'UPDATE student_plan_assignments
         SET daily_hifz_faces = ?, daily_rabt_faces = ?, daily_muraja_faces = ?,
             faces_per_half = ?, faces_per_one = ?, faces_per_two = ?
         WHERE student_id = ? AND status IN (\'active\', \'frozen\')'
    );
    $stmt->execute([
        $faces['daily_hifz_faces'], $faces['daily_rabt_faces'], $faces['daily_muraja_faces'],
        $faces['faces_per_half'], $faces['faces_per_one'], $faces['faces_per_two'],
        $studentId,
    ]);
    json_response(['ok' => true, 'updated' => $stmt->rowCount()]);
}

function handle_patch_assignment(): void
{
    $auth = require_auth();
    $cid = require_complex_id($auth);
    plans_require_roles($auth, ['supervisor']);
    $input = json_input();
    $studentId = trim((string) ($input['student_id'] ?? ''));
    $status = trim((string) ($input['status'] ?? ''));
    if ($studentId === '' || !in_array($status, ['active', 'frozen', 'transferred'], true)) {
        error_response('بيانات غير صالحة');
    }
    $pdo = db();
    $tenants = plans_tenant_enabled($pdo);
    plans_assert_student_in_complex($pdo, $studentId, $cid, $tenants);
    $frozenAt = $status === 'frozen' ? date('Y-m-d H:i:s') : null;
    $stmt = $pdo->prepare(
        'UPDATE student_plan_assignments SET status = ?, frozen_at = ?
         WHERE student_id = ? AND status IN (\'active\', \'frozen\')'
    );
    $stmt->execute([$status, $frozenAt, $studentId]);
    json_response(['ok' => true, 'updated' => $stmt->rowCount()]);
}

/** @return array<string, mixed>|null */
function plans_fetch_education_plan(PDO $pdo, string $planId, int $cid, bool $tenants): ?array
{
    $cols = 'id, track, level_number, title, segment_count,
             daily_hifz_faces, daily_rabt_faces, daily_muraja_faces,
             faces_per_half, faces_per_one, faces_per_two, created_at';

    if ($tenants) {
        $stmt = $pdo->prepare("SELECT $cols FROM education_plans WHERE id = ? AND complex_id = ?");
        $stmt->execute([$planId, $cid]);
        $plan = $stmt->fetch();
        if ($plan) {
            return $plan;
        }

        $legacy = $pdo->prepare("SELECT $cols, complex_id FROM education_plans WHERE id = ?");
        $legacy->execute([$planId]);
        $row = $legacy->fetch();
        if (!$row) {
            return null;
        }
        $rowCid = isset($row['complex_id']) ? (int) $row['complex_id'] : 0;
        if ($rowCid === 0) {
            $pdo->prepare('UPDATE education_plans SET complex_id = ? WHERE id = ?')->execute([$cid, $planId]);
            unset($row['complex_id']);
            return $row;
        }
        return null;
    }

    $stmt = $pdo->prepare("SELECT $cols FROM education_plans WHERE id = ?");
    $stmt->execute([$planId]);
    $plan = $stmt->fetch();
    return $plan ?: null;
}

function handle_student_plan_sheet(): void
{
    $auth = require_auth();
    $cid = require_complex_id($auth);
    $role = (string) ($auth['role'] ?? '');
    $studentId = trim((string) ($_GET['student_id'] ?? ''));
    if ($studentId === '') {
        error_response('student_id مطلوب');
    }

    $pdo = db();
    $tenants = plans_tenant_enabled($pdo);

    if ($role === 'student' || $role === 'parent') {
        if (($auth['studentId'] ?? '') !== $studentId) {
            error_response('Forbidden', 403);
        }
        plans_assert_student_in_complex($pdo, $studentId, $cid, $tenants);
    } elseif ($role === 'teacher' || $role === 'assistant') {
        plans_assert_teacher_student_access($pdo, $auth, $studentId, $tenants);
    } elseif (!in_array($role, ['supervisor', 'secretary', 'manager'], true)) {
        error_response('Forbidden', 403);
    } else {
        plans_assert_student_in_complex($pdo, $studentId, $cid, $tenants);
    }

    if (!plans_table_exists($pdo, 'education_plans')) {
        error_response('نفّذ migrate-education-plans.sql على قاعدة البيانات أولاً', 503);
    }

    try {
        plans_ensure_assignment_v2_columns($pdo);
        plans_ensure_daily_faces_columns($pdo);

        $assignStmt = $pdo->prepare(
            'SELECT id, student_id, plan_id, start_segment_index, plan_start_date, start_muraja_segment,
                    daily_hifz_faces, daily_rabt_faces, daily_muraja_faces,
                    faces_per_half, faces_per_one, faces_per_two,
                    status, assigned_by, assigned_at, frozen_at
             FROM student_plan_assignments
             WHERE student_id = ? AND status IN (\'active\', \'frozen\')
             ORDER BY assigned_at DESC LIMIT 1'
        );
        $assignStmt->execute([$studentId]);
        $assignment = $assignStmt->fetch();
        if (!$assignment) {
            json_response(['assignment' => null, 'plan' => null, 'segments' => [], 'completions' => []]);
            return;
        }

        $planId = $assignment['plan_id'];
        $plan = plans_fetch_education_plan($pdo, $planId, $cid, $tenants);

        $segStmt = $pdo->prepare(
            'SELECT id, plan_id, segment_index, hifz_plan, rabt_plan, muraja_plan
             FROM plan_segments WHERE plan_id = ? ORDER BY segment_index'
        );
        $segStmt->execute([$planId]);

        $compStmt = $pdo->prepare(
            'SELECT segment_index, task_type, completed_at, recorded_by
             FROM segment_completions WHERE student_id = ? AND plan_id = ?'
        );
        $compStmt->execute([$studentId, $planId]);

        json_response([
            'assignment' => assignment_row($assignment),
            'plan' => $plan ? plan_row($plan) : null,
            'segments' => array_map('segment_row', $segStmt->fetchAll()),
            'completions' => array_map('completion_row', $compStmt->fetchAll()),
        ]);
    } catch (PDOException $e) {
        error_response(pdo_api_error_message($e), 500);
    } catch (Throwable $e) {
        error_response('فشل تحميل ورقة الخطة: ' . $e->getMessage(), 500);
    }
}

function handle_apply_plan_input(): void
{
    $auth = require_auth();
    $cid = require_complex_id($auth);
    plans_require_roles($auth, ['teacher', 'assistant', 'manager']);
    $input = json_input();
    $studentId = trim((string) ($input['student_id'] ?? ''));
    $taskType = trim((string) ($input['task_type'] ?? ''));
    $tap = trim((string) ($input['tap'] ?? ''));
    $completedDate = trim((string) ($input['completed_at'] ?? date('Y-m-d')));

    if ($studentId === '' || !in_array($taskType, ['hifz', 'rabt', 'muraja'], true)) {
        error_response('بيانات غير صالحة');
    }
    if (!in_array($tap, ['half', 'one', 'two'], true)) {
        error_response('قيمة الإدخال غير صالحة');
    }

    $pdo = db();
    $tenants = plans_tenant_enabled($pdo);
    $role = (string) ($auth['role'] ?? '');
    if ($role === 'teacher' || $role === 'assistant') {
        plans_assert_teacher_student_access($pdo, $auth, $studentId, $tenants);
    } else {
        plans_assert_student_in_complex($pdo, $studentId, $cid, $tenants);
    }

    if (!plans_table_exists($pdo, 'education_plans')) {
        error_response('جداول الخطط غير مُنشأة بعد', 503);
    }

    try {
        plans_ensure_assignment_v2_columns($pdo);
    } catch (Throwable $e) {
        error_response('جداول الربط تحتاج تحديثاً: ' . $e->getMessage(), 500);
    }

    $assignStmt = $pdo->prepare(
        'SELECT spa.plan_id, spa.start_segment_index, spa.start_muraja_segment, ep.track, ep.level_number
         FROM student_plan_assignments spa
         JOIN education_plans ep ON ep.id = spa.plan_id
         WHERE spa.student_id = ? AND spa.status = \'active\'
         ORDER BY spa.assigned_at DESC LIMIT 1'
    );
    $assignStmt->execute([$studentId]);
    $assignment = $assignStmt->fetch();
    if (!$assignment) {
        error_response('الطالب غير مربوط بخطة نشطة');
    }

    $track = (string) $assignment['track'];
    $planId = $assignment['plan_id'];
    $startSeg = (int) $assignment['start_segment_index'];
    $startMuraja = isset($assignment['start_muraja_segment']) && $assignment['start_muraja_segment'] !== null
        ? (int) $assignment['start_muraja_segment'] : null;
    $planLevel = (int) $assignment['level_number'];

    $segStmt = $pdo->prepare(
        'SELECT segment_index FROM plan_segments WHERE plan_id = ? ORDER BY segment_index'
    );
    $segStmt->execute([$planId]);
    $allSegs = array_map('intval', array_column($segStmt->fetchAll(), 'segment_index'));

    $compStmt = $pdo->prepare(
        'SELECT segment_index, task_type FROM segment_completions WHERE student_id = ? AND plan_id = ?'
    );
    $compStmt->execute([$studentId, $planId]);
    $allComps = $compStmt->fetchAll();
    $hifzDone = array_map('intval', array_column(
        array_filter($allComps, static fn ($c) => $c['task_type'] === 'hifz'),
        'segment_index',
    ));
    $taskDone = array_map('intval', array_column(
        array_filter($allComps, static fn ($c) => $c['task_type'] === $taskType),
        'segment_index',
    ));

    if ($taskType === 'hifz') {
        $count = plans_segments_for_tap($track, $tap);
        if ($count < 1) {
            error_response('هذا الإدخال غير متاح لمسار الطالب');
        }
        $nextSegs = plans_next_hifz_segments_for_tap($track, $tap, $startSeg, $allSegs, $hifzDone);
    } else {
        if ($tap !== 'one' && $tap !== 'half') {
            error_response('ربط/مراجعة: مجتاز فقط');
        }
        $next = plans_next_segment_for_task(
            $taskType,
            $startSeg,
            $startMuraja,
            $planLevel,
            $allSegs,
            $hifzDone,
            $taskDone,
        );
        $nextSegs = $next !== null ? [$next] : [];
    }

    if (count($nextSegs) === 0) {
        error_response('لا توجد مقاطع متبقية لهذه المهمة');
    }

    $recorder = (string) ($auth['name'] ?? 'المعلم');
    $ins = $pdo->prepare(
        'INSERT INTO segment_completions (id, student_id, plan_id, segment_index, task_type, completed_at, recorded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE completed_at = VALUES(completed_at), recorded_by = VALUES(recorded_by)'
    );
    $applied = [];
    foreach ($nextSegs as $seg) {
        $compDate = $taskType === 'hifz' ? $completedDate : date('Y-m-d');
        $ins->execute([new_uuid(), $studentId, $planId, $seg, $taskType, $compDate, $recorder]);
        $applied[] = $seg;
    }

    json_response([
        'ok' => true,
        'applied_segments' => $applied,
        'task_type' => $taskType,
        'completed_at' => $taskType === 'hifz' ? $completedDate : null,
    ]);
}

function handle_delete_plan(): void
{
    $auth = require_auth();
    $cid = require_complex_id($auth);
    plans_require_roles($auth, ['supervisor', 'manager']);

    $planId = trim((string) ($_GET['plan_id'] ?? ''));
    if ($planId === '') {
        $input = json_input();
        $planId = trim((string) ($input['plan_id'] ?? ''));
    }
    if ($planId === '') {
        error_response('plan_id مطلوب');
    }

    $pdo = db();
    if (!plans_table_exists($pdo, 'education_plans')) {
        error_response('جداول الخطط غير مُنشأة بعد', 503);
    }

    $tenants = plans_tenant_enabled($pdo);
    if ($tenants) {
        $chk = $pdo->prepare('SELECT id FROM education_plans WHERE id = ? AND complex_id = ?');
        $chk->execute([$planId, $cid]);
    } else {
        $chk = $pdo->prepare('SELECT id FROM education_plans WHERE id = ?');
        $chk->execute([$planId]);
    }
    if (!$chk->fetch()) {
        error_response('الخطة غير موجودة', 404);
    }

    try {
        $pdo->beginTransaction();

        $pdo->prepare('DELETE FROM segment_completions WHERE plan_id = ?')->execute([$planId]);
        $unlinked = $pdo->prepare('DELETE FROM student_plan_assignments WHERE plan_id = ?');
        $unlinked->execute([$planId]);
        $assignmentsRemoved = $unlinked->rowCount();

        $pdo->prepare('DELETE FROM plan_segments WHERE plan_id = ?')->execute([$planId]);

        if ($tenants) {
            $del = $pdo->prepare('DELETE FROM education_plans WHERE id = ? AND complex_id = ?');
            $del->execute([$planId, $cid]);
        } else {
            $del = $pdo->prepare('DELETE FROM education_plans WHERE id = ?');
            $del->execute([$planId]);
        }

        if ($del->rowCount() === 0) {
            $pdo->rollBack();
            error_response('تعذّر حذف الخطة', 500);
        }

        $pdo->commit();
        json_response([
            'ok' => true,
            'assignments_removed' => $assignmentsRemoved,
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_response('فشل حذف الخطة: ' . $e->getMessage(), 500);
    }
}
