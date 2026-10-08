<?php

declare(strict_types=1);

const STAFF_TASKS_KEY = 'staff_tasks_v1';

function tasks_actor(array $auth): string
{
    $role = (string) ($auth['role'] ?? '');
    if (in_array($role, ['supervisor', 'manager'], true) && !empty($auth['accountId'])) {
        return $role . ':' . $auth['accountId'];
    }
    if ($role === 'teacher' && (int) ($auth['halaqaId'] ?? 0) > 0) {
        return 'teacher:' . (int) $auth['halaqaId'];
    }
    error_response('غير مصرح بعرض المهام', 403);
}

function tasks_today(): string
{
    return (new DateTimeImmutable('now', new DateTimeZone('Asia/Riyadh')))->format('Y-m-d');
}

function tasks_valid_date(string $date): bool
{
    $d = DateTimeImmutable::createFromFormat('!Y-m-d', $date);
    return $d !== false && $d->format('Y-m-d') === $date;
}

function tasks_roster(PDO $pdo, int $cid): array
{
    $roster = [];
    $tenantRoles = table_column_exists($pdo, 'role_accounts', 'complex_id');
    $stmt = $pdo->prepare($tenantRoles
        ? "SELECT id, name, role FROM role_accounts WHERE complex_id = ? AND role = 'supervisor'"
        : "SELECT id, name, role FROM role_accounts WHERE role = 'supervisor'");
    $stmt->execute($tenantRoles ? [$cid] : []);
    foreach ($stmt->fetchAll() as $row) {
        $roster[] = ['id' => 'supervisor:' . $row['id'], 'name' => $row['name'], 'role' => 'supervisor'];
    }
    $tenantHalaqat = table_column_exists($pdo, 'halaqat', 'complex_id');
    $stmt = $pdo->prepare($tenantHalaqat
        ? 'SELECT id, name, teacher_name, teacher_code FROM halaqat WHERE complex_id = ?'
        : 'SELECT id, name, teacher_name, teacher_code FROM halaqat');
    $stmt->execute($tenantHalaqat ? [$cid] : []);
    foreach ($stmt->fetchAll() as $row) {
        if (trim((string) $row['teacher_code']) === '') continue;
        $roster[] = ['id' => 'teacher:' . (int) $row['id'], 'name' => $row['teacher_name'] . ' — ' . $row['name'], 'role' => 'teacher'];
    }
    return $roster;
}

function tasks_locked(PDO $pdo, int $cid): array
{
    $tenants = app_state_tenant_enabled($pdo);
    $stmt = $pdo->prepare($tenants
        ? 'INSERT IGNORE INTO app_state (complex_id, `key`, value) VALUES (?, ?, ?)'
        : 'INSERT IGNORE INTO app_state (`key`, value) VALUES (?, ?)');
    $stmt->execute($tenants ? [$cid, STAFF_TASKS_KEY, '[]'] : [STAFF_TASKS_KEY, '[]']);
    $pdo->beginTransaction();
    $stmt = $pdo->prepare($tenants
        ? 'SELECT value FROM app_state WHERE complex_id = ? AND `key` = ? FOR UPDATE'
        : 'SELECT value FROM app_state WHERE `key` = ? FOR UPDATE');
    $stmt->execute($tenants ? [$cid, STAFF_TASKS_KEY] : [STAFF_TASKS_KEY]);
    $rows = json_decode((string) $stmt->fetchColumn(), true);
    return is_array($rows) ? array_values($rows) : [];
}

function handle_list_staff_tasks(): void
{
    $auth = require_auth();
    $actor = tasks_actor($auth);
    $cid = require_complex_id($auth);
    $pdo = db();
    $rows = tasks_locked($pdo, $cid);
    $pdo->commit();
    $role = (string) $auth['role'];
    $items = array_values(array_filter($rows, static fn (array $row): bool =>
        $role === 'manager' || ($row['assigneeId'] ?? '') === $actor || ($row['createdById'] ?? '') === $actor));
    json_response(['items' => $items, 'today' => tasks_today(), 'actorId' => $actor,
        'roster' => in_array($role, ['supervisor', 'manager'], true) ? tasks_roster($pdo, $cid) : []]);
}

