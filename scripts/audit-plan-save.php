<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit(1);
$root=$argv[1]??'';
if (!preg_match('~^/home/[A-Za-z0-9_-]+/domains/msht\.io/public_html$~D',$root) || realpath($root)!==$root ||
    trim(file_get_contents($root.'/deploy-sha.txt'))!=='a40a5b9cd131e452c69e9fea0d91e49a8da677f8') exit(1);
require $root.'/api/config.php';
if (DB_NAME!=='u112851217_msht_io') exit(1);
try {
    $pdo=new PDO('mysql:host='.DB_HOST.';dbname='.DB_NAME.';charset='.DB_CHARSET,DB_USER,DB_PASS,
        [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
    $pdo->exec('SET TRANSACTION READ ONLY');
    $pdo->beginTransaction();
    $students=$pdo->query('SELECT id,complex_id,halaqa_id FROM students')->fetchAll(PDO::FETCH_UNIQUE);
    $assignments=$pdo->query("SELECT student_id,id FROM student_plan_assignments WHERE status IN ('active','frozen') ORDER BY assigned_at DESC")->fetchAll(PDO::FETCH_GROUP|PDO::FETCH_COLUMN);
    $halaqat=$pdo->query('SELECT id FROM halaqat')->fetchAll(PDO::FETCH_COLUMN);
    $counts=[];$known=[];
    foreach ($pdo->query("SELECT complex_id,value FROM app_state WHERE `key`='sard_queue'") as $state) {
        foreach (json_decode($state['value'],true,512,JSON_THROW_ON_ERROR) as $item) {
            $student=$students[$item['studentId']??'']??[];
            $current=($assignments[$item['studentId']??''][0]??null)===($item['assignmentId']??'');
            if ($current && ($item['status']??'')!=='archived') $known[$item['assignmentId']]=true;
            $type=empty($item['manualReferralAt'])?'standard':'manual';
            $status=($item['status']??'unknown').(isset($item['archiveReason'])?'/'.$item['archiveReason']:'');
            if ($type==='standard' && !$current) continue;
            $scope=!$student?'missing_student':((int)$student['complex_id']!==(int)$state['complex_id']?'other_complex':
                (!in_array((int)($item['halaqaId']??0),array_map('intval',$halaqat),true)?'missing_queue_halaqa':
                ((int)$student['halaqa_id']!==(int)($item['halaqaId']??0)?'moved_halaqa':'matched')));
            $key=$type.'/'.$status.'/'.($current?'current':'old').'/'.$scope;
            $counts[$key]=($counts[$key]??0)+1;
        }
    }
    $eligible=$pdo->query("SELECT a.id FROM student_plan_assignments a
        WHERE a.status='active' AND EXISTS(SELECT 1 FROM plan_segments s WHERE s.plan_id=a.plan_id AND s.segment_index>=a.start_segment_index)
        AND NOT EXISTS(SELECT 1 FROM plan_segments s WHERE s.plan_id=a.plan_id AND s.segment_index>=a.start_segment_index
            AND NOT EXISTS(SELECT 1 FROM segment_completions c WHERE c.student_id=a.student_id AND c.plan_id=a.plan_id
                AND c.segment_index=s.segment_index AND c.task_type='hifz'
                AND (c.assignment_id=a.id OR (c.assignment_id IS NULL AND c.created_at>=a.assigned_at))))")->fetchAll(PDO::FETCH_COLUMN);
    $pdo->rollBack();
    echo json_encode(['production_writes'=>false,'queue'=>$counts,'complete_without_live_or_terminal_request'=>count(array_diff($eligible,array_keys($known)))],JSON_THROW_ON_ERROR).PHP_EOL;
} catch (Throwable $e) {
    echo json_encode(['status'=>'audit_failed','sqlstate'=>(string)$e->getCode()]).PHP_EOL;
    exit(1);
}
