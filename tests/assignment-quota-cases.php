<?php
declare(strict_types=1);
function quotaFailure(callable $action,string $message):void {
 try{$action();throw new LogicException('quota fixture expected rejection');}
 catch(RuntimeException $e){check(str_contains($e->getMessage(),$message),'quota mutation rejects '.$message);}
}
function quotaCases(PDO $pdo,string $plan):void {
 $GLOBALS['auth']=['role'=>'supervisor','complexId'=>1,'name'=>'fixture'];
 $pdo->exec("INSERT INTO students(id,complex_id,phase_number,level) VALUES('quota-S',1,1,'1')");
 $insert=$pdo->prepare('INSERT INTO student_plan_assignments(id,student_id,plan_id,start_segment_index,status,daily_hifz_faces,daily_rabt_faces,daily_muraja_faces,faces_per_half,faces_per_one,faces_per_two) VALUES(?,?,?,1,?,9,9,9,9,9,9)');
 $insert->execute(['quota-old','quota-S',$plan,'transferred']);$insert->execute(['quota-current','quota-S',$plan,'frozen']);
 $before=$pdo->query("SELECT * FROM student_plan_assignments WHERE id='quota-old'")->fetch();
 $completions=$pdo->query('SELECT * FROM segment_completions ORDER BY student_id,plan_id,segment_index')->fetchAll();
 $GLOBALS['input']=['student_id'=>'quota-S','assignment_id'=>'quota-current','daily_hifz_faces'=>99];handle_patch_assignment_quotas();
 $track=$pdo->prepare('SELECT track FROM education_plans WHERE id=?');$track->execute([$plan]);$faces=plans_track_face_quotas((string)$track->fetchColumn());
 $current=$pdo->query("SELECT * FROM student_plan_assignments WHERE id='quota-current'")->fetch();
 foreach($faces as $key=>$value)check((float)$current[$key]===(float)$value,'quota target uses the existing track policy for '.$key);
 check($GLOBALS['response']['assignment_id']==='quota-current'&&$current['status']==='frozen','frozen target confirms its exact identity without resuming');
 check($pdo->query("SELECT * FROM student_plan_assignments WHERE id='quota-old'")->fetch()===$before&&$pdo->query('SELECT * FROM segment_completions ORDER BY student_id,plan_id,segment_index')->fetchAll()===$completions,'quota update preserves archived assignments and all completion history');
 handle_patch_assignment_quotas();check($GLOBALS['response']['assignment_id']==='quota-current','repeated quota request confirms the same target');
 $GLOBALS['input']['assignment_id']='quota-old';quotaFailure(fn()=>handle_patch_assignment_quotas(),'تغيّرت خطة الطالب');
 unset($GLOBALS['input']['assignment_id']);quotaFailure(fn()=>handle_patch_assignment_quotas(),'معرّف التعيين');
 $insert->execute(['quota-duplicate','quota-S',$plan,'active']);$all=$pdo->query("SELECT * FROM student_plan_assignments WHERE student_id='quota-S' ORDER BY id")->fetchAll();
 $GLOBALS['input']['assignment_id']='quota-current';quotaFailure(fn()=>handle_patch_assignment_quotas(),'تعيينات حالية متعددة');
 check($pdo->query("SELECT * FROM student_plan_assignments WHERE student_id='quota-S' ORDER BY id")->fetchAll()===$all,'ambiguous quota targets remain intact for review');
 foreach(['teacher','assistant','secretary','musammi','student','parent'] as $role){$GLOBALS['auth']['role']=$role;quotaFailure(fn()=>handle_patch_assignment_quotas(),'Forbidden');}
 $GLOBALS['auth']['role']='manager';$pdo->exec("UPDATE student_plan_assignments SET status='transferred' WHERE id='quota-duplicate'");handle_patch_assignment_quotas();check($GLOBALS['response']['ok']===true,'existing manager quota action remains supported');
}
