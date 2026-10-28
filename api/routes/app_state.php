<?php

declare(strict_types=1);
require_once __DIR__ . '/app_state_integrity.php';

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
    $role = (string) ($auth['role'] ?? '');
    $cid = require_complex_id($auth);
    $pdo = db();
    $tenants = app_state_tenant_enabled($pdo);
    $keyFilter = (string) ($_GET['key'] ?? '');
    if ($keyFilter === 'staff_tasks_v1') error_response('اعرض المهام من الواجهة المخصصة', 403);

    if (in_array($role, ['test_member', 'test_chair'], true)) {
        $allowed = ['weekly_tests', 'weekly_tests_settings'];
        if ($role === 'test_chair') $allowed = array_merge($allowed, ['staff_attendance', 'staff_attendance_settings']);
        if ($keyFilter !== '' && !in_array($keyFilter, $allowed, true)) error_response('غير مصرح بعرض هذه البيانات', 403);
        $placeholders = implode(',', array_fill(0, count($allowed), '?'));
        $sql = $tenants
            ? "SELECT `key`, value FROM app_state WHERE complex_id = ? AND `key` IN ($placeholders)"
            : "SELECT `key`, value FROM app_state WHERE `key` IN ($placeholders)";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($tenants ? array_merge([$cid], $allowed) : $allowed);
        $rows = $stmt->fetchAll();
        foreach ($rows as &$row) $row = state_present_row($pdo, $cid, $row);
        json_response($keyFilter === '' ? $rows : array_values(array_filter($rows, fn($row) => $row['key'] === $keyFilter)));
    }

    if ($tenants) {
        if ($keyFilter !== '') {
            $stmt = $pdo->prepare('SELECT `key`, value FROM app_state WHERE complex_id = ? AND `key` = ?');
            $stmt->execute([$cid, $keyFilter]);
            $rows = $stmt->fetchAll();
        } else {
            $stmt = $pdo->prepare('SELECT `key`, value FROM app_state WHERE complex_id = ?');
            $stmt->execute([$cid]);
            $rows = $stmt->fetchAll();
        }
    } else if ($keyFilter !== '') {
        $stmt = $pdo->prepare('SELECT `key`, value FROM app_state WHERE `key` = ?');
        $stmt->execute([$keyFilter]);
        $rows = $stmt->fetchAll();
    } else {
        $rows = $pdo->query('SELECT `key`, value FROM app_state')->fetchAll();
    }
    $rows = array_values(array_filter($rows, static fn (array $row): bool => ($row['key'] ?? '') !== 'staff_tasks_v1'));
    foreach ($rows as &$row) {
        $row = state_present_row($pdo, $cid, $row);
        if (($row['key'] ?? '') === 'sard_queue' && is_array($row['value'])) {
            $row['value'] = sard_reconcile_queue($row['value'], sard_current_assignments($pdo, $cid));
        }
    }
    json_response($rows);
}

