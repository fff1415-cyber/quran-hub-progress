<?php
declare(strict_types=1);

/** Caller owns the assignment transaction and has already locked the existing student. */
function plans_commit_profile_phase(PDO $pdo,int $cid,string $student,array $plan,bool $tenants):array {
    if(!$pdo->inTransaction())throw new RuntimeException('يلزم تثبيت مرحلة الطالب مع التعيين في معاملة واحدة');
    $q=$pdo->prepare('SELECT level_number FROM education_plans WHERE track=?'.($tenants?' AND complex_id=?':''));$q->execute($tenants?[$plan['track'],$cid]:[$plan['track']]);
    $phase=plans_global_phase_from_level($plan['track'],(int)$plan['level_number'],$q->fetchAll());
    if($phase<1)throw new RuntimeException('لا يمكن تأكيد مرحلة الخطة المختارة؛ لم يُستبدل التعيين');
    $levels=['التأهيل','النجباء','الفرسان','الحفاظ','الخريجين'];$slot=intdiv((int)$plan['level_number'],1000);
    if($slot<1){$ends=$plan['track']==='gold'?[4,10,16,22,30]:[8,20,33,42,60];$slot=1;foreach($ends as$i=>$end)if($phase<=$end){$slot=$i+1;break;}}
    if(!isset($levels[$slot-1]))throw new RuntimeException('مستوى الخطة غير صالح؛ لم تتغير بيانات الطالب');
    $profile=['phase_number'=>$phase,'level'=>(string)$phase,'institute_level'=>$levels[$slot-1]];$sets=[];$params=[];
    foreach($profile as$column=>$value){if(!plans_column_exists($pdo,'students',$column))throw new ApiSchemaException(['students.'.$column]);$sets[]=$column.'=?';$params[]=$value;}
    $params[]=$student;if($tenants)$params[]=$cid;
    $pdo->prepare('UPDATE students SET '.implode(',',$sets).' WHERE id=?'.($tenants?' AND complex_id=?':''))->execute($params);return $profile;
}
