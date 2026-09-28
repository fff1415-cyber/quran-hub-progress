<?php

declare(strict_types=1);

const STUDENT_FOLLOWUPS_KEY = 'student_followups';

function followups_today(): string
{
    return (new DateTimeImmutable('now', new DateTimeZone('Asia/Riyadh')))->format('Y-m-d');
}

function followups_valid_date(string $date): bool
{
    $d = DateTimeImmutable::createFromFormat('!Y-m-d', $date);
    return $d !== false && $d->format('Y-m-d') === $date;
}

function followups_assert_role(array $auth): void
{
    if (!in_array((string) ($auth['role'] ?? ''), ['supervisor', 'manager', 'teacher', 'assistant'], true)) {
        error_response('Forbidden', 403);
    }
}

/** The app_state row is locked for every mutation, so two supervisors cannot overwrite each other. */
function followups_locked_state(PDO $pdo, int $cid): array
{
    $tenants = app_state_tenant_enabled($pdo);
    app_state_upsert_if_missing($pdo, $cid, $tenants);
    $pdo->beginTransaction();
    $sql = $tenants
        ? 'SELECT value FROM app_state WHERE complex_id = ? AND `key` = ? FOR UPDATE'
        : 'SELECT value FROM app_state WHERE `key` = ? FOR UPDATE';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($tenants ? [$cid, STUDENT_FOLLOWUPS_KEY] : [STUDENT_FOLLOWUPS_KEY]);
    $decoded = json_decode((string) $stmt->fetchColumn(), true);
    return is_array($decoded) ? array_values($decoded) : [];
}

function app_state_upsert_if_missing(PDO $pdo, int $cid, bool $tenants): void
{
    $stmt = $pdo->prepare($tenants
        ? 'INSERT IGNORE INTO app_state (complex_id, `key`, value) VALUES (?, ?, ?)'
        : 'INSERT IGNORE INTO app_state (`key`, value) VALUES (?, ?)');
    $stmt->execute($tenants ? [$cid, STUDENT_FOLLOWUPS_KEY, '[]'] : [STUDENT_FOLLOWUPS_KEY, '[]']);
}

function followups_commit(PDO $pdo, int $cid, array $rows): void
{
    app_state_upsert($pdo, STUDENT_FOLLOWUPS_KEY, $rows, app_state_tenant_enabled($pdo) ? $cid : null);
    $pdo->commit();
}

function followups_due(array $row, string $today): bool
{
    return ($row['status'] ?? '') === 'active' && ($row['dueDate'] ?? '') <= $today;
}

function followups_escalate_due(array &$rows, string $today): bool
{
    $changed = false;
    foreach ($rows as &$row) {
        if (followups_due($row, $today) && (int) ($row['round'] ?? 1) >= 3) {
            $row['status'] = 'escalated';
            $row['escalatedAt'] = (new DateTimeImmutable('now', new DateTimeZone('Asia/Riyadh')))->format(DATE_ATOM);
            $changed = true;
        }
    }
    unset($row);
    return $changed;
}

function handle_list_student_followups(): void
{
    $auth = require_auth();
    followups_assert_role($auth);
    $cid = require_complex_id($auth);
    $pdo = db();
    $rows = followups_locked_state($pdo, $cid);
    $today = followups_today();
    if (followups_escalate_due($rows, $today)) {
        followups_commit($pdo, $cid, $rows);
    } else {
        $pdo->commit();
    }

    $role = (string) $auth['role'];
    if ($role === 'teacher' || $role === 'assistant') {
        $halaqaId = (int) ($auth['halaqaId'] ?? 0);
        $rows = array_values(array_filter($rows, static fn (array $r): bool =>
            (int) ($r['halaqaId'] ?? 0) === $halaqaId
            && in_array(($r['status'] ?? ''), ['active', 'escalated'], true)
            && ($r['dueDate'] ?? '') <= $today
        ));
    } else {
        $rows = array_values(array_filter($rows, static fn (array $r): bool => in_array(($r['status'] ?? ''), ['active', 'escalated'], true)));
    }
    json_response(['items' => $rows, 'today' => $today]);
}

