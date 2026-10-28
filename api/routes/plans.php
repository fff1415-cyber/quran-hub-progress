<?php

declare(strict_types=1);

require_once __DIR__ . '/plan_integrity.php';
require_once __DIR__ . '/plan_diary.php';
require_once __DIR__ . '/plan_progression.php';

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

/** Roll back an open transaction and return a detailed SQL error for plan endpoints. */
function plans_abort_with_sql_error(PDO $pdo, PDOException $e, string $context): void
{
    if ($pdo->inTransaction()) {
        try {
            $pdo->rollBack();
        } catch (Throwable) {
            /* ignore rollback failure */
        }
    }
    error_response(plans_pdo_diagnostic_message($e, $context), 500);
}

/** Human hint + raw MySQL message (table/column/FK names). */
function plans_pdo_diagnostic_message(PDOException $e, string $context): string
{
    if (function_exists('pdo_is_connection_error') && pdo_is_connection_error($e)) {
        $detail = function_exists('pdo_sql_error_detail') ? pdo_sql_error_detail($e) : $e->getMessage();
        return "[$context] تعذّر الاتصال بقاعدة البيانات — راجع api/config.php (DB_NAME, DB_USER, DB_PASS) | $detail";
    }

    if (function_exists('pdo_api_error_message')) {
        return "[$context] " . pdo_api_error_message($e);
    }

    $detail = function_exists('pdo_sql_error_detail') ? pdo_sql_error_detail($e) : $e->getMessage();
    return "[$context] خطأ SQL | $detail";
}

