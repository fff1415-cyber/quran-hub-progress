<?php

declare(strict_types=1);

const STAFF_TASKS_KEY = 'staff_tasks_v1';
const STAFF_TASK_SENDERS = ['manager', 'supervisor', 'secretary', 'test_chair', 'program_supervisor'];
const STAFF_TASK_ACCOUNTS = ['manager', 'secretary', 'supervisor', 'program_supervisor', 'musammi', 'test_member', 'test_chair'];

function tasks_assistant_id(int $halaqaId, string $code, bool $primary = false): string
{
    return 'assistant:' . $halaqaId . ':' . ($primary ? 'primary' : substr(hash_hmac('sha256', $code, TOKEN_SECRET), 0, 24));
}

function tasks_actor(array $auth, PDO $pdo, int $cid): string
{
    $role = (string) ($auth['role'] ?? '');
    if (in_array($role, STAFF_TASK_ACCOUNTS, true) && !empty($auth['accountId'])) {
        return $role . ':' . $auth['accountId'];
    }
    if ($role === 'teacher' && (int) ($auth['halaqaId'] ?? 0) > 0) {
        return 'teacher:' . (int) $auth['halaqaId'];
    }
    if ($role === 'assistant' && (int) ($auth['halaqaId'] ?? 0) > 0) {
        $halaqaId = (int) $auth['halaqaId'];
        $claimed = (string) ($auth['taskActorId'] ?? '');
        if (str_starts_with($claimed, 'assistant:' . $halaqaId . ':')) return $claimed;
        // Sessions issued before this feature lack a task ID. Resolve a unique name within the halaqa.
        $matches = array_values(array_filter(tasks_roster($pdo, $cid), static fn (array $person): bool =>
            $person['role'] === 'assistant' && str_starts_with($person['id'], 'assistant:' . $halaqaId . ':')
            && $person['name'] === (string) ($auth['name'] ?? '')));
        if (count($matches) === 1) return $matches[0]['id'];
        error_response('أعد تسجيل الدخول لتفعيل مهام المساعد', 403);
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
        ? "SELECT id, name, role, code FROM role_accounts WHERE complex_id = ? AND role IN ('manager', 'secretary', 'supervisor', 'program_supervisor', 'musammi', 'test_member', 'test_chair')"
        : "SELECT id, name, role, code FROM role_accounts WHERE role IN ('manager', 'secretary', 'supervisor', 'program_supervisor', 'musammi', 'test_member', 'test_chair')");
    $stmt->execute($tenantRoles ? [$cid] : []);
    foreach ($stmt->fetchAll() as $row) {
        if (trim((string) $row['code']) === '') continue;
        $roster[] = ['id' => $row['role'] . ':' . $row['id'], 'name' => $row['name'], 'role' => $row['role']];
    }
    $tenantHalaqat = table_column_exists($pdo, 'halaqat', 'complex_id');
    $hasExtras = table_column_exists($pdo, 'halaqat', 'extra_assistants');
    $fields = 'id, name, teacher_name, teacher_code, assistant_name, assistant_code' . ($hasExtras ? ', extra_assistants' : '');
    $stmt = $pdo->prepare($tenantHalaqat
        ? 'SELECT ' . $fields . ' FROM halaqat WHERE complex_id = ?'
        : 'SELECT ' . $fields . ' FROM halaqat');
    $stmt->execute($tenantHalaqat ? [$cid] : []);
    foreach ($stmt->fetchAll() as $row) {
        $id = (int) $row['id'];
        if (trim((string) $row['teacher_code']) !== '') {
            $roster[] = ['id' => 'teacher:' . $id, 'name' => $row['teacher_name'] . ' — ' . $row['name'], 'role' => 'teacher', 'halaqaName' => $row['name']];
        }
        if (trim((string) $row['assistant_code']) !== '') {
            $roster[] = ['id' => tasks_assistant_id($id, '', true), 'name' => $row['assistant_name'], 'role' => 'assistant', 'halaqaName' => $row['name']];
        }
        if ($hasExtras) {
            $extras = json_decode((string) ($row['extra_assistants'] ?? ''), true);
            foreach ((is_array($extras) ? $extras : []) as $extra) {
                if (!is_array($extra) || trim((string) ($extra['code'] ?? '')) === '') continue;
                $roster[] = [
                    'id' => tasks_assistant_id($id, trim((string) $extra['code'])),
                    'name' => trim((string) ($extra['name'] ?? '')) ?: 'مساعد', 'role' => 'assistant', 'halaqaName' => $row['name'],
                ];
            }
        }
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
    $cid = require_complex_id($auth);
    $pdo = db();
    $actor = tasks_actor($auth, $pdo, $cid);
    $rows = tasks_locked($pdo, $cid);
    $pdo->commit();
    $role = (string) $auth['role'];
    $items = array_values(array_filter($rows, static fn (array $row): bool =>
        $role === 'manager' || ($row['assigneeId'] ?? '') === $actor || ($row['createdById'] ?? '') === $actor));
    json_response(['items' => $items, 'today' => tasks_today(), 'actorId' => $actor,
        'roster' => in_array($role, STAFF_TASK_SENDERS, true) ? tasks_roster($pdo, $cid) : []]);
}

function handle_change_staff_task(): void
{
    $auth = require_auth();
    $role = (string) $auth['role'];
    $cid = require_complex_id($auth);
    $pdo = db();
    $actor = tasks_actor($auth, $pdo, $cid);
    $input = json_input();
    $action = (string) ($input['action'] ?? '');
    $allowed = ['create', 'start', 'comment', 'submit', 'approve', 'return'];
    if (!in_array($action, $allowed, true)) error_response('إجراء غير معروف', 400);
    if ($action === 'create' && !in_array($role, STAFF_TASK_SENDERS, true)) error_response('غير مصرح بإسناد المهام', 403);

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

    $roster = $action === 'create' ? tasks_roster($pdo, $cid) : [];
    $assignee = null;
    if ($action === 'create') {
        foreach ($roster as $person) if ($person['id'] === ($input['assigneeId'] ?? '')) $assignee = $person;
        if (!$assignee) error_response('اختر أحد العاملين في المجمع', 400);
    }
    $rows = tasks_locked($pdo, $cid);
    try {
        $now = (new DateTimeImmutable('now', new DateTimeZone('Asia/Riyadh')))->format(DATE_ATOM);
        if ($action === 'create') {
            $rows[] = [
                'id' => new_uuid(), 'title' => $title, 'description' => $description,
                'dueDate' => $dueDate, 'assigneeId' => $assignee['id'],
                'assigneeName' => $assignee['name'] . ($assignee['role'] === 'assistant' ? ' — ' . $assignee['halaqaName'] : ''),
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