/** Preserve obsolete requests as history while excluding them from actionable queues. */
function sard_reconcile_queue(array $queue, array $assignments): array
{
    $passed = [];
    foreach ($queue as &$q) {
        if (($q['status'] ?? '') !== 'passed') continue;
        $a = $assignments[$q['studentId'] ?? ''] ?? null;
        if (!empty($q['assignmentId'])) $passed[$q['assignmentId']] = true;
    }
    unset($q);
    $active = ['plan_completed', 'pending', 'scheduled', 'awaiting_review', 'awaiting_supervisor', 'approved_third'];
    foreach ($queue as &$q) {
        if (!in_array($q['status'] ?? '', $active, true)) continue;
        $a = $assignments[$q['studentId'] ?? ''] ?? null;
        $reason = null;
        if (!empty($a['ambiguous'])) $reason='ambiguous_current_assignment';
        elseif (!$a) $reason = 'no_current_assignment';
        elseif (!empty($q['assignmentId']) && $q['assignmentId'] !== $a['id']) $reason = 'previous_assignment';
        elseif (empty($q['assignmentId'])) $reason = 'unverified_legacy_assignment';
        if (!$reason && isset($passed[$a['id']])) $reason = 'already_passed';
        if ($reason) {
            $q['status'] = 'archived';
            $q['archiveReason'] = $reason;
        }
    }
    unset($q);
    // One live request per assignment, including historical duplicates created by different devices.
    $winner = [];
    foreach ($queue as $i => $q) {
        if (!in_array($q['status'] ?? '', $active, true) || empty($q['assignmentId'])) continue;
        $key = $q['assignmentId'];
        if (!isset($winner[$key])) { $winner[$key] = $i; continue; }
        $prior = $winner[$key];
        $currentForwarded = !empty($q['supervisorForwardedAt']);
        $priorForwarded = !empty($queue[$prior]['supervisorForwardedAt']);
        $lose = $currentForwarded && !$priorForwarded ? $prior : $i;
        if ($lose === $prior) $winner[$key] = $i;
        $queue[$lose]['status'] = 'archived';
        $queue[$lose]['archiveReason'] = 'duplicate_assignment_request';
    }
    return $queue;
}

function sard_current_assignments(PDO $pdo, int $cid): array
{
    if (!plans_table_exists($pdo, 'student_plan_assignments')) return [];
    $scoped = table_column_exists($pdo, 'students', 'complex_id');
    $sql = "SELECT a.id, a.student_id, a.plan_id, a.assigned_at, a.start_segment_index, a.content_snapshot, p.title
            FROM student_plan_assignments a JOIN students s ON s.id = a.student_id
            JOIN education_plans p ON p.id = a.plan_id
            WHERE a.status IN ('active', 'frozen')" . ($scoped ? ' AND s.complex_id = ?' : '') . ' ORDER BY a.assigned_at DESC';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($scoped ? [$cid] : []);
    $out = [];
    foreach ($stmt->fetchAll() as $a) {
        $id=$a['student_id'];
        $out[$id]=isset($out[$id])?['ambiguous'=>true,'student_id'=>$id]:$a;
    }
    return $out;
}

