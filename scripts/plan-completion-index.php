<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli')exit(1);

function completion_index(PDO $db): array {
    $rows=$db->query("SELECT INDEX_NAME,GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns_used
        FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='segment_completions'
        AND NON_UNIQUE=0 GROUP BY INDEX_NAME")->fetchAll();
    return array_column($rows,'columns_used','INDEX_NAME');
}

function completion_fingerprint(PDO $db): array {
    $hash=hash_init('sha256');$count=0;
    foreach($db->query('SELECT * FROM segment_completions ORDER BY id') as $row){
        hash_update($hash,json_encode($row,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE)."\n");$count++;
    }
    return ['rows'=>$count,'sha256'=>hash_final($hash)];
}

function migrate_completion_index(PDO $db): bool {
    $before=completion_index($db);
    $old='student_id,plan_id,segment_index,task_type';
    if(($before['uk_completion_assignment']??null)===$old.',assignment_id'&&!isset($before['uk_completion']))return false;
    if(($before['uk_completion']??null)!==$old||isset($before['uk_completion_assignment']))throw new RuntimeException('completion_index_scope');
    if($db->query("SELECT 1 FROM segment_completions GROUP BY student_id,plan_id,segment_index,task_type,assignment_id HAVING COUNT(*)>1 LIMIT 1")->fetchColumn())
        throw new RuntimeException('completion_duplicates');
    $db->exec('SET SESSION lock_wait_timeout=5');
    $db->exec('ALTER TABLE segment_completions
        DROP INDEX uk_completion,
        ADD UNIQUE INDEX uk_completion_assignment (student_id,plan_id,segment_index,task_type,assignment_id),
        ALGORITHM=INPLACE, LOCK=NONE');
    $after=completion_index($db);
    if(($after['uk_completion_assignment']??null)!==$old.',assignment_id'||isset($after['uk_completion']))
        throw new RuntimeException('completion_index_not_verified');
    return true;
}

function verify_completion_isolation(PDO $db): void {
    $q=$db->query("SELECT c.id,c.student_id,c.plan_id,c.segment_index,c.task_type,a.id AS new_assignment
        FROM segment_completions c JOIN student_plan_assignments a ON a.student_id=c.student_id AND a.plan_id=c.plan_id
        JOIN students s ON s.id=c.student_id JOIN complexes x ON x.id=s.complex_id
        WHERE x.subdomain='m6' AND s.halaqa_id=14 AND a.status='active' AND c.task_type='hifz'
        AND (c.assignment_id<>a.id OR (c.assignment_id IS NULL AND c.created_at<a.assigned_at))
        AND NOT EXISTS(SELECT 1 FROM segment_completions n WHERE n.student_id=c.student_id AND n.plan_id=c.plan_id
            AND n.segment_index=c.segment_index AND n.task_type=c.task_type AND n.assignment_id=a.id)
        LIMIT 1");
    $sample=$q->fetch();if(!$sample)throw new RuntimeException('isolated_assignment_collision_sample_missing');
    $read=$db->prepare('SELECT * FROM segment_completions WHERE id=?');
    $read->execute([$sample['id']]);$original=$read->fetch();
    $db->beginTransaction();
    try {
        $insert=$db->prepare('INSERT INTO segment_completions
            (id,student_id,plan_id,segment_index,task_type,completed_at,recorded_by,assignment_id)
            VALUES (?,?,?,?,?,?,?,?)');
        $id='test-'.bin2hex(random_bytes(14));
        $values=[$sample['student_id'],$sample['plan_id'],$sample['segment_index'],$sample['task_type'],gmdate('Y-m-d'),'isolated test',$sample['new_assignment']];
        $insert->execute([$id,...$values]);
        try {
            $insert->execute(['test-'.bin2hex(random_bytes(14)),...$values]);
            throw new RuntimeException('isolated_duplicate_accepted');
        } catch(PDOException $error) {
            if((int)($error->errorInfo[1]??0)!==1062)throw $error;
        }
        $delete=$db->prepare('DELETE FROM segment_completions WHERE id=? AND assignment_id=?');
        $delete->execute([$id,$sample['new_assignment']]);
        if($delete->rowCount()!==1)throw new RuntimeException('isolated_cancellation_scope');
        $read->execute([$sample['id']]);
        if($read->fetch()!==$original)throw new RuntimeException('isolated_historical_record_changed');
    } finally {$db->rollBack();}
}

try {
    [$script,$root,$release,$mode]=$argv;
    if(!preg_match('~^(/home/[A-Za-z0-9_-]+)/domains/msht[.]io/public_html$~D',$root,$match) ||
        realpath($root)!==$root || !preg_match('/^[a-f0-9]{40}$/D',$release) ||
        trim(file_get_contents($root.'/deploy-sha.txt'))!==$release || !in_array($mode,['test','production'],true))
        throw new RuntimeException('completion_deployment_scope');
    require $root.'/api/config.php';
    if(DB_NAME!=='u112851217_msht_io')throw new RuntimeException('completion_database_scope');
    if($mode==='test'){
        $file=$match[1].'/.qhp-private/msht-test.php';
        if(realpath($file)!==$file || (fileperms($file)&0077)!==0)throw new RuntimeException('completion_test_config_scope');
        $settings=qhp_load_private_test_config((string)file_get_contents($file));
        if($settings['database']!=='u112851217_msht_test'||$settings['user']===DB_USER)
            throw new RuntimeException('completion_test_not_isolated');
        [$host,$name,$user,$password]=[$settings['host'],$settings['database'],$settings['user'],$settings['password']];
    } else {
        require $root.'/api/schema.php';
        if(!str_contains((string)file_get_contents($root.'/api/schema.php'),"[...\$key, 'assignment_id']"))
            throw new RuntimeException('completion_compatible_code_required');
        $archives=glob($match[1].'/.qhp-db-backups/*/manifest.json');sort($archives,SORT_STRING);$manifestPath=end($archives);
        if(!$manifestPath||time()-filemtime($manifestPath)>900)throw new RuntimeException('completion_fresh_backup_required');
        $manifest=json_decode(file_get_contents($manifestPath),true,512,JSON_THROW_ON_ERROR);
        $archive=dirname($manifestPath).'/production.sql.gz';
        if(($manifest['status']??null)!=='backup_created'||realpath($archive)!==$archive||
            !hash_equals($manifest['sha256']??'',hash_file('sha256',$archive)))throw new RuntimeException('completion_backup_integrity');
        [$host,$name,$user,$password]=[DB_HOST,DB_NAME,DB_USER,DB_PASS];
    }
    $db=new PDO('mysql:host='.$host.';dbname='.$name.';charset=utf8mb4',$user,$password,
        [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
    if($db->query('SELECT DATABASE()')->fetchColumn()!==$name)throw new RuntimeException('completion_database_identity');
    $before=completion_fingerprint($db);
    $changed=migrate_completion_index($db);
    if($mode==='test')verify_completion_isolation($db);
    elseif(!schema_inspect($db)['ready'])throw new RuntimeException('completion_schema_health');
    $after=completion_fingerprint($db);
    if($mode==='test'&&$before!==$after)throw new RuntimeException('isolated_completion_rows_changed');
    echo json_encode(['mode'=>$mode,'index_verified'=>true,'index_changed'=>$changed,'row_count'=>$after['rows'],
        'existing_rows_match'=>$before===$after,'isolated_reassignment_and_undo_verified'=>$mode==='test',
        'backup_id'=>$manifest['backup_id']??null],JSON_THROW_ON_ERROR).PHP_EOL;
}catch(Throwable $error){
    if(isset($db)&&$db->inTransaction())$db->rollBack();
    echo json_encode(['status'=>'completion_index_failed','code'=>preg_match('/^[a-z0-9_]+$/D',$error->getMessage())
        ?$error->getMessage():$error->getCode(),'driver_code'=>$error instanceof PDOException?(int)($error->errorInfo[1]??0):null]).PHP_EOL;
    exit(1);
}