function handle_change_student_followup(): void
{
    $auth = require_auth();
    if (!in_array((string) ($auth['role'] ?? ''), ['supervisor', 'manager'], true)) {
        error_response('Forbidden', 403);
    }
    $cid = require_complex_id($auth);
    $input = json_input();
    $action = (string) ($input['action'] ?? '');
    $pdo = db();
    $today = followups_today();
    $dueDate = trim((string) ($input['dueDate'] ?? ''));
    if (in_array($action, ['create', 'extend'], true)
        && (!followups_valid_date($dueDate) || $dueDate < $today || ($action === 'extend' && $dueDate === $today))) {
        error_response('اختر تاريخاً مناسباً؛ المهلة الجديدة بعد اليوم', 400);
    }
    if ($action === 'create') {
        $studentId = trim((string) ($input['studentId'] ?? ''));
        $halaqaId = (int) ($input['halaqaId'] ?? 0);
        $note = trim((string) ($input['note'] ?? ''));
        if ($studentId === '' || $halaqaId <= 0 || $note === '' || strlen($note) > 4000) {
            error_response('اختر الحلقة والطالب واكتب ملاحظة لا تتجاوز 1000 حرف', 400);
        }
        $tenants = table_column_exists($pdo, 'students', 'complex_id');
        $stmt = $pdo->prepare($tenants
            ? 'SELECT id, name FROM students WHERE id = ? AND halaqa_id = ? AND complex_id = ?'
            : 'SELECT id, name FROM students WHERE id = ? AND halaqa_id = ?');
        $stmt->execute($tenants ? [$studentId, $halaqaId, $cid] : [$studentId, $halaqaId]);
        $student = $stmt->fetch();
        if (!$student) {
            error_response('الطالب لا ينتمي للحلقة المحددة', 400);
        }
    } elseif (!in_array($action, ['extend', 'complete', 'close'], true)) {
        error_response('إجراء غير معروف', 400);
    }
    if ($action === 'close' && ($auth['role'] ?? '') !== 'manager') {
        error_response('Forbidden', 403);
    }

    $rows = followups_locked_state($pdo, $cid);
    try {
        if ($action === 'create') {
            foreach ($rows as $existing) {
                if (($existing['studentId'] ?? '') === $studentId && in_array(($existing['status'] ?? ''), ['active', 'escalated'], true)) {
                    $pdo->rollBack();
                    error_response('الطالب لديه متابعة نشطة بالفعل', 409);
                }
            }
            $rows[] = [
                'id' => new_uuid(),
                'studentId' => $studentId,
                'studentName' => (string) $student['name'],
                'halaqaId' => $halaqaId,
                'note' => $note,
                'dueDate' => $dueDate,
                'round' => 1,
                'status' => 'active',
                'createdAt' => date(DATE_ATOM),
                'createdBy' => (string) ($auth['name'] ?? 'المشرف التعليمي'),
            ];
        } else {
            $id = (string) ($input['id'] ?? '');
            $found = false;
            foreach ($rows as &$row) {
                if (($row['id'] ?? '') !== $id) continue;
                $found = true;
                if ($action === 'close') {
                    if (($row['status'] ?? '') !== 'escalated') {
                        $pdo->rollBack();
                        error_response('التحويل غير متاح', 409);
                    }
                    $row['status'] = 'closed';
                    $row['closedAt'] = date(DATE_ATOM);
                    break;
                }
                if (($row['status'] ?? '') !== 'active') {
                    $pdo->rollBack();
                    error_response('هذه المتابعة انتهت بالفعل', 409);
                }
                if ($action === 'complete') {
                    $row['status'] = 'completed';
                    $row['completedAt'] = date(DATE_ATOM);
                } else {
                    if (!followups_due($row, $today) || (int) $row['round'] >= 3) {
                        $pdo->rollBack();
                        error_response('المهلة متاحة عند حلول الموعد وللمرتين الأوليين فقط', 409);
                    }
                    $row['round'] = (int) $row['round'] + 1;
                    $row['dueDate'] = $dueDate;
                }
                break;
            }
            unset($row);
            if (!$found) {
                $pdo->rollBack();
                error_response('المتابعة غير موجودة', 404);
            }
        }
        followups_escalate_due($rows, $today);
        $rows = array_values(array_filter($rows, static fn (array $row): bool =>
            !in_array(($row['status'] ?? ''), ['completed', 'closed'], true)
        ));
        followups_commit($pdo, $cid, $rows);
        json_response(['ok' => true]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}
