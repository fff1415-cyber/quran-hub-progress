<?php
declare(strict_types=1);

/** Same student-row scope check and update predicate as existing handle_patch_student.
 * No role, login, ownership or complex access policy is changed by combining writes.
 */
function plans_profile_commit(PDO $pdo,int $cid,string $studentId,array $plan,array $catalog): array {
    $scoped=table_column_exists($pdo,'students','complex_id');
    if($scoped){
        $s=$pdo->prepare('SELECT complex_id FROM students WHERE id = ? LIMIT 1');$s->execute([$studentId]);$row=$s->fetch();
        if(!$row)throw new RuntimeException('Not found');
        assert_row_belongs_to_complex(isset($row['complex_id'])?(int)$row['complex_id']:null,$cid);
    }
    $track=(string)$plan['track'];$level=(int)$plan['level_number'];$phase=plans_global_phase_from_level($track,$level,$catalog);
    if($phase<1)throw new RuntimeException('مرحلة الخطة غير صالحة لتحديث ملف الطالب');
    $names=['التأهيل','النجباء','الفرسان','الحفاظ','الخريجين'];$ends=$track==='gold'?[4,10,16,22,30]:[8,20,33,42,60];
    $slot=intdiv($level,1000);$institute=$names[$slot-1]??null;
    if(!$institute)foreach($ends as $i=>$last)if($phase<=$last){$institute=$names[$i];break;}
    $sql='UPDATE students SET level = ?, phase_number = ?, institute_level = ? WHERE id = ?'.($scoped?' AND complex_id = ?':'');
    $pdo->prepare($sql)->execute(array_merge([(string)$phase,$phase,$institute,$studentId],$scoped?[$cid]:[]));
    return ['id'=>$studentId,'level'=>(string)$phase,'phaseNumber'=>$phase,'instituteLevel'=>$institute];
}
function plans_append_record(PDO $pdo,int $cid,string $key,array $record): array {
    $e=state_lock_envelope($pdo,$cid,$key);$records=state_scope_value($e,$key,'_');
    if(isset($records[$record['id']])&&state_canonical($records[$record['id']])!==state_canonical($record))throw new RuntimeException('سجل الاجتياز موجود بقيم مختلفة؛ يلزم مراجعته');
    $records[$record['id']]=$record;$e['scopes']['_']=array_values($records);$e['revision']=($e['revision']??0)+1;
    app_state_upsert($pdo,$key,$e,app_state_tenant_enabled($pdo)?$cid:null);return array_values($records);
}
function plans_pass_records(PDO $pdo,int $cid,array $queueItem,array $oldAssignment,array $sard): array {
    $snapshot=plans_assignment_content($pdo,$oldAssignment);$p=$snapshot['plan'];$phase=($queueItem['phase']??'full')==='review_only'?'review_only':'full';$at=(string)$queueItem['passedAt'];
    $semester=$queueItem['semesterId']??null; // Never infer a historical request's semester from today's active semester.
    $record=['id'=>'ar-assignment-'.$oldAssignment['id'],'studentId'=>$oldAssignment['student_id'],'assignmentId'=>$oldAssignment['id'],'semesterId'=>$semester,
      'halaqaId'=>(int)($queueItem['halaqaId']??0),'week'=>(int)($queueItem['week']??0),'attempt'=>(int)($queueItem['attempt']??1),'result'=>'passed','percent'=>(float)$sard['percent'],
      'hifzScore'=>(float)($sard['hifzScore']??0),'reviewScore'=>(float)($sard['reviewScore']??0),'testDate'=>$at,'planId'=>$oldAssignment['plan_id'],'planTitle'=>$p['title'],'levelNumber'=>(int)$p['level_number'],'track'=>$p['track'],'evaluationRules'=>$queueItem['evaluationRules']??null];
    $history=['id'=>'sh-'.$queueItem['id'].'-'.$record['attempt'].'-'.$phase,'studentId'=>$record['studentId'],'assignmentId'=>$oldAssignment['id'],'semesterId'=>$semester,'halaqaId'=>$record['halaqaId'],'week'=>$record['week'],'attempt'=>$record['attempt'],'result'=>'passed','percent'=>$record['percent'],'at'=>$at,
      'hifzErrors'=>(int)($sard['hifzErrors']??$queueItem['lockedHifzErrors']??0),'hifzWarnings'=>(int)($sard['hifzWarnings']??$queueItem['lockedHifzWarnings']??0),'reviewErrors'=>$sard['reviewErrors']??[],'reviewWarnings'=>$sard['reviewWarnings']??[],'evaluationRules'=>$queueItem['evaluationRules']??null];
    return ['record'=>$record,'academic_records'=>plans_append_record($pdo,$cid,'academic_records',$record),'sard_history'=>plans_append_record($pdo,$cid,'sard_history',$history)];
}