function handle_change_staff_task(): void
{
    $auth = require_auth();
    $actor = tasks_actor($auth);
    $role = (string) $auth['role'];
    $cid = require_complex_id($auth);
    $input = json_input();
    $action = (string) ($input['action'] ?? '');
    $allowed = ['create', 'start', 'comment', 'submit', 'approve', 'return'];
    if (!in_array($action, $allowed, true)) error_response('إجراء غير معروف', 400);
    if ($action === 'create' && !in_array($role, ['supervisor', 'manager'], true)) error_response('غير مصرح بإسناد المهام', 403);

    $title = trim((string) ($input['title'] ?? ''));
    $description = trim((string) ($input['description'] ?? ''));
    $dueDate = trim((string) ($input['dueDate'] ?? ''));
    $note = trim((string) ($input['note'] ?? ''));
    if ($action === 'create' && ($title === '' || mb_strlen($title) > 150 || mb_strlen($description) > 3000
        || !tasks_valid_date($dueDate) || $dueDate < tasks_today())) error_response('عنوان المهمة أو الوصف أو التاريخ غير صالح', 400);
    if ($action === 'comment' || $action === 'return') {
        if ($note === '' || mb_strlen($note) > 2000) error_response('اكتب ملاحظة لا تتجاوز 2000 حرف', 400);
    }
    if ($action === 'submit' && mb_strlen($note) > 2000) error_response('نص الإنجاز طويل جداً', 400);

    $pdo = db();
    $roster = $action === 'create' ? tasks_roster($pdo, $cid) : [];
    $assignee = null;
    if ($action === 'create') {
        foreach ($roster as $person) if ($person['id'] === ($input['assigneeId'] ?? '')) $assignee = $person;
        if (!$assignee) error_response('اختر مشرفاً أو معلماً من المجمع', 400);
    }
    $rows = tasks_locked($pdo, $cid);
    try {
        $now = (new DateTimeImmutable('now', new DateTimeZone('Asia/Riyadh')))->format(DATE_ATOM);
        if ($action === 'create') {
            $rows[] = [
                'id' => new_uuid(), 'title' => $title, 'description' => $description,
                'dueDate' => $dueDate, 'assigneeId' => $assignee['id'], 'assigneeName' => $assignee['name'],
                'createdById' => $actor, 'createdByName' => (string) ($auth['name'] ?? 'مشرف'),
                'status' => 'new', 'createdAt' => $now, 'updatedAt' => $now,
                'history' => [['action' => 'create', 'by' => (string) ($auth['name'] ?? ''), 'at' => $now, 'note' => '']],
            ];
        } else {
            $found = false;
            foreach ($rows as &$task) {
                if (($task['id'] ?? '') !== ($input['id'] ?? '')) continue;
                $found = true;
                $assigneeAction = ($task['assigneeId'] ?? '') === $actor;
                $creatorAction = ($task['createdById'] ?? '') === $actor;
                $status = $task['status'] ?? '';
                $valid = match ($action) {
                    'start' => $assigneeAction && $status === 'new',
                    'submit' => $assigneeAction && in_array($status, ['new', 'in_progress'], true),
                    'approve', 'return' => $creatorAction && $status === 'review',
                    'comment' => ($assigneeAction || $creatorAction) && $status !== 'completed',
                    default => false,
                };
                if (!$valid) { $pdo->rollBack(); error_response('لا يمكن تنفيذ الإجراء في حالة المهمة الحالية', 409); }
                $next = ['start' => 'in_progress', 'submit' => 'review', 'approve' => 'completed', 'return' => 'in_progress'];
                if (isset($next[$action])) $task['status'] = $next[$action];
                $task['updatedAt'] = $now;
                $task['history'][] = ['action' => $action, 'by' => (string) ($auth['name'] ?? ''), 'at' => $now, 'note' => $note];
                break;
            }
            unset($task);
            if (!$found) { $pdo->rollBack(); error_response('المهمة غير موجودة', 404); }
        }
        app_state_upsert($pdo, STAFF_TASKS_KEY, $rows, app_state_tenant_enabled($pdo) ? $cid : null);
        $pdo->commit();
        json_response(['ok' => true]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}
