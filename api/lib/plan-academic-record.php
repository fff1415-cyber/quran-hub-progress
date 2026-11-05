<?php
declare(strict_types=1);

function plans_transition_receipt_key(array $input):?string {
    if(!isset($input['sard_result']['academic_record'])||empty($input['expected_assignment_id']))return null;
    return 'grade_plan_transition:'.hash('sha256',json_encode([(string)$input['student_id'],(string)$input['expected_assignment_id']],JSON_THROW_ON_ERROR));
}
function plans_transition_receipt(PDO $pdo,int $cid,array $input):?array {
    $key=plans_transition_receipt_key($input);if($key===null)return null;
    $tenant=app_state_tenant_enabled($pdo);$q=$pdo->prepare('SELECT value FROM app_state WHERE '.($tenant?'complex_id=? AND ':'').'`key`=? FOR UPDATE');$q->execute($tenant?[$cid,$key]:[$key]);$raw=$q->fetchColumn();if($raw===false)return null;
    $receipt=json_decode((string)$raw,true,512,JSON_THROW_ON_ERROR);
    if(($receipt['input_sha256']??'')!==hash('sha256',json_encode($input,JSON_THROW_ON_ERROR)))throw new RuntimeException('يوجد انتقال مؤكد بمحتوى مختلف؛ لم يُكرر الانتقال',409);
    return $receipt['response'];
}
function plans_store_transition_receipt(PDO $pdo,int $cid,array $input,array $response):void {
    $key=plans_transition_receipt_key($input);if($key===null)return;
    app_state_upsert($pdo,$key,['input_sha256'=>hash('sha256',json_encode($input,JSON_THROW_ON_ERROR)),'response'=>$response],app_state_tenant_enabled($pdo)?$cid:null);
}

/** Called only inside the existing, authorized assignment transaction. */
function plans_commit_academic_record(PDO $pdo,int $cid,string $student,array $current,array $next,array $sard,array $entry,array $input):array {
    if(!$pdo->inTransaction())throw new RuntimeException('السجل الأكاديمي يحتاج معاملة الانتقال',409);
    $expected=(string)($input['expected_assignment_id']??'');
    if($expected===''||($current['id']??'')!==$expected)throw new RuntimeException('لم يُثبت تعيين السجل الأكاديمي',409);
    $draft=$sard['academic_record']??null;
    if(!is_array($draft))throw new RuntimeException('سجل الاجتياز غير مكتمل',400);
    foreach(['hifzScore','reviewScore']as$field)if(!isset($draft[$field])||!is_numeric($draft[$field])||!is_finite((float)$draft[$field])||(float)$draft[$field]<0)throw new RuntimeException('درجات السجل الأكاديمي غير صالحة',400);
    $percent=$sard['percent']??null;
    if(!is_numeric($percent)||!is_finite((float)$percent)||(float)$percent<0||(float)$percent>100)throw new RuntimeException('نسبة الاجتياز غير صالحة',400);
    foreach(['week','attempt','halaqaId']as$field)if((int)($entry[$field]??0)<1)throw new RuntimeException('بيانات طلب السرد غير مكتملة للسجل الأكاديمي',409);
    $plan=$pdo->prepare('SELECT title,track,level_number FROM education_plans WHERE id=?');$plan->execute([$current['plan_id']]);$oldPlan=$plan->fetch();
    if(!$oldPlan)throw new RuntimeException('مرجع الخطة السابقة غير موجود',409);
    $record=['id'=>'ar-assignment-'.$expected,'studentId'=>$student,'assignmentId'=>$expected,'halaqaId'=>(int)$entry['halaqaId'],'week'=>(int)$entry['week'],'attempt'=>(int)$entry['attempt'],'result'=>'passed','percent'=>(float)$percent,'hifzScore'=>(float)$draft['hifzScore'],'reviewScore'=>(float)$draft['reviewScore'],'testDate'=>$entry['passedAt'],'planId'=>$current['plan_id'],'planTitle'=>$oldPlan['title'],'levelNumber'=>(int)$oldPlan['level_number'],'track'=>$oldPlan['track'],'newPlanTitle'=>$next['title']];
    $tenant=app_state_tenant_enabled($pdo);$params=$tenant?[$cid,'academic_records']:['academic_records'];
    $insert=$pdo->prepare($tenant?'INSERT IGNORE INTO app_state(complex_id,`key`,value)VALUES(?,?,?)':'INSERT IGNORE INTO app_state(`key`,value)VALUES(?,?)');$insert->execute([...$params,'[]']);
    $q=$pdo->prepare('SELECT value FROM app_state WHERE '.($tenant?'complex_id=? AND ':'').'`key`=? FOR UPDATE');$q->execute($params);$raw=$q->fetchColumn();$records=json_decode((string)$raw,true,512,JSON_THROW_ON_ERROR);
    if(!is_array($records)||!array_is_list($records))throw new RuntimeException('السجل الأكاديمي محفوظ بصيغة تحتاج مراجعة؛ لم يُستبدل',409);
    foreach($records as$prior)if(($prior['id']??'')===$record['id'])throw new RuntimeException('يوجد سجل سابق للتعيين؛ لم يُستبدل أو يُكرر',409);
    array_unshift($records,$record);app_state_upsert($pdo,'academic_records',$records,$tenant?$cid:null);return $record;
}
