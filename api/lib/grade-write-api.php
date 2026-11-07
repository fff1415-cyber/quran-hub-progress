<?php
declare(strict_types=1);
require_once __DIR__.'/grade-cell-operations.php';
require_once __DIR__.'/grade-plan-effect.php';

/** Explicit rollout switch; creating tables alone never activates production writers. */
function grade_writes_enabled():bool{return defined('QHP_GRADE_WRITES_V1') && QHP_GRADE_WRITES_V1 === true;}

function grade_write_snapshot(PDO $pdo,int $cid,string $cursor='',string $logicalKey='grades'):array {
    $owns=!$pdo->inTransaction();
    try {
        if($owns)$pdo->beginTransaction();
        grade_cells_ready($pdo);
        $calendar=grade_cells_calendar($pdo,$cid,false);$key=grade_store_key($pdo,$cid,$logicalKey,$calendar);
        $version=grade_cells_version($pdo,grade_cells_context($pdo,$cid),$key,[],false);
        $currentCursor=hash('sha256',grade_cells_json([$key,$version['subtree_version'],$calendar]));
        if($cursor!=='' && hash_equals($currentCursor,$cursor)) {
            if($owns)$pdo->commit();return ['protocol'=>1,'store_key'=>$logicalKey,'context_complex_id'=>$cid,'cursor'=>$currentCursor,'unchanged'=>true];
        }
        $store=grade_cells_store($pdo,$cid,$key,false);
        $query=$pdo->prepare('SELECT path_json,direct_version,subtree_version FROM grade_cell_versions WHERE context_id=? AND store_key=?');
        $query->execute([grade_cells_context($pdo,$cid),$key]);$versions=[];
        foreach($query->fetchAll(PDO::FETCH_ASSOC)as$row)$versions[$row['path_json']]=['direct_version'=>$row['direct_version'],'subtree_version'=>$row['subtree_version']];
        $result=['protocol'=>1,'store_key'=>$logicalKey,'context_complex_id'=>$cid,'cursor'=>$currentCursor,'value'=>$store,'calendar_context'=>$calendar,'versions'=>(object)$versions,'semester_scoped'=>semester_grade_stores_enabled()];
        if($owns)$pdo->commit();return $result;
    }catch(Throwable $error){if($owns&&$pdo->inTransaction())$pdo->rollBack();throw $error;}
}

function grade_write_request(PDO $pdo,int $cid,array $packet,array $auth=[],string $key='grades'):array {
    if(!in_array($key,['grades','scientific_grades'],true))throw new RuntimeException('سجّل الاختبار من واجهته المخصصة',403);
    $changes=$packet['changes']??null;
    if(!is_array($changes)||count($changes)>100)throw new RuntimeException('دفعة الدرجات غير صالحة أو كبيرة جدًا',400);
    foreach($changes as$change){$path=$change['path']??[];if(!is_array($path)||count($path)>12)throw new RuntimeException('مسار الدرجة غير صالح',400);foreach($path as$part)if(!is_string($part)||strlen($part)>256||in_array($part,['__proto__','constructor','prototype'],true))throw new RuntimeException('مسار الدرجة غير صالح',400);}
    $operation=(string)($packet['operation_id']??'');$effect=$packet['plan']??null;
    if($effect!==null){
        if($key!=='grades')throw new RuntimeException('رابط الإنجاز غير صالح لهذا المخزن',400);
        if(!is_array($effect))throw new RuntimeException('رابط الإنجاز غير صالح',400);
        $cell=null;foreach($changes as$change)if(($change['path']??null)===($effect['cell_path']??null))$cell=$change;
        if(!$cell||($cell['next']['present']??false)!==true)throw new RuntimeException('الدرجة والإنجاز لا يستهدفان الخلية نفسها',400);
        $value=$cell['next']['value'];$task=$effect['task_type']??'';
        $valid=($effect['action']??'')==='compensation'?is_numeric($value):(($effect['action']??'')==='record'?($task==='hifz'?$value===($effect['tap']??null):$value==='pass'):($task==='hifz'?$value==='':in_array($value,['','fail'],true)));
        if(!$valid)throw new RuntimeException('قيمة الدرجة لا تطابق إجراء الإنجاز',400);
    }
    $apply=static function(stdClass $store,string $versionKey)use($pdo,$cid,$auth,$effect,$operation,$changes):void{
        if(plans_table_exists($pdo,'student_plan_assignments'))foreach($changes as$change){
            $path=$change['path'];$field=$path[count($path)-1];
            $linked=in_array($field,['hifz','rabt','muraja','compensationFaces'],true);
            if(!$linked)continue;
            if(in_array($field,['rabt','muraja'],true)&&($change['base']['value']??'')!=='pass'&&($change['next']['value']??'')!=='pass')continue;
            $q=$pdo->prepare("SELECT COUNT(*) FROM student_plan_assignments WHERE student_id=? AND status IN ('active','frozen')");$q->execute([$path[0]]);
            if((int)$q->fetchColumn()>0 && (!$effect||$effect['cell_path']!==$path))throw new RuntimeException('هذه الدرجة مرتبطة بخطة؛ يلزم تسجيل الدرجة والإنجاز معًا، ولم يُحفظ جزء منفرد',409);
        }
        if($effect)grade_plan_effect($pdo,$cid,$auth,$effect,$operation,$store,$versionKey);
    };
    return grade_cells_apply($pdo,$cid,$key,$operation,$packet['calendar_context']??[],$changes,0,$key==='grades'?$apply:null,$effect??[],grade_packet_is_scoped($packet));
}
