<?php
declare(strict_types=1);
require_once __DIR__.'/grade-cell-operations.php';
require_once __DIR__.'/grade-plan-effect.php';
require_once __DIR__.'/grade-cutover.php';

/** Explicit rollout switch; creating tables alone never activates production writers. */
function grade_writes_enabled():bool{
    if (defined('QHP_GRADE_WRITES_V1') && QHP_GRADE_WRITES_V1 === true) return true;
    $root = dirname(__DIR__, 2);
    if (!defined('DB_NAME') || DB_NAME !== 'u112851217_msht_io' ||
        !preg_match('~^(/home/[^/]+)/domains/msht\.io/public_html$~D', $root, $paths)) return false;
    return grade_cutover_protocol($root . '/index.html', $paths[1] . '/.qhp-private/grade-cutover.lock');
}

function grade_write_snapshot(PDO $pdo,int $cid,string $cursor='',string $key='grades'):array {
    $owns=!$pdo->inTransaction();
    try {
        if($owns)$pdo->beginTransaction();
        grade_cells_ready($pdo);
        $calendar=grade_cells_calendar($pdo,$cid,false);
        $version=grade_cells_version($pdo,grade_cells_context($pdo,$cid),$key,[],false);
        $currentCursor=hash('sha256',grade_cells_json([$version['subtree_version'],$calendar]));
        if($cursor!=='' && hash_equals($currentCursor,$cursor)) {
            if($owns)$pdo->commit();return ['protocol'=>1,'context_complex_id'=>$cid,'cursor'=>$currentCursor,'unchanged'=>true];
        }
        $store=grade_cells_store($pdo,$cid,$key,false);
        $query=$pdo->prepare('SELECT path_json,direct_version,subtree_version FROM grade_cell_versions WHERE context_id=? AND store_key=?');
        $query->execute([grade_cells_context($pdo,$cid),$key]);$versions=[];
        foreach($query->fetchAll(PDO::FETCH_ASSOC)as$row)$versions[$row['path_json']]=['direct_version'=>$row['direct_version'],'subtree_version'=>$row['subtree_version']];
        $result=['protocol'=>1,'context_complex_id'=>$cid,'cursor'=>$currentCursor,'value'=>$store,'calendar_context'=>$calendar,'versions'=>(object)$versions];
        if($owns)$pdo->commit();return $result;
    }catch(Throwable $error){if($owns&&$pdo->inTransaction())$pdo->rollBack();throw $error;}
}

function grade_write_program_cell(PDO $pdo,int $cid,array $packet): array {
    $changes=$packet['changes']??null;
    $change=is_array($changes)&&array_is_list($changes)&&count($changes)===1?$changes[0]:null;
    $path=is_array($change)?($change['path']??null):null;
    if(!is_array($path)||!array_is_list($path)||count($path)!==5)throw new RuntimeException('يجب تحديد خانة برنامج واحدة',400);
    foreach($path as $part) {
        if(!is_string($part)||$part===''||strlen($part)>128||in_array($part,['__proto__','constructor','prototype'],true))
            throw new RuntimeException('مسار درجة البرنامج غير صالح',400);
    }
    [$halaqa,$student,$week,$programId,$slot]=$path;
    $next=$change['next']??null;
    if(!preg_match('/^[1-9][0-9]*$/D',$halaqa)||!preg_match('/^[1-9][0-9]*$/D',$week)||
        !is_array($next)||!is_bool($next['present']??null)||($next['present']&&!is_string($next['value']??null)))
        throw new RuntimeException('درجة البرنامج غير صالحة',400);
    $validate=static function()use($pdo,$cid,$halaqa,$student,$week,$programId,$slot,$next):void{
        $query=$pdo->prepare('SELECT halaqa_id FROM students WHERE complex_id=? AND id=? FOR UPDATE');
        $query->execute([$cid,$student]);
        if((string)$query->fetchColumn()!==$halaqa)throw new RuntimeException('الطالب لم يعد في هذه الحلقة',409);
        $query=$pdo->prepare('SELECT weeks_count FROM semesters WHERE complex_id=? AND is_active=1');
        $query->execute([$cid]);
        if((int)$week>(int)$query->fetchColumn())throw new RuntimeException('الأسبوع خارج الفصل النشط',409);
        $query=$pdo->prepare("SELECT value FROM app_state WHERE complex_id=? AND `key`='halaqa_programs' FOR UPDATE");
        $query->execute([$cid]);
        $registry=json_decode((string)$query->fetchColumn(),true,512,JSON_THROW_ON_ERROR);
        foreach($registry[$halaqa]??[] as $program){
            if(($program['id']??null)!==$programId || ($program['active']??true)===false ||
                ($program['kind']??null)==='scientific' || $programId==='scientific-grades-auto')continue;
            $slots=($program['scheduleMode']??null)==='weekdays'
                ? ($program['weekdays']??[]) : array_map(static fn($i)=>'slot-'.$i,range(0,max(1,min(7,(int)($program['timesPerWeek']??1)))-1));
            $labels=!empty($program['levels'])?array_column($program['levels'],'label'):($program['options']??[]);
            $labels=array_values(array_filter(array_map('trim',$labels),static fn($label)=>$label!==''));
            if(!$labels)$labels=['ممتاز','جيد','ضعيف'];
            if(in_array($slot,$slots,true) && (!$next['present']||in_array($next['value'],$labels,true)))return;
        }
        throw new RuntimeException('تغيرت إعدادات خانة البرنامج؛ بقيت المسودة',409);
    };
    return grade_cells_apply($pdo,$cid,'halaqa_program_grades',(string)($packet['operation_id']??''),
        $packet['calendar_context']??[],$changes,0,$validate);
}

