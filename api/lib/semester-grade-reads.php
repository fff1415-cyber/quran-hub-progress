<?php
declare(strict_types=1);
function semester_legacy_grade_rows(PDO $pdo,int $cid,string $key):array {
    $store=grade_cells_store($pdo,$cid,$key,false);
    return [['key'=>$key,'value'=>$store,'context_complex_id'=>$cid,'calendar_context'=>['known'=>false,'active_semester_id'=>null],'read_only'=>true,'legacy_unknown_semester'=>true]];
}
function semester_project_grade_rows(PDO $pdo,int $cid,array $rows,array $keys):array {
    if(!semester_grade_stores_enabled())return $rows;
    $rows=array_values(array_filter($rows,static fn($row)=>!in_array($row['key']??'', ['grades','weekly_tests','scientific_grades'],true)&&!grade_store_internal_key((string)($row['key']??''))));
    foreach($keys as$key){$snapshot=grade_write_snapshot($pdo,$cid,'',$key);$rows[]=['key'=>$key,'value'=>$snapshot['value'],'context_complex_id'=>$cid,'calendar_context'=>$snapshot['calendar_context'],'semester_scoped'=>true];}
    return $rows;
}
function semester_handle_grade_read(PDO $pdo,int $cid,string $key):void {
    if(($_GET['history']??'')==='1'){
        if(!semester_grade_stores_enabled())error_response('عرض الفصول المؤرشفة غير مفعّل',503);
        $rows=semester_legacy_grade_rows($pdo,$cid,$key);
        $q=$pdo->prepare('SELECT `key`,value FROM app_state WHERE complex_id=? AND `key` LIKE ?');$q->execute([$cid,'term:%:'.$key]);
        foreach($q->fetchAll(PDO::FETCH_ASSOC)as$row){
            if(!preg_match('/^term:([A-Za-z0-9_-]{1,64}):'.preg_quote($key,'/').'$/D',$row['key'],$m))continue;
            $rows[]=['key'=>$key,'value'=>json_decode($row['value'],false,512,JSON_THROW_ON_ERROR),'semester_id'=>$m[1],'read_only'=>true,'legacy_unknown_semester'=>false];
        }
        json_response($rows);return;
    }
    if(($_GET['legacy']??'')==='1'){json_response(semester_legacy_grade_rows($pdo,$cid,$key));return;}
    if(($_GET['grade_protocol']??'')==='1'){
        if(!shared_grade_writes_enabled($key))error_response('الحفظ المؤكد غير مفعّل؛ بقيت المسودات محفوظة',503);
        json_response(grade_write_snapshot($pdo,$cid,(string)($_GET['grade_cursor']??''),$key));return;
    }
    json_response(semester_project_grade_rows($pdo,$cid,[],[$key]));
}
