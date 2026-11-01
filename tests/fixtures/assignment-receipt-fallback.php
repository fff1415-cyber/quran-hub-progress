<?php
// Independent compatible receipt implementation used only in the prepared rollback package.
function plans_operation_payload(mixed $value): mixed
{
    if (!is_array($value)) return $value;
    if (!array_is_list($value)) ksort($value, SORT_STRING);
    return array_map('plans_operation_payload', $value);
}
function plans_assignment_operation(PDO $pdo, int $cid, string $studentId, array $input): ?array
{
    if (!array_key_exists('operation_id', $input)) {
        if (array_key_exists('operation_probe', $input)) throw new RuntimeException('معرّف طلب الخطة مطلوب للاستعلام');
        return null;
    }
    $id=$input['operation_id'];
    if (!is_string($id) || preg_match('/^[A-Za-z0-9_-]{8,128}$/D',$id)!==1) throw new RuntimeException('معرّف طلب الخطة غير صالح');
    if (array_key_exists('operation_probe',$input) && !is_bool($input['operation_probe'])) throw new RuntimeException('صيغة استعلام طلب الخطة غير صالحة');
    if (!plans_table_exists($pdo,'plan_operation_receipts')) throw new RuntimeException('حفظ إيصالات طلبات الخطط غير مفعّل؛ لم يتغير تعيين الطالب');
    $payload=array_diff_key($input,['operation_id'=>true,'operation_probe'=>true]);
    $hash=hash('sha256',json_encode(plans_operation_payload($payload),JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES));
    $query=$pdo->prepare('SELECT * FROM plan_operation_receipts WHERE operation_id = :id AND context_id = :context FOR UPDATE');
    $query->execute(['id'=>$id,'context'=>$cid]);$row=$query->fetch();
    $operation=['id'=>$id,'hash'=>$hash,'response'=>null];
    if (!$row) return $operation;
    if ($row['operation_kind']!=='assign' || $row['student_id']!==$studentId || !hash_equals((string)$row['input_sha256'],$hash)) throw new RuntimeException('معرّف الطلب مستخدم لبيانات مختلفة؛ لم يتغير تعيين الطالب');
    $stored=json_decode((string)$row['response_json'],true,512,JSON_THROW_ON_ERROR);
    if (!is_array($stored) || ($stored['ok']??null)!==true || ($stored['operation_id']??null)!==$id || !is_string($stored['assignment_id']??null) || $stored['assignment_id']==='') throw new RuntimeException('إيصال طلب الخطة غير مكتمل؛ يلزم التحقق من مصدره دون إعادة التعيين');
    $operation['response']=['ok'=>true,'operation_id'=>$id,'operation_applied'=>true,'assignment_id'=>$stored['assignment_id'],'replayed'=>true,'sard_queue'=>null];
    return $operation;
}
function plans_save_assignment_operation(PDO $pdo, int $cid, string $studentId, ?array $operation, array $response): void
{
    if ($operation===null) return;
    $stored=['ok'=>true,'operation_id'=>$operation['id'],'operation_applied'=>true,'assignment_id'=>$response['assignment_id']];
    $query=$pdo->prepare('INSERT INTO plan_operation_receipts (operation_id, context_id, operation_kind, student_id, response_json, input_sha256) VALUES (:id, :context, :kind, :student, :response, :hash)');
    $query->execute(['id'=>$operation['id'],'context'=>$cid,'kind'=>'assign','student'=>$studentId,'response'=>json_encode($stored,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),'hash'=>$operation['hash']]);
}