function grade_write_request(PDO $pdo,int $cid,array $packet,array $auth=[]):array {
    $changes=$packet['changes']??null;
    if(!is_array($changes)||count($changes)>100)throw new RuntimeException('دفعة الدرجات غير صالحة أو كبيرة جدًا',400);
    foreach($changes as$change){$path=$change['path']??[];if(!is_array($path)||count($path)>12)throw new RuntimeException('مسار الدرجة غير صالح',400);foreach($path as$part)if(!is_string($part)||strlen($part)>256||in_array($part,['__proto__','constructor','prototype'],true))throw new RuntimeException('مسار الدرجة غير صالح',400);}
    foreach ($changes as $change) {
        $path = $change['path'];
        $weekly = count($path) === 3 && in_array($path[2], ['testMuraja','testRabt','sard','compensationFaces','compensationPlanSegments','compensationMurajaFaces'], true);
        $day = in_array($path[3] ?? '', ['sun','mon','tue','wed','thu','fri','sat'], true) && ($path[2] ?? '') === 'days';
        $daily = $day && count($path) === 5 && in_array($path[4], ['attendance','hifz','rabt','muraja','wajib','compensationFaces','hifzPlanSegments'], true);
        $custom = $day && count($path) === 6 && $path[4] === 'custom';
        if (!array_is_list($path) || !ctype_digit($path[1] ?? '') || (!$weekly && !$daily && !$custom)) {
            throw new RuntimeException('يجب أن يستهدف الطلب خانة درجة محددة',400);
        }
    }
    $operation=(string)($packet['operation_id']??'');$effect=$packet['plan']??null;
    if($effect!==null){
        if(!is_array($effect))throw new RuntimeException('رابط الإنجاز غير صالح',400);
        $cell=null;foreach($changes as$change)if(($change['path']??null)===($effect['cell_path']??null))$cell=$change;
        if(!$cell||($cell['next']['present']??false)!==true)throw new RuntimeException('الدرجة والإنجاز لا يستهدفان الخلية نفسها',400);
        $value=$cell['next']['value'];$task=$effect['task_type']??'';
        $valid=($effect['action']??'')==='compensation'?is_numeric($value):(($effect['action']??'')==='record'?($task==='hifz'?$value===($effect['tap']??null):$value==='pass'):($task==='hifz'?$value==='':in_array($value,['','fail'],true)));
        if(!$valid)throw new RuntimeException('قيمة الدرجة لا تطابق إجراء الإنجاز',400);
    }
    $apply=static function(stdClass $store)use($pdo,$cid,$auth,$effect,$operation,$changes):void{
        if(plans_table_exists($pdo,'student_plan_assignments'))foreach($changes as$change){
            $path=$change['path'];$field=$path[count($path)-1];
            $linked=in_array($field,['hifz','rabt','muraja','compensationFaces'],true);
            if(!$linked)continue;
            if(in_array($field,['rabt','muraja'],true)&&($change['base']['value']??'')!=='pass'&&($change['next']['value']??'')!=='pass')continue;
            $q=$pdo->prepare("SELECT COUNT(*) FROM student_plan_assignments WHERE student_id=? AND status IN ('active','frozen')");$q->execute([$path[0]]);
            if((int)$q->fetchColumn()>0 && (!$effect||$effect['cell_path']!==$path))throw new RuntimeException('هذه الدرجة مرتبطة بخطة؛ يلزم تسجيل الدرجة والإنجاز معًا، ولم يُحفظ جزء منفرد',409);
        }
        if($effect)grade_plan_effect($pdo,$cid,$auth,$effect,$operation,$store);
    };
    return grade_cells_apply($pdo,$cid,'grades',$operation,$packet['calendar_context']??[],$changes,0,$apply,$effect??[]);
}
