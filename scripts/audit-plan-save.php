<?php
declare(strict_types=1);
if (PHP_SAPI!=='cli') exit(1);
$root=$argv[1]??'';
if (!preg_match('~^/home/[A-Za-z0-9_-]+/domains/msht\.io/public_html$~D',$root) || realpath($root)!==$root ||
    trim(file_get_contents($root.'/deploy-sha.txt'))!=='4eb275ef00092ea07cd15f0983c6b256efdeaac8') exit(1);
require $root.'/api/config.php';
require $root.'/api/routes/plans.php';
if (DB_NAME!=='u112851217_msht_io') exit(1);
try {
    $pdo=new PDO('mysql:host='.DB_HOST.';dbname='.DB_NAME.';charset='.DB_CHARSET,DB_USER,DB_PASS,
        [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
    $pdo->exec('SET TRANSACTION READ ONLY');$pdo->beginTransaction();
    $indices=$pdo->query("SELECT INDEX_NAME,GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns_used FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='segment_completions' AND NON_UNIQUE=0 GROUP BY INDEX_NAME")->fetchAll();
    $scope=$pdo->query("SELECT h.name FROM halaqat h JOIN complexes x ON x.id=h.complex_id WHERE h.id=14 AND x.subdomain='m6'")->fetchColumn();
    if(!$scope)throw new RuntimeException('m6_halaqa_scope');
    $legacy=$pdo->query("SELECT spa.id,spa.student_id,spa.plan_id,spa.start_segment_index,spa.assigned_at,ep.track FROM student_plan_assignments spa JOIN education_plans ep ON ep.id=spa.plan_id JOIN students s ON s.id=spa.student_id JOIN complexes x ON x.id=s.complex_id WHERE x.subdomain='m6' AND s.halaqa_id=14 AND spa.status='active' AND EXISTS(SELECT 1 FROM segment_completions c WHERE c.student_id=spa.student_id AND c.plan_id=spa.plan_id AND c.task_type='hifz' AND (c.assignment_id IS NULL OR c.assignment_id<>spa.id))")->fetchAll();
    $segment=$pdo->prepare('SELECT segment_index FROM plan_segments WHERE plan_id=? ORDER BY segment_index');
    $completions=$pdo->prepare("SELECT assignment_id,segment_index,created_at FROM segment_completions WHERE student_id=? AND plan_id=? AND task_type='hifz'");
    $counts=['active_with_other_or_legacy_completion'=>count($legacy),'current_selector_duplicate'=>0,'fixed_selector_duplicate'=>0,'fixed_can_save'=>0,'older_assignment_collision'=>0,'legacy_current_collision'=>0];
    foreach ($legacy as $a) {
        $segment->execute([$a['plan_id']]);$segments=array_map('intval',$segment->fetchAll(PDO::FETCH_COLUMN));
        $completions->execute([$a['student_id'],$a['plan_id']]);$all=[];$old=[];$eligible=[];
        foreach ($completions as $row) {
            $n=(int)$row['segment_index'];$all[$n]=$row;
            if ($row['assignment_id']===$a['id']) $old[]=$n;
            if ($row['assignment_id']===$a['id'] || ($row['assignment_id']===null && $row['created_at']>=$a['assigned_at'])) $eligible[]=$n;
        }
        $tap=$a['track']==='gold'?'one':'half';
        $select=static fn($done)=>plans_next_hifz_segments_for_tap($a['track'],$tap,(int)$a['start_segment_index'],$segments,$done);
        $bad=array_intersect($select($old),array_keys($all));
        if (!$bad) continue;
        $counts['current_selector_duplicate']++;
        foreach ($bad as $n) {
            $row=$all[$n];
            $counts[$row['assignment_id']===null && $row['created_at']>=$a['assigned_at']?'legacy_current_collision':'older_assignment_collision']++;
        }
        $fixed=$select($eligible);
        if (array_intersect($fixed,array_keys($all))) $counts['fixed_selector_duplicate']++;
        elseif ($fixed) $counts['fixed_can_save']++;
    }
    $pdo->rollBack();
    echo json_encode(['status'=>'plan_save_audit','halaqa'=>$scope,'production_writes'=>false,'unique_indexes'=>$indices]+$counts,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE).PHP_EOL;
} catch(Throwable $e) {
    echo json_encode(['status'=>'audit_failed','class'=>get_class($e)]).PHP_EOL;exit(1);
}
