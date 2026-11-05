<?php
declare(strict_types=1);

function semester_grade_stores_enabled():bool{return defined('QHP_SEMESTER_STORES_V1') && QHP_SEMESTER_STORES_V1 === true;}
function shared_grade_writes_enabled(string $key):bool{return $key==='grades'?grade_writes_enabled():(defined('QHP_SHARED_GRADE_WRITES_V1')&&QHP_SHARED_GRADE_WRITES_V1===true);}
function grade_store_base_key(string $key):string {
    if(in_array($key,['grades','weekly_tests','scientific_grades'],true))return $key;
    if(preg_match('/^term:[A-Za-z0-9_-]{1,64}:(grades|weekly_tests|scientific_grades)$/D',$key,$m))return $m[1];
    throw new RuntimeException('مخزن الدرجات غير مدعوم',400);
}
/** No legacy grade value is ever copied, attributed or deleted. */
function grade_store_key(PDO $pdo,int $cid,string $key,array $calendar):string {
    grade_store_base_key($key);
    if(!semester_grade_stores_enabled())return $key;
    if(!app_state_tenant_enabled($pdo)||!shared_grade_writes_enabled('grades')||!shared_grade_writes_enabled('weekly_tests'))throw new RuntimeException('فصل الفصول يحتاج اكتمال إعداد الحفظ المؤكد؛ لم تتغير السجلات',503);
    $semester=$calendar['active_semester_id']??null;
    if(($calendar['known']??false)!==true||!is_string($semester)||!preg_match('/^[A-Za-z0-9_-]{1,64}$/D',$semester))throw new RuntimeException('لا يوجد فصل مؤكد للحفظ؛ بقي التاريخ القديم دون إسناد',409);
    return 'term:'.$semester.':'.grade_store_base_key($key);
}
function grade_store_current_key(PDO $pdo,int $cid,string $key):string{return grade_store_key($pdo,$cid,$key,grade_cells_calendar($pdo,$cid,false));}
function grade_store_internal_key(string $key):bool{return str_starts_with($key,'term:')||str_starts_with($key,'grade_plan_');}

/** Weekly slots have a virtual pristine blank, permitting independent first writes to different indices. */
function grade_weekly_slot(string $key,array $path):bool{return grade_store_base_key($key)==='weekly_tests'&&count($path)===4&&in_array($path[2],['muraja','rabt'],true)&&ctype_digit($path[3])&&(int)$path[3]<=5;}
function grade_store_cell(string $key,stdClass $store,array $path):array {
    if(!grade_weekly_slot($key,$path))return grade_cells_at($store,$path);
    $values=$store->{$path[0]}->{$path[1]}->{$path[2]}??[];
    $value=is_array($values)?($values[(int)$path[3]]??''):((int)$path[3]===0?$values:'');
    return ['present'=>true,'value'=>$value];
}
function grade_store_set(string $key,stdClass $store,array $path,array $next):void {
    if(!grade_weekly_slot($key,$path)){grade_cells_set($store,$path,$next);return;}
    if(!$next['present']||!in_array($next['value'],['','pass','fail'],true))throw new RuntimeException('قيمة خانة الاختبار غير صالحة',400);
    $values=$store->{$path[0]}->{$path[1]}->{$path[2]}??[];if(!is_array($values))$values=$values===''?[]:[$values];
    $values=array_pad(array_values($values),(int)$path[3]+1,'');$values[(int)$path[3]]=$next['value'];
    grade_cells_set($store,array_slice($path,0,3),['present'=>true,'value'=>$values]);
}