function plans_assert_import_schema(PDO $pdo): void
{
    if (!plans_table_exists($pdo, 'education_plans')) {
        error_response(
            'جدول education_plans غير موجود — نفّذ database/migrate-education-plans.sql في phpMyAdmin',
            503,
        );
    }
    if (!plans_table_exists($pdo, 'plan_segments')) {
        error_response(
            'جدول plan_segments غير موجود — نفّذ database/migrate-education-plans.sql في phpMyAdmin',
            503,
        );
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
    if (!plans_column_exists($pdo, 'student_plan_assignments', 'transferred_at')) {
        $pdo->exec(
            'ALTER TABLE `student_plan_assignments`
             ADD COLUMN `transferred_at` TIMESTAMP NULL DEFAULT NULL AFTER `frozen_at`'
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

/** Completion rows must belong to the current assignment, not a previous use of the plan. */
function plans_ensure_completion_assignment_column(PDO $pdo): void
{
    if (!plans_column_exists($pdo, 'segment_completions', 'assignment_id')) {
        $pdo->exec('ALTER TABLE segment_completions ADD COLUMN assignment_id CHAR(36) NULL DEFAULT NULL');
    }
}

function plans_track_face_quotas(string $track): array
{
    if ($track === 'gold') {
        return [
            'daily_hifz_faces' => 1,
            'daily_rabt_faces' => 20,
            'daily_muraja_faces' => 20,
            'faces_per_half' => 1,
            'faces_per_one' => 1,
            'faces_per_two' => 2,
        ];
    }
    return [
        'daily_hifz_faces' => 1,
        'daily_rabt_faces' => 10,
        'daily_muraja_faces' => 10,
        'faces_per_half' => 1,
        'faces_per_one' => 1,
        'faces_per_two' => 2,
    ];
}

function plans_face_row(array $row): array
{
    return [
        'daily_hifz_faces' => (int) ($row['daily_hifz_faces'] ?? 1),
        'daily_rabt_faces' => (int) ($row['daily_rabt_faces'] ?? 2),
        'daily_muraja_faces' => (int) ($row['daily_muraja_faces'] ?? 2),
        'faces_per_half' => (int) ($row['faces_per_half'] ?? 1),
        'faces_per_one' => (int) ($row['faces_per_one'] ?? 1),
        'faces_per_two' => (int) ($row['faces_per_two'] ?? 2),
    ];
}

function plan_row(array $row): array
{
    $track = ($row['track'] ?? '') === 'silver' ? 'silver' : 'gold';
    return array_merge([
        'id' => $row['id'],
        'track' => $track,
        'level_number' => (int) $row['level_number'],
        'title' => $row['title'],
        'segment_count' => (int) $row['segment_count'],
        'catalog_archived_at' => $row['catalog_archived_at'] ?? null,
        'created_at' => $row['created_at'] ?? null,
    ], plans_track_face_quotas($track));
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
    plans_require_roles($auth, ['supervisor', 'secretary', 'teacher', 'assistant', 'musammi']);
    $pdo = db();
    try {
        plans_assert_import_schema($pdo);
        plans_ensure_daily_faces_columns($pdo);
        $tenants = plans_tenant_enabled($pdo);
        $track = isset($_GET['track']) ? trim((string) $_GET['track']) : '';
        $sql = 'SELECT id, track, level_number, title, segment_count,
                daily_hifz_faces, daily_rabt_faces, daily_muraja_faces,
                faces_per_half, faces_per_one, faces_per_two, created_at, catalog_archived_at
                FROM education_plans';
        $params = [];
        $where = [];
        if (empty($_GET['include_archived'])) $where[] = 'catalog_archived_at IS NULL';
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
    } catch (PDOException $e) {
        plans_abort_with_sql_error($pdo, $e, 'تحميل قائمة الخطط');
    } catch (Throwable $e) {
        error_response('فشل تحميل الخطط: ' . $e->getMessage(), 500);
    }
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
    $imported = 0;
    $segmentsTotal = 0;

    try {
        plans_assert_import_schema($pdo);
        plans_require_integrity_schema($pdo);
        $tenants = plans_tenant_enabled($pdo);

        $pdo->beginTransaction();
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
                    'SELECT id FROM education_plans WHERE complex_id = ? AND track = ? AND level_number = ? FOR UPDATE'
                );
                $exist->execute([$cid, $track, $level]);
            } else {
                $exist = $pdo->prepare('SELECT id FROM education_plans WHERE track = ? AND level_number = ? FOR UPDATE');
                $exist->execute([$track, $level]);
            }
            $existing = $exist->fetch();
            if ($existing) {
                $planId = $existing['id'];
                plans_pin_existing_content($pdo, $planId);
                if ($tenants) {
                    $upd = $pdo->prepare(
                        'UPDATE education_plans SET title = ?, segment_count = ?, catalog_archived_at = NULL WHERE id = ? AND complex_id = ?'
                    );
                    $upd->execute([$title, count($segments), $planId, $cid]);
                } else {
                    $upd = $pdo->prepare(
                        'UPDATE education_plans SET title = ?, segment_count = ?, catalog_archived_at = NULL WHERE id = ?'
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
    } catch (PDOException $e) {
        plans_abort_with_sql_error($pdo, $e, 'استيراد Excel');
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            try {
                $pdo->rollBack();
            } catch (Throwable) {
                /* ignore */
            }
        }
        error_response('فشل استيراد الخطط: ' . $e->getMessage(), 500);
    }

    json_response(['ok' => true, 'plans_imported' => $imported, 'segments_imported' => $segmentsTotal]);
}

function plans_plan_phase(int $levelNumber): int
{
    return $levelNumber % 1000;
}

/** Excel phase numbers are overall phases; older imports used tier-local numbers. */
function plans_global_phase_from_level(string $track, int $level, array $catalog = []): int
{
    $max = $track === 'gold' ? 30 : 60;
    if ($level > 0 && $level < 1000) return $level <= $max ? $level : 0;
    $ranges = $track === 'gold' ? [[1, 4], [5, 10], [11, 16], [17, 22], [23, 30]]
        : [[1, 8], [9, 20], [21, 33], [34, 42], [43, 60]];
    $slot = intdiv($level, 1000);
    $phase = $level % 1000;
    $range = $ranges[$slot - 1] ?? null;
    if (!$range || $phase < 1) return 0;
    if ($slot > 1) {
        foreach ($catalog as $entry) {
            if ((int) $entry['level_number'] === $slot * 1000 + 1) {
                return plans_legacy_global_phase_from_level($track, $level);
            }
        }
    }
    if ($phase >= $range[0] && $phase <= $range[1]) return $phase;
    if ($track === 'silver' && (($slot === 3 && $phase === 20) || ($slot === 4 && $phase === 33) || ($slot === 5 && $phase === 42))) return $phase;
    return $phase <= $range[1] - $range[0] + 1 ? $range[0] + $phase - 1 : 0;
}

function plans_legacy_global_phase_from_level(string $track, int $level): int
{
    if ($level > 0 && $level < 1000) return $level;
    $ranges = $track === 'gold' ? [[1, 4], [5, 10], [11, 16], [17, 22], [23, 30]]
        : [[1, 8], [9, 20], [21, 32], [33, 44], [45, 60]];
    $slot = intdiv($level, 1000);
    $phase = $level % 1000;
    $range = $ranges[$slot - 1] ?? null;
    if (!$range || $phase < 1) return 0;
    $global = $range[0] + $phase - 1;
    return $global <= ($track === 'gold' ? 30 : 60) ? $global : 0;
}

/** Match the immediate syllabus successor, including split phases and old student links. */
function plans_is_next_catalog_plan(array $catalog, string $track, string $currentId, string $nextId, ?int $studentPhase): bool
{
    $currentIndex = null;
    $nextIndex = null;
    foreach ($catalog as $i => $row) {
        if ($row['id'] === $currentId) $currentIndex = $i;
        if ($row['id'] === $nextId) $nextIndex = $i;
    }
    if ($currentIndex === null || $nextIndex === null) return false;
    $currentLevel = (int) $catalog[$currentIndex]['level_number'];
    $nextLevel = (int) $catalog[$nextIndex]['level_number'];
    $currentPhase = plans_global_phase_from_level($track, $currentLevel, $catalog);
    $nextPhase = plans_global_phase_from_level($track, $nextLevel, $catalog);
    if ($currentPhase < 1 || $nextPhase < 1) return false;

    $legacyPhase = plans_legacy_global_phase_from_level($track, $currentLevel);
    if ($studentPhase !== null && $studentPhase !== $currentPhase && $studentPhase === $legacyPhase) {
        // The old lookup linked this student to a different plan while setting
        // the profile to the intended phase. Do not rewrite the completed sheet.
        if ($nextPhase !== $studentPhase + 1) return false;
        foreach ($catalog as $row) {
            if (plans_global_phase_from_level($track, (int) $row['level_number'], $catalog) === $nextPhase) {
                return $row['id'] === $nextId;
            }
        }
        return false;
    }

    if ($nextIndex !== $currentIndex + 1) return false;
    $fromTier = intdiv($currentLevel, 1000);
    $toTier = intdiv($nextLevel, 1000);
    if ($nextPhase === $currentPhase + 1 && ($toTier === $fromTier || $toTier === $fromTier + 1)) return true;
    return $track === 'silver' && $nextPhase === $currentPhase && (
        ($fromTier === 2 && $toTier === 3 && $nextPhase === 20)
        || ($fromTier === 3 && $toTier === 4 && $nextPhase === 33)
        || ($fromTier === 4 && $toTier === 5 && $nextPhase === 42)
    );
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
        'transferred_at' => $row['transferred_at'] ?? null,
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
        $officialStart = $startMuraja ?? 16;
        // Before segment 16: muraja follows completed hifz (same as rabt).
        foreach ($ordered as $seg) {
            if ($seg >= $officialStart) {
                break;
            }
            if (!in_array($seg, $hifzDone, true)) {
                continue;
            }
            if (!in_array($seg, $taskDone, true)) {
                return $seg;
            }
        }
        // Official muraja track from segment 16+.
        $murOrdered = array_values(array_filter($allSegs, static fn ($s) => $s >= $officialStart));
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
    plans_require_roles($auth, ['supervisor', 'musammi']);
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
                'SELECT title, track, level_number, daily_hifz_faces, daily_rabt_faces, daily_muraja_faces,
                        faces_per_half, faces_per_one, faces_per_two
                 FROM education_plans WHERE id = ? AND complex_id = ?'
            );
            $planStmt->execute([$planId, $cid]);
        } else {
            $planStmt = $pdo->prepare(
                'SELECT title, track, level_number, daily_hifz_faces, daily_rabt_faces, daily_muraja_faces,
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

        $track = ($planRow['track'] ?? '') === 'silver' ? 'silver' : 'gold';
        $faces = plans_track_face_quotas($track);

        plans_require_integrity_schema($pdo);
        $pdo->beginTransaction();
        // Lock the student, including when no active assignment exists.
        $studentColumns = ['id'];
        if (plans_column_exists($pdo, 'students', 'phase_number')) $studentColumns[] = 'phase_number';
        if (plans_column_exists($pdo, 'students', 'level')) $studentColumns[] = 'level';
        $studentStmt = $pdo->prepare('SELECT ' . implode(', ', $studentColumns) . ' FROM students WHERE id = ? FOR UPDATE');
        $studentStmt->execute([$studentId]);
        $studentRow = $studentStmt->fetch();
        if (!empty($input['operation_id'])) {
            $replay = plans_operation_replay($pdo, plans_operation_id($input), $studentId, 'assign', $input, $cid);
            if ($replay !== null) { $pdo->commit(); json_response($replay); return; }
        }
        $lockedPlanStmt=$pdo->prepare('SELECT * FROM education_plans WHERE id = ?'.($tenants?' AND complex_id = ?':'').' FOR UPDATE');
        $lockedPlanStmt->execute($tenants?[$planId,$cid]:[$planId]);$planRow=$lockedPlanStmt->fetch();
        if(!$planRow)throw new RuntimeException('الخطة لم تعد متاحة في هذا الدليل');
        if(!empty($planRow['catalog_archived_at'])&&empty($input['finalize_only']))throw new RuntimeException('أُزيلت الخطة من الدليل؛ حدّث الاختيارات قبل التعيين');
        $track=($planRow['track']??'')==='silver'?'silver':'gold';$faces=plans_track_face_quotas($track);
        $current = plans_current_assignment($pdo, $studentId);
        $snapshot = plans_content_snapshot($pdo, $planId);
        plans_assert_start($snapshot, $startSegment);
        $expected = (string) ($input['expected_assignment_id'] ?? '');
        if (array_key_exists('expected_assignment_id', $input) && ($current['id'] ?? '') !== $expected) {
            throw new RuntimeException('تغيّرت خطة الطالب — حدّث الصفحة قبل الاعتماد');
        }
        $finalize=!empty($input['finalize_only']);
        $catalogStmt=$pdo->prepare($tenants
            ? 'SELECT id,level_number FROM education_plans WHERE complex_id = ? AND track = ? AND (catalog_archived_at IS NULL OR id = ?) ORDER BY level_number'
            : 'SELECT id,level_number FROM education_plans WHERE track = ? AND (catalog_archived_at IS NULL OR id = ?) ORDER BY level_number');
        $catalogStmt->execute($tenants?[$cid,$track,$current['plan_id']??'']:[$track,$current['plan_id']??'']);$catalog=$catalogStmt->fetchAll();
        if($finalize && (!$current || $current['plan_id']!==$planId || !plans_hifz_complete($pdo,$current) || plans_global_phase_from_level($track,(int)$current['level_number'],$catalog)<($track==='gold'?30:60)))throw new RuntimeException('الاعتماد النهائي متاح للخطة الأخيرة المكتملة فقط');
        if (($auth['role'] ?? '') === 'musammi') {
            if ($expected === '' || !$current || $current['track'] !== $planRow['track']) {
                throw new RuntimeException('المسمّع مخوّل بترحيل الخطة الحالية فقط');
            }
            if (!plans_hifz_complete($pdo, $current)) throw new RuntimeException('لم يكتمل حفظ الخطة الحالية');
            $profilePhase = (int) ($studentRow['phase_number'] ?? $studentRow['level'] ?? 0);
            $studentPhase = $profilePhase > 0 ? $profilePhase : null;
            if (!$finalize && !plans_is_next_catalog_plan($catalog, $track, (string) $current['plan_id'], $planId, $studentPhase)) {
                throw new RuntimeException('لا يمكن تجاوز الخطة التالية');
            }
        }

        $id=$current['id']??'';
        $dateVal=$planStartDate!==''&&preg_match('/^\d{4}-\d{2}-\d{2}$/',$planStartDate)?$planStartDate:null;
        if(!$finalize){
        $pdo->prepare(
            "UPDATE student_plan_assignments SET status = 'transferred', transferred_at = NOW() WHERE student_id = ? AND status IN ('active', 'frozen')"
        )->execute([$studentId]);

        $id = new_uuid();
        $name = (string) ($auth['name'] ?? 'المشرف');
        $dateVal = $planStartDate !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $planStartDate) ? $planStartDate : null;

        $pdo->prepare(
            'INSERT INTO student_plan_assignments
             (id, student_id, plan_id, start_segment_index, plan_start_date, start_muraja_segment,
              daily_hifz_faces, daily_rabt_faces, daily_muraja_faces,
              faces_per_half, faces_per_one, faces_per_two,
              status, assigned_by, content_snapshot)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, \'active\', ?, ?)'
        )->execute([
            $id, $studentId, $planId, $startSegment, $dateVal, $startMuraja,
            $faces['daily_hifz_faces'], $faces['daily_rabt_faces'], $faces['daily_muraja_faces'],
            $faces['faces_per_half'], $faces['faces_per_one'], $faces['faces_per_two'],
            $name, app_state_json_encode($snapshot),
        ]);
        }
        $profile=plans_profile_commit($pdo,$cid,$studentId,$planRow,$catalog);
        $passRecords=[];$passedEntry=null;

        $sardQueue = null;
        if (isset($input['sard_result'])) {
            $sard = $input['sard_result'];
            if(isset($sard['semesterId'])&&state_active_semester($pdo,$cid,true)!==$sard['semesterId'])throw new RuntimeException('تغيّر فصل التقييم؛ لم يُحفظ انتقال جزئي');
            $stateTenants = app_state_tenant_enabled($pdo);
            $stateStmt = $pdo->prepare($stateTenants ? "SELECT value FROM app_state WHERE complex_id = ? AND `key` = 'sard_queue' FOR UPDATE" : "SELECT value FROM app_state WHERE `key` = 'sard_queue' FOR UPDATE");
            $stateStmt->execute($stateTenants ? [$cid] : []);
            $sardQueue = json_decode((string) $stateStmt->fetchColumn(), true) ?: [];
            $found = false;
            foreach ($sardQueue as &$entry) {
                if ($entry['id'] !== ($sard['id'] ?? '')) continue;
                if ($entry['studentId'] !== $studentId || (isset($entry['assignmentId']) && $entry['assignmentId'] !== $expected) || ($entry['status'] ?? '') === 'passed') {
                    throw new RuntimeException('تغيّر طلب السرد — حدّث الصفحة');
                }
                if((($entry['phase']??'')==='review_only'||isset($entry['lockedHifzScore']))&&empty($entry['evaluationRules']))throw new RuntimeException('المراجعة القديمة بلا مرجع لقواعد الحفظ المثبت؛ يلزم اعتماد مصدر القواعد قبل الاجتياز');
                $entry['status'] = 'passed';
                $entry['assignmentId'] = $expected;
                $entry['finalPercent'] = (float) ($sard['percent'] ?? 0);
                $entry['phase'] = ($sard['phase'] ?? '') === 'review_only' ? 'review_only' : 'full';
                $entry['passedAt'] = gmdate('c');
                $entry['closedPlanTitle'] = $current['title'] ?? null;
                $entry['newPlanTitle'] = $finalize?null:$planRow['title'];
                $entry['newPlanStartDate'] = $dateVal;
                $passedEntry=$entry;
                $found = true;
            }
            unset($entry);
            if (!$found) throw new RuntimeException('طلب السرد غير محفوظ — حدّث الصفحة');
            $sardQueue = sard_reconcile_queue($sardQueue, sard_current_assignments($pdo, $cid));
            app_state_upsert($pdo, 'sard_queue', $sardQueue, $stateTenants ? $cid : null);
            $passRecords=plans_pass_records($pdo,$cid,$passedEntry,$current,$sard);
        } elseif (($auth['role'] ?? '') === 'musammi') {
            throw new RuntimeException('طلب الاجتياز مطلوب لترحيل الخطة');
        }
        $advance=['completedAssignmentId'=>$current['id']??null,'closedPlanTitle'=>$current['title']??null];
        if(!$finalize)$advance=array_merge($advance,['newPlanId'=>$planId,'newPlanTitle'=>$planRow['title'],'newGlobalPhase'=>$profile['phaseNumber'],'newInstituteLevel'=>$profile['instituteLevel'],'newPlanStartDate'=>$dateVal]);
        if(isset($passRecords['record']))$advance['record']=$passRecords['record'];
        $response = array_merge(['ok'=>true,'assignment_id'=>$id,'sard_queue'=>$sardQueue,'profile'=>$profile,'advance'=>$advance],$passRecords);
        if (!empty($input['operation_id'])) plans_operation_save($pdo, plans_operation_id($input), $studentId, 'assign', $input, $response);
        $pdo->commit();
        json_response($response);
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        plans_abort_with_sql_error($pdo, $e, 'ربط الطالب بالخطة');
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
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
    $trackStmt = $pdo->prepare(
        'SELECT p.track FROM student_plan_assignments a
         JOIN education_plans p ON p.id = a.plan_id
         WHERE a.student_id = ? AND a.status IN (\'active\', \'frozen\')
         LIMIT 1'
    );
    $trackStmt->execute([$studentId]);
    $trackRow = $trackStmt->fetch();
    $track = ($trackRow['track'] ?? '') === 'silver' ? 'silver' : 'gold';
    $faces = plans_track_face_quotas($track);
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
    try {
        plans_require_integrity_schema($pdo);
        $pdo->beginTransaction();
        plans_lock_student($pdo, $studentId);
        $current = plans_current_assignment($pdo, $studentId);
        if (!$current || empty($input['assignment_id']) || $current['id'] !== $input['assignment_id']) {
            throw new RuntimeException('تغيّر تعيين الطالب — حدّث الصفحة قبل تغيير حالته');
        }
        $stmt = $pdo->prepare('UPDATE student_plan_assignments SET status = ?, frozen_at = ?, transferred_at = COALESCE(?, transferred_at) WHERE id = ? AND student_id = ?');
        $stmt->execute([$status, $status === 'frozen' ? date('Y-m-d H:i:s') : null, $status === 'transferred' ? date('Y-m-d H:i:s') : null, $current['id'], $studentId]);
        $pdo->commit();
        json_response(['ok' => true, 'assignment_id' => $current['id'], 'updated' => $stmt->rowCount()]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        error_response($e->getMessage(), $e instanceof PDOException ? 500 : 409);
    }
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
    } elseif (!in_array($role, ['supervisor', 'secretary', 'manager', 'musammi'], true)) {
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
        plans_ensure_completion_assignment_column($pdo);

        $pdo->beginTransaction();
        $assignStmt = $pdo->prepare(
            'SELECT id, student_id, plan_id, start_segment_index, plan_start_date, start_muraja_segment,
                    daily_hifz_faces, daily_rabt_faces, daily_muraja_faces,
                    faces_per_half, faces_per_one, faces_per_two,
                    status, assigned_by, assigned_at, frozen_at, content_snapshot
             FROM student_plan_assignments
             WHERE student_id = ? AND status IN (\'active\', \'frozen\')
             ORDER BY assigned_at DESC LOCK IN SHARE MODE'
        );
        $assignStmt->execute([$studentId]);
        $assignmentRows=$assignStmt->fetchAll();
        if(count($assignmentRows)>1)throw new RuntimeException("تعيينات حالية متعددة محفوظة؛ يلزم مراجعتها دون اختيار تلقائي");
        $assignment=$assignmentRows[0]??null;
        if (!$assignment) {
            $pdo->commit();
            json_response(['assignment' => null, 'plan' => null, 'segments' => [], 'completions' => []]);
            return;
        }

        $planId = $assignment['plan_id'];
        $plan = plans_fetch_education_plan($pdo, $planId, $cid, $tenants);
        $content = plans_assignment_content($pdo, $assignment);
        if ($plan) $plan = $content['plan'];
        $legacyStmt = $pdo->prepare('SELECT segment_index, task_type, completed_at, recorded_by FROM segment_completions WHERE student_id = ? AND plan_id = ? AND assignment_id IS NULL');
        $legacyStmt->execute([$studentId, $planId]);
        $compStmt = $pdo->prepare(
            'SELECT segment_index, task_type, completed_at, recorded_by
             FROM plan_assignment_completions WHERE student_id = ? AND plan_id = ?
               AND assignment_id = ? AND revoked_at IS NULL'
        );
        $compStmt->execute([$studentId, $planId, $assignment['id']]);

        $pdo->commit();
        json_response([
            'assignment' => assignment_row($assignment),
            'plan' => $plan ? plan_row($plan) : null,
            'segments' => array_map('segment_row', $content['segments']),
            'content_provenance' => $content['provenance'],
            'legacy_completions' => array_map('completion_row', $legacyStmt->fetchAll()),
            'completions' => array_map('completion_row', $compStmt->fetchAll()),
        ]);
    } catch (PDOException $e) {
        plans_abort_with_sql_error($pdo, $e, 'ورقة خطة الطالب');
    } catch (Throwable $e) {
        if($pdo->inTransaction())$pdo->rollBack();
        error_response('فشل تحميل ورقة الخطة: ' . $e->getMessage(), 500);
    }
}

function handle_halaqa_plan_status(): void
{
    $auth = require_auth();
    $cid = require_complex_id($auth);
    $role = (string) ($auth['role'] ?? '');
    $halaqaId = (int) ($_GET['halaqa_id'] ?? 0);
    if ($halaqaId <= 0) {
        error_response('halaqa_id مطلوب');
    }

    if ($role === 'teacher' || $role === 'assistant') {
        $authHalaqa = (int) ($auth['halaqaId'] ?? 0);
        if ($authHalaqa !== $halaqaId) {
            error_response('لا يمكنك عرض خطط حلقة أخرى', 403);
        }
    } elseif (!in_array($role, ['supervisor', 'secretary', 'manager', 'musammi'], true)) {
        error_response('Forbidden', 403);
    }

    $pdo = db();
    $tenants = plans_tenant_enabled($pdo);

    if (!plans_table_exists($pdo, 'student_plan_assignments')) {
        json_response(['statuses' => []]);
        return;
    }

    try {
        if (plans_students_tenant_scoped($pdo, $tenants)) {
            $stmt = $pdo->prepare(
                'SELECT spa.student_id, spa.status, spa.assigned_at
                 FROM student_plan_assignments spa
                 INNER JOIN students s ON s.id = spa.student_id
                 WHERE s.halaqa_id = ? AND s.complex_id = ?
                   AND spa.status IN (\'active\', \'frozen\')
                 ORDER BY spa.assigned_at DESC'
            );
            $stmt->execute([$halaqaId, $cid]);
        } else {
            $stmt = $pdo->prepare(
                'SELECT spa.student_id, spa.status, spa.assigned_at
                 FROM student_plan_assignments spa
                 INNER JOIN students s ON s.id = spa.student_id
                 WHERE s.halaqa_id = ?
                   AND spa.status IN (\'active\', \'frozen\')
                 ORDER BY spa.assigned_at DESC'
            );
            $stmt->execute([$halaqaId]);
        }

        $seen = [];
        $statuses = [];
        foreach ($stmt->fetchAll() as $row) {
            $studentId = (string) ($row['student_id'] ?? '');
            if ($studentId === '' || isset($seen[$studentId])) {
                continue;
            }
            $seen[$studentId] = true;
            $status = (string) ($row['status'] ?? '');
            if ($status !== 'active' && $status !== 'frozen') {
                continue;
            }
            $statuses[] = [
                'student_id' => $studentId,
                'status' => $status,
            ];
        }

        json_response(['statuses' => $statuses]);
    } catch (PDOException $e) {
        plans_abort_with_sql_error($pdo, $e, 'حالة خطط الحلقة');
    } catch (Throwable $e) {
        error_response('فشل تحميل حالة الخطط: ' . $e->getMessage(), 500);
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
        plans_require_integrity_schema($pdo);
        if (isset($input['diary'])) {
            try { json_response(plans_record_diary($pdo,$cid,$auth,$input)); return; }
            catch (Throwable $error) { error_response($error->getMessage(),409); }
        }
        $operationId = plans_operation_id($input);
        $pdo->beginTransaction();
        plans_lock_student($pdo, $studentId);
        $replay = plans_operation_replay($pdo, $operationId, $studentId, 'apply', $input, $cid);
        if ($replay !== null) { $pdo->commit(); json_response($replay); return; }
        $assignment = plans_current_assignment($pdo, $studentId);
        if (!$assignment || $assignment['status'] !== 'active') throw new RuntimeException('الطالب غير مربوط بخطة نشطة');
        if (empty($input['expected_assignment_id']) || $input['expected_assignment_id'] !== $assignment['id']) {
            throw new RuntimeException('تغيّرت خطة الطالب — أعد تحميل الصفحة قبل التسجيل');
        }
        $parsedDate = DateTimeImmutable::createFromFormat('!Y-m-d', $completedDate);
        if (!$parsedDate || $parsedDate->format('Y-m-d') !== $completedDate) throw new RuntimeException('تاريخ التسجيل غير صالح');
        $track = (string) $assignment['track'];
        $planId = $assignment['plan_id'];
        $startSeg = (int) $assignment['start_segment_index'];
        $startMuraja = isset($assignment['start_muraja_segment']) && $assignment['start_muraja_segment'] !== null
            ? (int) $assignment['start_muraja_segment'] : null;
        $planLevel = (int) $assignment['level_number'];

        $content = plans_assignment_content($pdo, $assignment);
        $allSegs = array_map('intval', array_column($content['segments'], 'segment_index'));

        $compStmt = $pdo->prepare(
            'SELECT segment_index, task_type FROM plan_assignment_completions WHERE student_id = ? AND plan_id = ?
                   AND assignment_id = ? AND revoked_at IS NULL'
        );
        $compStmt->execute([$studentId, $planId, $assignment['id']]);
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
            'INSERT INTO plan_assignment_completions (id, student_id, plan_id, segment_index, task_type, completed_at, recorded_by, assignment_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE completed_at = VALUES(completed_at), recorded_by = VALUES(recorded_by), revoked_at = NULL'
        );
        $applied = [];
        foreach ($nextSegs as $seg) {
            $compDate = $completedDate;
            $ins->execute([new_uuid(), $studentId, $planId, $seg, $taskType, $compDate, $recorder, $assignment['id']]);
            $applied[] = $seg;
        }

        $response = ['ok' => true, 'applied_segments' => $applied, 'task_type' => $taskType, 'completed_at' => $completedDate, 'assignment_id' => $assignment['id'], 'operation_id' => $operationId];
        plans_operation_save($pdo, $operationId, $studentId, 'apply', $input, $response);
        $pdo->commit();
        json_response($response);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        error_response($e->getMessage(), $e instanceof PDOException ? 500 : 409);
    }
}

function handle_remove_plan_completions(): void
{
    $auth = require_auth();
    $cid = require_complex_id($auth);
    plans_require_roles($auth, ['teacher', 'assistant', 'manager']);
    $input = json_input();
    $studentId = trim((string) ($input['student_id'] ?? ''));
    $taskType = trim((string) ($input['task_type'] ?? 'hifz'));
    $segmentIndexes = $input['segment_indexes'] ?? [];

    if ($studentId === '' || $taskType !== 'hifz') {
        error_response('بيانات غير صالحة');
    }
    if (!is_array($segmentIndexes) || count($segmentIndexes) === 0) {
        json_response(['ok' => true, 'removed' => 0]);
        return;
    }

    $pdo = db();
    $tenants = plans_tenant_enabled($pdo);
    $role = (string) ($auth['role'] ?? '');
    if ($role === 'teacher' || $role === 'assistant') {
        plans_assert_teacher_student_access($pdo, $auth, $studentId, $tenants);
    } else {
        plans_assert_student_in_complex($pdo, $studentId, $cid, $tenants);
    }

    if (!plans_table_exists($pdo, 'plan_assignment_completions')) {
        error_response('جداول الخطط غير مُنشأة بعد', 503);
    }

    $assignmentId = trim((string) ($input['assignment_id'] ?? ''));
    if ($assignmentId === '') error_response('تعيين الإنجاز مطلوب — لا يمكن تخمين خطة اليوم القديم', 409);
    $assignStmt = $pdo->prepare('SELECT id, plan_id FROM student_plan_assignments WHERE id = ? AND student_id = ?');
    $assignStmt->execute([$assignmentId, $studentId]);
    $assignment = $assignStmt->fetch();
    if (!$assignment) error_response('تعيين الإنجاز غير موجود', 409);
    $planId = $assignment['plan_id'];

    $indexes = array_values(array_unique(array_map('intval', $segmentIndexes)));
    $indexes = array_filter($indexes, static fn ($n) => $n > 0);
    if (count($indexes) === 0) {
        json_response(['ok' => true, 'removed' => 0]);
        return;
    }

    $placeholders = implode(',', array_fill(0, count($indexes), '?'));
    $params = array_merge([$studentId, $planId, $assignmentId, $taskType], $indexes);
    $pdo->beginTransaction();
    try {
        plans_lock_student($pdo,$studentId);
        $beforeStmt=$pdo->prepare("SELECT * FROM plan_assignment_completions WHERE student_id = ? AND plan_id = ? AND assignment_id = ? AND task_type = ? AND segment_index IN ($placeholders) AND revoked_at IS NULL FOR UPDATE");
        $beforeStmt->execute($params);$before=$beforeStmt->fetchAll();
        if(plans_table_exists($pdo,'plan_diary_events'))foreach($before as $row)if(!empty($row['operation_id'])){
            $bound=$pdo->prepare('SELECT COUNT(*) FROM plan_diary_events WHERE operation_id = ? AND assignment_id = ? AND revoked_at IS NULL');$bound->execute([$row['operation_id'],$assignmentId]);
            if((int)$bound->fetchColumn()>0)throw new RuntimeException('الإنجاز مرتبط بدرجة يوم؛ استخدم تعديل اليوم المتزامن لحماية الدرجة والخطة');
        }
        $stmt=$pdo->prepare("UPDATE plan_assignment_completions SET revoked_at = NOW() WHERE student_id = ? AND plan_id = ? AND assignment_id = ? AND task_type = ? AND segment_index IN ($placeholders) AND revoked_at IS NULL");
        $stmt->execute($params);$removed=$stmt->rowCount();
        if($removed)plans_operation_save($pdo,new_uuid(),$studentId,'remove',$input,['before'=>$before,'action'=>'revoked','recorded_at'=>gmdate('c')]);
        $pdo->commit();json_response(['ok'=>true,'removed'=>$removed]);
    } catch(Throwable $error) {if($pdo->inTransaction())$pdo->rollBack();error_response($error->getMessage(),409);}
}

/** Edit one hifz row of the current plan, keeping the supervisor's completion queue in sync. */
function handle_supervisor_plan_hifz(): void
{
    $auth = require_auth();
    if (($auth['role'] ?? '') !== 'supervisor') {
        error_response('هذه الصلاحية للمشرف التعليمي فقط', 403);
    }
    $cid = require_complex_id($auth);
    $input = json_input();
    $studentId = trim((string) ($input['student_id'] ?? ''));
    $assignmentId = trim((string) ($input['assignment_id'] ?? ''));
    $segment = (int) ($input['segment_index'] ?? 0);
    $action = (string) ($input['action'] ?? '');
    $date = (string) ($input['completed_at'] ?? '');
    $parsedDate = DateTimeImmutable::createFromFormat('!Y-m-d', $date);
    if ($studentId === '' || $assignmentId === '' || $segment < 1 || !in_array($action, ['complete', 'remove'], true)
        || ($action === 'complete' && (!$parsedDate || $parsedDate->format('Y-m-d') !== $date))) {
        error_response('بيانات تعديل الحفظ غير صالحة');
    }

    $pdo = db();
    if (!plans_table_exists($pdo, 'student_plan_assignments') || !plans_table_exists($pdo, 'plan_assignment_completions')) {
        error_response('جداول الخطط غير مُنشأة بعد', 503);
    }
    $tenants = plans_tenant_enabled($pdo);
    plans_assert_student_in_complex($pdo, $studentId, $cid, $tenants);
    try {
        plans_require_integrity_schema($pdo);
        $pdo->beginTransaction();
        $pdo->prepare('SELECT id FROM students WHERE id = ? FOR UPDATE')->execute([$studentId]);
        plans_current_assignment($pdo, $studentId);
        $assignmentStmt = $pdo->prepare(
            "SELECT a.id, a.student_id, a.plan_id, a.assigned_at, a.start_segment_index, a.content_snapshot, p.title, s.halaqa_id
             FROM student_plan_assignments a
             JOIN education_plans p ON p.id = a.plan_id
             JOIN students s ON s.id = a.student_id
             WHERE a.student_id = ? AND a.status = 'active'
             ORDER BY a.assigned_at DESC LIMIT 1 FOR UPDATE"
        );
        $assignmentStmt->execute([$studentId]);
        $assignment = $assignmentStmt->fetch();
        if (!$assignment || $assignment['id'] !== $assignmentId) {
            throw new RuntimeException('تغيّرت خطة الطالب أو جُمّدت — حدّث الاستمارة');
        }
        plans_assert_plan_in_complex($pdo, (string) $assignment['plan_id'], $cid, $tenants);
        $content = plans_assignment_content($pdo, $assignment);
        if ($segment < (int) $assignment['start_segment_index'] || !in_array($segment, array_map('intval', array_column($content['segments'], 'segment_index')), true)) {
            throw new RuntimeException('هذا اليوم خارج الخطة الحالية');
        }

        $stateTenants = app_state_tenant_enabled($pdo);
        $stateParams = $stateTenants ? [$cid, 'sard_queue'] : ['sard_queue'];
        $stateInsert = $stateTenants
            ? 'INSERT IGNORE INTO app_state (complex_id, `key`, value) VALUES (?, ?, ?)'
            : 'INSERT IGNORE INTO app_state (`key`, value) VALUES (?, ?)';
        $pdo->prepare($stateInsert)->execute(array_merge($stateParams, ['[]']));
        $stateStmt = $pdo->prepare($stateTenants
            ? "SELECT value FROM app_state WHERE complex_id = ? AND `key` = ? FOR UPDATE"
            : "SELECT value FROM app_state WHERE `key` = ? FOR UPDATE");
        $stateStmt->execute($stateParams);
        $queue = sard_reconcile_queue(json_decode((string) $stateStmt->fetchColumn(), true) ?: [], sard_current_assignments($pdo, $cid));
        $queueIndex = null;
        foreach ($queue as $i => $entry) {
            if (($entry['studentId'] ?? '') !== $studentId || ($entry['assignmentId'] ?? '') !== $assignmentId) continue;
            if (in_array(($entry['status'] ?? ''), ['pending', 'scheduled', 'awaiting_review', 'awaiting_supervisor', 'approved_third', 'passed', 'final_failed', 'level_repeat'], true)) {
                throw new RuntimeException('بدأ السرد أو انتهى لهذه الخطة — لا يمكن تعديل حفظها');
            }
            if (($entry['status'] ?? '') === 'plan_completed'
                || ($queueIndex === null && ($entry['status'] ?? '') === 'archived'
                    && ($entry['id'] ?? '') === 'sq-assignment-' . $assignmentId)) {
                $queueIndex = $i;
            }
        }

        $completionStmt = $pdo->prepare(
            "SELECT * FROM plan_assignment_completions
             WHERE student_id = ? AND plan_id = ? AND assignment_id = ? AND segment_index = ? AND task_type = 'hifz' FOR UPDATE"
        );
        $completionStmt->execute([$studentId, $assignment['plan_id'], $assignmentId, $segment]);
        $previousCompletion=$completionStmt->fetch();
        $completion=$previousCompletion&&$previousCompletion['revoked_at']===null?$previousCompletion:null;
        $changed=false;
        if ($action === 'complete' && !$completion) {
            $changed=true;
            $insert = $pdo->prepare(
                "INSERT INTO plan_assignment_completions
                 (id, student_id, plan_id, segment_index, task_type, completed_at, recorded_by, assignment_id)
                 VALUES (?, ?, ?, ?, 'hifz', ?, ?, ?) ON DUPLICATE KEY UPDATE completed_at = VALUES(completed_at), recorded_by = VALUES(recorded_by), revoked_at = NULL"
            );
            $insert->execute([new_uuid(), $studentId, $assignment['plan_id'], $segment, $date, (string) ($auth['name'] ?? 'المشرف التعليمي'), $assignmentId]);
            $pdo->prepare("UPDATE plan_assignment_completions SET operation_id = NULL WHERE assignment_id = ? AND segment_index = ? AND task_type = 'hifz'")->execute([$assignmentId,$segment]);
        } elseif ($action === 'remove' && $completion) {
            $changed=true;
            $delete = $pdo->prepare('UPDATE plan_assignment_completions SET revoked_at = NOW() WHERE id = ?');
            $delete->execute([$completion['id']]);
        }

        if($changed){
            $completionStmt->execute([$studentId,$assignment['plan_id'],$assignmentId,$segment]);
            plans_operation_save($pdo,new_uuid(),$studentId,'supervisor_hifz',$input,['before'=>$previousCompletion?:null,'after'=>$completionStmt->fetch()?:null,'recorded_at'=>gmdate('c')]);
        }
        $isComplete = plans_hifz_complete($pdo, $assignment);
        if (!$isComplete && $queueIndex !== null && ($queue[$queueIndex]['status'] ?? '') === 'plan_completed') {
            $queue[$queueIndex]['status'] = 'archived';
            $queue[$queueIndex]['archiveReason'] = 'supervisor_hifz_removed';
        } elseif ($isComplete && ($queueIndex === null || ($queue[$queueIndex]['status'] ?? '') !== 'plan_completed')) {
            $now = gmdate('c');
            $item = [
                'id' => 'sq-assignment-' . $assignmentId,
                'assignmentId' => $assignmentId,
                'studentId' => $studentId,
                'halaqaId' => (int) $assignment['halaqa_id'],
                'week' => max(1, (int) ($input['week'] ?? 1)),
                'attempt' => 1,
                'status' => 'plan_completed',
                'phase' => 'full',
                'createdAt' => $now,
                'planCompletedAt' => $now,
                'planTitle' => $assignment['title'],
            ];
            if ($queueIndex !== null) {
                $queue[$queueIndex] = $item;
            } else {
                array_unshift($queue, $item);
            }
        }
        $queue = sard_reconcile_queue($queue, sard_current_assignments($pdo, $cid));
        app_state_upsert($pdo, 'sard_queue', $queue, $stateTenants ? $cid : null);
        $pdo->commit();
        json_response(['ok' => true, 'sard_queue' => $queue]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        error_response('تعذّر تعديل حفظ الخطة: ' . $e->getMessage(), $e instanceof PDOException ? 500 : 409);
    }
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

        plans_pin_existing_content($pdo, $planId);
        $pdo->prepare('UPDATE education_plans SET catalog_archived_at = NOW() WHERE id = ?')->execute([$planId]);
        $assignmentsRemoved = 0; // Removal from catalog never erases assignments or completions.

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
