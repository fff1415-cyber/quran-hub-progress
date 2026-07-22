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

function plan_row(array $row): array
{
    return [
        'id' => $row['id'],
        'track' => $row['track'],
        'level_number' => (int) $row['level_number'],
        'title' => $row['title'],
        'segment_count' => (int) $row['segment_count'],
        'created_at' => $row['created_at'] ?? null,
    ];
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
    plans_require_roles($auth, ['supervisor', 'secretary', 'teacher', 'assistant']);
    $pdo = db();
    if (!plans_table_exists($pdo, 'education_plans')) {
        json_response([]);
        return;
    }
    $track = isset($_GET['track']) ? trim((string) $_GET['track']) : '';
    $sql = 'SELECT id, track, level_number, title, segment_count, created_at FROM education_plans';
    $params = [];
    if ($track === 'gold' || $track === 'silver') {
        $sql .= ' WHERE track = ?';
        $params[] = $track;
    }
    $sql .= ' ORDER BY track, level_number';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    json_response(array_map('plan_row', $stmt->fetchAll()));
}

function handle_plan_detail(): void
{
    $auth = require_auth();
    plans_require_roles($auth, ['supervisor', 'secretary', 'teacher', 'assistant', 'manager']);
    $planId = trim((string) ($_GET['plan_id'] ?? ''));
    if ($planId === '') {
        error_response('plan_id مطلوب');
    }
    $pdo = db();
    if (!plans_table_exists($pdo, 'education_plans')) {
        error_response('جداول الخطط غير مُنشأة بعد', 503);
    }
    $stmt = $pdo->prepare(
        'SELECT id, track, level_number, title, segment_count, created_at FROM education_plans WHERE id = ?'
    );
    $stmt->execute([$planId]);
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
            $ins = $pdo->prepare(
                'INSERT INTO education_plans (id, track, level_number, title, segment_count)
                 VALUES (?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE title = VALUES(title), segment_count = VALUES(segment_count)'
            );
            // Use upsert by track+level — fetch existing id if duplicate
            $exist = $pdo->prepare('SELECT id FROM education_plans WHERE track = ? AND level_number = ?');
            $exist->execute([$track, $level]);
            $existing = $exist->fetch();
            if ($existing) {
                $planId = $existing['id'];
                $upd = $pdo->prepare(
                    'UPDATE education_plans SET title = ?, segment_count = ? WHERE id = ?'
                );
                $upd->execute([$title, count($segments), $planId]);
                $pdo->prepare('DELETE FROM plan_segments WHERE plan_id = ?')->execute([$planId]);
            } else {
                $ins->execute([$planId, $track, $level, $title, count($segments)]);
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

function handle_assign_plan(): void
{
    $auth = require_auth();
    plans_require_roles($auth, ['supervisor']);
    $input = json_input();
    $studentId = trim((string) ($input['student_id'] ?? ''));
    $planId = trim((string) ($input['plan_id'] ?? ''));
    $startSegment = max(1, (int) ($input['start_segment_index'] ?? 1));
    if ($studentId === '' || $planId === '') {
        error_response('student_id و plan_id مطلوبان');
    }
    $pdo = db();
    $pdo->prepare(
        "UPDATE student_plan_assignments SET status = 'transferred' WHERE student_id = ? AND status = 'active'"
    )->execute([$studentId]);

    $id = new_uuid();
    $name = (string) ($auth['name'] ?? 'المشرف');
    $pdo->prepare(
        'INSERT INTO student_plan_assignments (id, student_id, plan_id, start_segment_index, status, assigned_by)
         VALUES (?, ?, ?, ?, \'active\', ?)'
    )->execute([$id, $studentId, $planId, $startSegment, $name]);

    json_response(['ok' => true, 'assignment_id' => $id]);
}

function handle_patch_assignment(): void
{
    $auth = require_auth();
    plans_require_roles($auth, ['supervisor']);
    $input = json_input();
    $studentId = trim((string) ($input['student_id'] ?? ''));
    $status = trim((string) ($input['status'] ?? ''));
    if ($studentId === '' || !in_array($status, ['active', 'frozen', 'transferred'], true)) {
        error_response('بيانات غير صالحة');
    }
    $pdo = db();
    $frozenAt = $status === 'frozen' ? date('Y-m-d H:i:s') : null;
    $stmt = $pdo->prepare(
        'UPDATE student_plan_assignments SET status = ?, frozen_at = ?
         WHERE student_id = ? AND status IN (\'active\', \'frozen\')'
    );
    $stmt->execute([$status, $frozenAt, $studentId]);
    json_response(['ok' => true, 'updated' => $stmt->rowCount()]);
}

function handle_student_plan_sheet(): void
{
    $auth = require_auth();
    $role = (string) ($auth['role'] ?? '');
    $studentId = trim((string) ($_GET['student_id'] ?? ''));
    if ($studentId === '') {
        error_response('student_id مطلوب');
    }

    if ($role === 'student' || $role === 'parent') {
        if (($auth['studentId'] ?? '') !== $studentId) {
            error_response('Forbidden', 403);
        }
    } elseif ($role === 'teacher' || $role === 'assistant') {
        $halaqaId = (int) ($auth['halaqaId'] ?? 0);
        $pdo = db();
        $st = $pdo->prepare('SELECT halaqa_id FROM students WHERE id = ?');
        $st->execute([$studentId]);
        $row = $st->fetch();
        if (!$row || (int) $row['halaqa_id'] !== $halaqaId) {
            error_response('Forbidden', 403);
        }
    } elseif (!in_array($role, ['supervisor', 'secretary', 'manager'], true)) {
        error_response('Forbidden', 403);
    }

    $pdo = db();
    if (!plans_table_exists($pdo, 'education_plans')) {
        json_response(['assignment' => null, 'plan' => null, 'segments' => [], 'completions' => []]);
        return;
    }

    $assignStmt = $pdo->prepare(
        'SELECT id, student_id, plan_id, start_segment_index, status, assigned_by, assigned_at, frozen_at
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
    $planStmt = $pdo->prepare(
        'SELECT id, track, level_number, title, segment_count, created_at FROM education_plans WHERE id = ?'
    );
    $planStmt->execute([$planId]);
    $plan = $planStmt->fetch();

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
        'assignment' => [
            'id' => $assignment['id'],
            'student_id' => $assignment['student_id'],
            'plan_id' => $assignment['plan_id'],
            'start_segment_index' => (int) $assignment['start_segment_index'],
            'status' => $assignment['status'],
            'assigned_by' => $assignment['assigned_by'],
            'assigned_at' => $assignment['assigned_at'],
            'frozen_at' => $assignment['frozen_at'],
        ],
        'plan' => $plan ? plan_row($plan) : null,
        'segments' => array_map('segment_row', $segStmt->fetchAll()),
        'completions' => array_map('completion_row', $compStmt->fetchAll()),
    ]);
}

function handle_apply_plan_input(): void
{
    $auth = require_auth();
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
    $role = (string) ($auth['role'] ?? '');
    if ($role === 'teacher' || $role === 'assistant') {
        $halaqaId = (int) ($auth['halaqaId'] ?? 0);
        $st = $pdo->prepare('SELECT halaqa_id FROM students WHERE id = ?');
        $st->execute([$studentId]);
        $row = $st->fetch();
        if (!$row || (int) $row['halaqa_id'] !== $halaqaId) {
            error_response('Forbidden', 403);
        }
    }

    if (!plans_table_exists($pdo, 'education_plans')) {
        error_response('جداول الخطط غير مُنشأة بعد', 503);
    }

    $assignStmt = $pdo->prepare(
        'SELECT spa.plan_id, spa.start_segment_index, ep.track
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
    $count = plans_segments_for_tap($track, $tap);
    if ($count < 1) {
        error_response('هذا الإدخال غير متاح لمسار الطالب');
    }

    $planId = $assignment['plan_id'];
    $startSeg = (int) $assignment['start_segment_index'];

    $compStmt = $pdo->prepare(
        'SELECT segment_index FROM segment_completions
         WHERE student_id = ? AND plan_id = ? AND task_type = ?'
    );
    $compStmt->execute([$studentId, $planId, $taskType]);
    $done = array_map('intval', array_column($compStmt->fetchAll(), 'segment_index'));

    $segStmt = $pdo->prepare(
        'SELECT segment_index FROM plan_segments
         WHERE plan_id = ? AND segment_index >= ? ORDER BY segment_index'
    );
    $segStmt->execute([$planId, $startSeg]);
    $allSegs = array_map('intval', array_column($segStmt->fetchAll(), 'segment_index'));

    $nextSegs = [];
    foreach ($allSegs as $seg) {
        if (!in_array($seg, $done, true)) {
            $nextSegs[] = $seg;
            if (count($nextSegs) >= $count) {
                break;
            }
        }
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
        $ins->execute([new_uuid(), $studentId, $planId, $seg, $taskType, $completedDate, $recorder]);
        $applied[] = $seg;
    }

    json_response([
        'ok' => true,
        'applied_segments' => $applied,
        'task_type' => $taskType,
        'completed_at' => $completedDate,
    ]);
}
