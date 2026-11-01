<?php
declare(strict_types=1);

/** Data primitives only. Callers retain the existing endpoint authorization checks. */
function plan_events_tables_ready(PDO $pdo): bool
{
    foreach (['plan_operation_receipts', 'plan_completion_events', 'plan_completion_heads'] as $table) {
        if (!plans_table_exists($pdo, $table)) return false;
    }
    return true;
}

function plan_events_key(string $task, int $segment): string
{
    return $task . ':' . $segment;
}

/** Called immediately after INSERT of a new assignment, inside its existing transaction. */
function plan_events_register_assignment(PDO $pdo, string $studentId, string $assignmentId, string $planId): void
{
    if (!$pdo->inTransaction()) throw new RuntimeException('مرجع التعيين الجديد يتطلب معاملة الحفظ نفسها');
    if (!plan_events_tables_ready($pdo)) return; // Existing assignment protocol remains compatible before the proposed schema.
    $marker = ['protocol'=>2,'student_id'=>$studentId,'assignment_id'=>$assignmentId,'plan_id'=>$planId];
    $json = json_encode($marker, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $hash = hash('sha256', json_encode(plans_operation_payload($marker), JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    // ':' is outside the public request-ID alphabet. Assignment IDs are already globally unique.
    $query = $pdo->prepare('INSERT INTO plan_operation_receipts(context_id,operation_id,student_id,operation_kind,input_sha256,response_json) VALUES(0,?,?,?,?,?)');
    $query->execute(['assignment-protocol:'.$assignmentId,$studentId,'assignment_protocol',$hash,$json]);
}

/** Constant-time primary-key lookup. No dates, last assignments, names, or legacy rebindings. */
function plan_events_strict_assignment(PDO $pdo, array $assignment): bool
{
    $query=$pdo->prepare('SELECT student_id,operation_kind,input_sha256,response_json FROM plan_operation_receipts WHERE context_id=0 AND operation_id=?');
    $query->execute(['assignment-protocol:'.$assignment['id']]);$row=$query->fetch();
    if(!$row)return false;
    $response=json_decode((string)$row['response_json'],true,512,JSON_THROW_ON_ERROR);
    $expected=['protocol'=>2,'student_id'=>$assignment['student_id'],'assignment_id'=>$assignment['id'],'plan_id'=>$assignment['plan_id']];
    $hash=hash('sha256',json_encode(plans_operation_payload($expected),JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES));
    if(!is_array($response)||$row['student_id']!==$assignment['student_id']||$row['operation_kind']!=='assignment_protocol'||!hash_equals((string)$row['input_sha256'],$hash))throw new RuntimeException('مرجع التعيين المحفوظ غير مطابق؛ لم يُعد ربط السجلات القديمة');
    foreach($expected as $field=>$value)if(($response[$field]??null)!==$value)throw new RuntimeException('إصدار مرجع التعيين أو هويته غير مطابق؛ يلزم التحقق دون التخمين');
    return true;
}

function plan_events_validate_head(array $row, int $contextId, array $assignment, string $task, int $segment): array
{
    if ($segment < 1 || !in_array($task,['hifz','rabt','muraja'],true)
        || $row['head_assignment'] !== $assignment['id'] || $row['head_task'] !== $task || (int)$row['head_segment'] !== $segment
        || ($row['id'] ?? null) !== $row['current_event_id']
        || $row['assignment_id'] !== $assignment['id'] || $row['student_id'] !== $assignment['student_id']
        || $row['plan_id'] !== $assignment['plan_id'] || (int) $row['context_id'] !== $contextId
        || $row['task_type'] !== $task || (int) $row['segment_index'] !== $segment
        || !in_array((int) $row['head_completed'], [0, 1], true)
        || (((int) $row['head_completed'] === 1) !== ($row['event_kind'] === 'complete'))
        || !in_array($row['event_kind'], ['complete', 'revoke'], true)) {
        throw new RuntimeException('مرجع الإنجاز لا يطابق الطالب والتعيين والمقطع؛ بقيت البيانات دون تسوية تلقائية');
    }
    return $row;
}

/** Select the head by its explicit identity, never by a timestamp or row order. */
function plan_events_head(PDO $pdo, int $contextId, array $assignment, string $task, int $segment, bool $lock = false): ?array
{
    $query = $pdo->prepare('SELECT h.assignment_id AS head_assignment, h.task_type AS head_task, h.segment_index AS head_segment,
        h.is_completed AS head_completed,h.current_event_id,e.* FROM plan_completion_heads h
        LEFT JOIN plan_completion_events e ON e.id=h.current_event_id WHERE h.assignment_id=? AND h.task_type=? AND h.segment_index=?'.($lock?' FOR UPDATE':''));
    $query->execute([$assignment['id'],$task,$segment]);$row=$query->fetch();
    return $row ? plan_events_validate_head($row,$contextId,$assignment,$task,$segment) : null;
}

/** Envelopes preserve original columns; legacy unassigned rows stay explicitly unassigned. */
function plan_events_read(PDO $pdo, int $contextId, array $assignment): array
{
    if (!plan_events_tables_ready($pdo)) throw new RuntimeException('مسار حفظ تاريخ الإنجاز غير مهيأ؛ لم يُصفّر تقدم الطالب');
    $strict = plan_events_strict_assignment($pdo, $assignment);
    $sql = 'SELECT * FROM segment_completions WHERE student_id = ? AND plan_id = ? AND (assignment_id = ?';
    $parameters = [$assignment['student_id'], $assignment['plan_id'], $assignment['id']];
    if (!$strict) {
        // Preserve the pre-cutover view exactly. This is not a new stored association or a backfill.
        $sql .= ' OR (assignment_id IS NULL AND created_at >= ?)';
        $parameters[] = $assignment['assigned_at'];
    }
    $query = $pdo->prepare($sql . ') ORDER BY segment_index, task_type, id');
    $query->execute($parameters);
    $effective = [];
    foreach ($query->fetchAll() as $row) {
        $key = plan_events_key((string) $row['task_type'], (int) $row['segment_index']);
        if (isset($effective[$key])) throw new RuntimeException('سجلات إنجاز قديمة مكررة للمقطع؛ لم تُحذف ولم يُختر سجل بالتخمين');
        $effective[$key] = ['completion' => $row, 'source' => [
            'kind' => $row['assignment_id'] === $assignment['id'] ? 'legacy_exact' : 'legacy_unassigned',
            'record_id' => $row['id'],
        ]];
    }
    $query = $pdo->prepare('SELECT h.assignment_id AS head_assignment,h.task_type AS head_task,h.segment_index AS head_segment,
        h.is_completed AS head_completed,h.current_event_id,e.* FROM plan_completion_heads h
        LEFT JOIN plan_completion_events e ON e.id=h.current_event_id WHERE h.assignment_id=? ORDER BY h.segment_index,h.task_type');
    $query->execute([$assignment['id']]);
    foreach ($query->fetchAll() as $keyRow) {
        $task = (string) $keyRow['head_task'];$segment = (int) $keyRow['head_segment'];
        $key = plan_events_key($task, $segment);
        $head = plan_events_validate_head($keyRow,$contextId,$assignment,$task,$segment);
        if (($effective[$key]['source']['kind'] ?? null) === 'legacy_unassigned') {
            throw new RuntimeException('يوجد إنجاز قديم غير منسوب لهذا المقطع؛ يلزم إثبات مصدره قبل حجبه أو استبداله');
        }
        if ((int) $head['head_completed'] === 0) { unset($effective[$key]);continue; }
        if (!is_string($head['completed_at']) || $head['completed_at'] === '') throw new RuntimeException('تاريخ الإنجاز المحفوظ غير مكتمل');
        $effective[$key] = ['completion' => [
            'id' => $head['id'], 'student_id' => $head['student_id'], 'plan_id' => $head['plan_id'],
            'assignment_id' => $head['assignment_id'], 'segment_index' => $segment, 'task_type' => $task,
            'completed_at' => $head['completed_at'], 'recorded_by' => $head['recorded_by'], 'created_at' => $head['created_at'],
        ], 'source' => ['kind' => 'event', 'event_id' => $head['id'], 'operation_id' => $head['operation_id'], 'reference_json' => $head['source_reference_json']]];
    }
    return array_values($effective);
}

function plan_events_segments(PDO $pdo, array $assignment): array
{
    $query = $pdo->prepare('SELECT segment_index FROM plan_segments WHERE plan_id = ? ORDER BY segment_index');
    $query->execute([$assignment['plan_id']]);
    return array_map('intval', array_column($query->fetchAll(), 'segment_index'));
}

/** This function aborts the whole caller transaction on failure, including a composed grade write. */
function plan_events_execute(PDO $pdo, int $contextId, string $studentId, string $assignmentId, string $operationId, string $kind, array $payload, callable $write): array
{
    $owns = !$pdo->inTransaction();
    try {
        if ($owns) $pdo->beginTransaction();
        if ($contextId < 0 || !in_array($kind,['completion_apply','completion_revoke'],true) || !preg_match('/^[A-Za-z0-9_-]{8,128}$/D', $operationId) || $studentId === '' || $assignmentId === '') throw new RuntimeException('هوية طلب الإنجاز غير مكتملة');
        if (!plan_events_tables_ready($pdo)) throw new RuntimeException('مسار حفظ تاريخ الإنجاز غير مهيأ؛ لم يُغيّر سجل الطالب');
        $lock = $pdo->prepare('SELECT id FROM students WHERE id = ? FOR UPDATE');$lock->execute([$studentId]);
        if (!$lock->fetch()) throw new RuntimeException('الطالب غير موجود؛ لم يُنقل الإنجاز إلى حساب آخر');
        $hash = hash('sha256', json_encode(plans_operation_payload(['protocol' => 1, 'student_id' => $studentId, 'assignment_id' => $assignmentId, 'kind' => $kind, 'payload' => $payload]), JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        $query = $pdo->prepare('SELECT student_id, operation_kind, input_sha256, response_json FROM plan_operation_receipts WHERE context_id = ? AND operation_id = ? FOR UPDATE');
        $query->execute([$contextId, $operationId]);$existing = $query->fetch();
        if ($existing) {
            if ($existing['student_id'] !== $studentId || $existing['operation_kind'] !== $kind || !hash_equals((string) $existing['input_sha256'], $hash)) throw new RuntimeException('معرّف طلب الإنجاز مستخدم لبيانات مختلفة');
            $response = json_decode((string) $existing['response_json'], true, 512, JSON_THROW_ON_ERROR);
            if (!is_array($response) || ($response['operation_id'] ?? null) !== $operationId || ($response['assignment_id'] ?? null) !== $assignmentId || !isset($response['event_ids'])) throw new RuntimeException('إيصال الإنجاز غير مكتمل؛ لم يُعد تنفيذ الطلب');
            $response['replayed'] = true;
            if ($owns) $pdo->commit();
            return $response;
        }
        $assignment = plans_locked_current_assignment($pdo, $studentId);
        if (!$assignment || $assignment['id'] !== $assignmentId || $assignment['status'] !== 'active') throw new RuntimeException('تغيّر التعيين الحالي أو جُمّد؛ لم يُسجّل الإنجاز على خطة أخرى');
        // The FK needs the receipt first. Its provisional value is never committed or returned.
        $pdo->prepare('INSERT INTO plan_operation_receipts(context_id,operation_id,student_id,operation_kind,input_sha256,response_json) VALUES(?,?,?,?,?,?)')->execute([$contextId,$operationId,$studentId,$kind,$hash,'{"pending":true}']);
        $delta = $write($assignment);
        $response = ['operation_id' => $operationId, 'assignment_id' => $assignmentId, 'plan_id' => $assignment['plan_id'], 'replayed' => false] + $delta;
        $query = $pdo->prepare('UPDATE plan_operation_receipts SET response_json = ? WHERE context_id = ? AND operation_id = ? AND input_sha256 = ?');
        $query->execute([json_encode($response, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),$contextId,$operationId,$hash]);
        if ($query->rowCount() !== 1) throw new RuntimeException('تعذّر تثبيت إيصال الإنجاز؛ لم يُحفظ جزء من العملية');
        if ($owns) $pdo->commit();
        return $response;
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) { try {$pdo->rollBack();} catch (Throwable) {} }
        throw $error;
    }
}

function plan_events_append(PDO $pdo, int $contextId, array $assignment, string $operationId, string $task, int $segment, string $kind, ?string $date, string $recorder, mixed $source, ?string $reverses = null, ?string $legacyId = null): string
{
    if(!$pdo->inTransaction())throw new RuntimeException('حفظ حدث الإنجاز يتطلب معاملة الإيصال نفسها');
    $before = plan_events_head($pdo, $contextId, $assignment, $task, $segment, true);
    $id = new_uuid();
    $reference = json_encode(['protocol' => 1, 'source' => $source, 'previous_event_id' => $before['id'] ?? null, 'legacy_completion_id' => $legacyId], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $query = $pdo->prepare('INSERT INTO plan_completion_events(id,context_id,operation_id,assignment_id,student_id,plan_id,segment_index,task_type,event_kind,reverses_event_id,completed_at,source_reference_json,recorded_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)');
    $query->execute([$id,$contextId,$operationId,$assignment['id'],$assignment['student_id'],$assignment['plan_id'],$segment,$task,$kind,$reverses,$date,$reference,$recorder]);
    $completed = $kind === 'complete' ? 1 : 0;
    if ($before) {
        $query = $pdo->prepare('UPDATE plan_completion_heads SET current_event_id=?,is_completed=? WHERE assignment_id=? AND task_type=? AND segment_index=? AND current_event_id=?');
        $query->execute([$id,$completed,$assignment['id'],$task,$segment,$before['id']]);
        if ($query->rowCount() !== 1) throw new RuntimeException('تغيّر الإنجاز أثناء الحفظ؛ لم تُستبدل كتابة أخرى');
    } else {
        $pdo->prepare('INSERT INTO plan_completion_heads(assignment_id,task_type,segment_index,current_event_id,is_completed) VALUES(?,?,?,?,?)')->execute([$assignment['id'],$task,$segment,$id,$completed]);
    }
    return $id;
}

/** Quantity and task ordering use the existing plan functions, without new scoring rules. */
function plan_events_apply(PDO $pdo, int $contextId, string $studentId, string $assignmentId, string $operationId, string $task, string $tap, string $completedAt, string $recorder, mixed $source = null): array
{
    $payload = ['task_type'=>$task,'tap'=>$tap,'completed_at'=>$completedAt,'source'=>$source];
    return plan_events_execute($pdo,$contextId,$studentId,$assignmentId,$operationId,'completion_apply',$payload,function(array $assignment) use($pdo,$contextId,$operationId,$task,$tap,$completedAt,$recorder,$source):array {
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $completedAt);
        if (!in_array($task,['hifz','rabt','muraja'],true) || !in_array($tap,['half','one','two'],true) || !$date || $date->format('Y-m-d') !== $completedAt) throw new RuntimeException('بيانات الإنجاز أو تاريخه غير صالحة');
        $all = plan_events_segments($pdo,$assignment);$rows = array_column(plan_events_read($pdo,$contextId,$assignment),'completion');
        $done = static fn(string $type):array => array_map('intval',array_column(array_filter($rows,static fn($row)=>$row['task_type']===$type),'segment_index'));
        if ($task === 'hifz') {
            if(plans_segments_for_tap((string)$assignment['track'],$tap)<1)throw new RuntimeException('هذا الإدخال غير متاح لمسار الطالب');
            $segments = plans_next_hifz_segments_for_tap((string)$assignment['track'],$tap,(int)$assignment['start_segment_index'],$all,$done('hifz'));
        } else {
            if (!in_array($tap,['one','half'],true)) throw new RuntimeException('ربط/مراجعة: مجتاز فقط');
            $next = plans_next_segment_for_task($task,(int)$assignment['start_segment_index'],isset($assignment['start_muraja_segment'])?(int)$assignment['start_muraja_segment']:null,(int)$assignment['level_number'],$all,$done('hifz'),$done($task));
            $segments = $next === null ? [] : [$next];
        }
        if (!$segments) throw new RuntimeException('لا توجد مقاطع متبقية لهذه المهمة');
        $ids=[];foreach($segments as $segment)$ids[]=plan_events_append($pdo,$contextId,$assignment,$operationId,$task,$segment,'complete',$completedAt,$recorder,$source);
        return ['event_ids'=>$ids,'applied_segments'=>$segments,'task_type'=>$task,'completed_at'=>$completedAt];
    });
}

/** Only the already-supported hifz cancellation is implemented; no new role effect is added. */
function plan_events_revoke(PDO $pdo, int $contextId, string $studentId, string $assignmentId, string $operationId, array $targets, string $recorder, mixed $source = null): array
{
    return plan_events_execute($pdo,$contextId,$studentId,$assignmentId,$operationId,'completion_revoke',['targets'=>$targets,'source'=>$source],function(array $assignment) use($pdo,$contextId,$operationId,$targets,$recorder,$source):array {
        $segments=plan_events_segments($pdo,$assignment);$ids=[];$removed=[];$seen=[];
        foreach($targets as $target){
            if(!is_array($target))throw new RuntimeException('مرجع إلغاء الحفظ غير صالح');
            $segment=filter_var($target['segment_index']??null,FILTER_VALIDATE_INT);$task=$target['task_type']??'hifz';
            $event=$target['event_id']??null;$legacy=$target['legacy_id']??null;
            if($task!=='hifz'||$segment===false||$segment<(int)$assignment['start_segment_index']||!in_array($segment,$segments,true)||($event!==null&&(!is_string($event)||$event===''))||($legacy!==null&&(!is_string($legacy)||$legacy===''))||($event===null)==($legacy===null))throw new RuntimeException('مرجع إلغاء الحفظ غير صالح');
            $key=plan_events_key($task,$segment);$identity=json_encode([$event,$legacy]);
            if(isset($seen[$key])){if($seen[$key]!==$identity)throw new RuntimeException('مرجعان مختلفان لإلغاء المقطع نفسه');continue;}$seen[$key]=$identity;
            $head=plan_events_head($pdo,$contextId,$assignment,$task,$segment,true);
            if($event!==null){
                if($head&&(int)$head['head_completed']===0&&$head['reverses_event_id']===$event)continue;
                if(!$head||(int)$head['head_completed']!==1||$head['id']!==$event)throw new RuntimeException('تغيّر الإنجاز المراد إلغاؤه؛ لم يُمس إنجاز أحدث');
            }else{
                $query=$pdo->prepare('SELECT * FROM segment_completions WHERE id=? AND student_id=? AND plan_id=? AND segment_index=? AND task_type=?');$query->execute([$legacy,$assignment['student_id'],$assignment['plan_id'],$segment,$task]);$row=$query->fetch();
                if(!$row||$row['assignment_id']!==$assignment['id'])throw new RuntimeException('السجل القديم غير مربوط صراحة بهذا التعيين؛ يلزم إثبات مصدره دون التخمين');
                if($head){$reference=json_decode((string)$head['source_reference_json'],true,512,JSON_THROW_ON_ERROR);if((int)$head['head_completed']===0&&($reference['legacy_completion_id']??null)===$legacy)continue;throw new RuntimeException('تغيّر الإنجاز المراد إلغاؤه؛ لم يُمس إنجاز أحدث');}
            }
            $ids[]=plan_events_append($pdo,$contextId,$assignment,$operationId,$task,$segment,'revoke',null,$recorder,$source,$event,$legacy);$removed[]=$segment;
        }
        return ['event_ids'=>$ids,'removed_segments'=>$removed,'removed'=>count($removed)];
    });
}

function plan_events_history(PDO $pdo, int $contextId, array $assignment): array
{
    $query=$pdo->prepare('SELECT * FROM plan_completion_events WHERE context_id=? AND assignment_id=? AND student_id=? AND plan_id=? ORDER BY created_at,id');
    $query->execute([$contextId,$assignment['id'],$assignment['student_id'],$assignment['plan_id']]);
    return $query->fetchAll();
}