/** Compare only modified items under a row lock; stale devices cannot erase other items. */
function app_state_patch_sard(PDO $pdo, int $cid, mixed $value): void
{
    if (!is_array($value) || !isset($value['changes']) || !is_array($value['changes'])) {
        error_response('نسخة الصفحة قديمة — حدّث الصفحة قبل تعديل السرد', 409);
    }
    $tenants = app_state_tenant_enabled($pdo);
    $scope = $tenants ? 'complex_id = ? AND `key` = ?' : '`key` = ?';
    $params = $tenants ? [$cid, 'sard_queue'] : ['sard_queue'];
    plans_ensure_completion_assignment_column($pdo);
    $pdo->beginTransaction();
    try {
        $sql = $tenants ? 'INSERT IGNORE INTO app_state (complex_id, `key`, value) VALUES (?, ?, ?)' : 'INSERT IGNORE INTO app_state (`key`, value) VALUES (?, ?)';
        $pdo->prepare($sql)->execute(array_merge($params, ['[]']));
        $stmt = $pdo->prepare('SELECT value FROM app_state WHERE ' . $scope . ' FOR UPDATE');
        $stmt->execute($params);
        $assignments = sard_current_assignments($pdo, $cid);
        $queue = sard_reconcile_queue(json_decode((string) $stmt->fetchColumn(), true) ?: [], $assignments);
        foreach ($value['changes'] as $change) {
            $item = $change['item'] ?? null;
            if (!is_array($item) || empty($item['id']) || empty($item['studentId'])) throw new RuntimeException('عنصر سرد غير صالح');
            $index = null;
            foreach ($queue as $i => $existing) if ($existing['id'] === $item['id']) { $index = $i; break; }
            $current = $index === null ? null : $queue[$index];
            if ($current == $item) continue; // Idempotent retry.
            $restoreSupervisorHifz = $current
                && ($current['status'] ?? '') === 'archived'
                && ($current['archiveReason'] ?? '') === 'supervisor_hifz_removed'
                && ($item['status'] ?? '') === 'plan_completed'
                && ($item['assignmentId'] ?? '') === ($current['assignmentId'] ?? null);
            if ($current && in_array($current['status'] ?? '', ['archived', 'passed'], true) && ($item['status'] ?? '') !== $current['status'] && !$restoreSupervisorHifz) throw new RuntimeException('هذا الطلب منتهٍ — لا يمكن إعادته لقائمة العمل');
            if ($current != ($change['base'] ?? null)) throw new RuntimeException('تغيّر السرد من جهاز آخر — حدّث الصفحة');
            if (($index === null || $restoreSupervisorHifz) && ($item['status'] ?? '') === 'plan_completed') {
                $a = $assignments[$item['studentId']] ?? null;
                if (!$a || !empty($a['ambiguous']) || empty($item['assignmentId']) || $item['assignmentId'] !== $a['id']) throw new RuntimeException('لا توجد خطة حالية مؤكدة للطلب');
                if (!plans_hifz_complete($pdo, $a)) throw new RuntimeException('لم يكتمل حفظ الخطة الحالية');
            }
            $validated = sard_reconcile_queue([$item], $assignments)[0];
            if (($validated['status'] ?? '') === 'archived' && ($item['status'] ?? '') !== 'archived') throw new RuntimeException('الطلب يخص خطة سابقة — حدّث الصفحة');
            if ($index === null) $queue[] = $validated;
            else $queue[$index] = $validated;
        }
        foreach (($value['removals'] ?? []) as $removal) {
            foreach ($queue as &$entry) {
                if ($entry['id'] !== ($removal['id'] ?? '')) continue;
                if (($entry['status']??'')==='archived'&&($entry['archiveReason']??'')==='removed_by_manager') continue;
                if ($entry != ($removal['base'] ?? null)) throw new RuntimeException('تغيّر الطلب قبل الحذف — حدّث الصفحة');
                if (($entry['status'] ?? '') === 'passed') throw new RuntimeException('لا يمكن حذف سجل الاجتياز');
                $entry['status'] = 'archived';
                $entry['archiveReason'] = 'removed_by_manager';
            }
            unset($entry);
        }
        $queue = sard_reconcile_queue($queue, $assignments);
        app_state_upsert($pdo, 'sard_queue', $queue, $tenants ? $cid : null);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        error_response($e->getMessage(), 409);
    }
}

function handle_set_app_state(): void
{
    $auth = require_auth();
    $cid = require_complex_id($auth);
    $input = json_input();
    $key = (string) ($input['key'] ?? '');
    if ($key === 'late_permissions') error_response('سجّل إذن الدخول من الواجهة المخصصة', 403);
    if ($key === 'staff_tasks_v1') error_response('حدّث المهام من الواجهة المخصصة', 403);
    $role = (string) ($auth['role'] ?? '');
    if (in_array($role, ['test_member', 'test_chair'], true)) {
        $allowed = $role === 'test_chair' ? ['weekly_tests', 'staff_attendance'] : ['weekly_tests'];
        if (!in_array($key, $allowed, true)) error_response('غير مصرح بتعديل هذه البيانات', 403);
        if ($key === 'weekly_tests' && ($input['value'] ?? null) !== []) error_response('سجّل الاختبارات من الواجهة المخصصة', 403);
    }
    if ($key === '') {
        error_response('Missing key');
    }

    $pdo = db();
    if (state_protected_key($key)) {
        json_response(app_state_patch_integrity($pdo, $cid, $key, $input['value'] ?? null));
        return;
    }
    if ($key === 'sard_queue') {
        if (!empty($input['value']['removals']) && $role !== 'manager') error_response('المدير فقط يمكنه إزالة الطلب', 403);
        app_state_patch_sard($pdo, $cid, $input['value'] ?? null);
        json_response(['ok' => true]);
        return;
    }
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
