<?php
declare(strict_types=1);

/** Data-only optimistic writes. Existing routes must keep their current authorization. */
function grade_cells_json(mixed $value): string
{
    $normalize = static function (mixed $item) use (&$normalize): mixed {
        if ($item instanceof stdClass) {
            $properties=get_object_vars($item);ksort($properties,SORT_STRING);$out=new stdClass();
            foreach($properties as $key=>$child)$out->{(string)$key}=$normalize($child);
            return $out;
        }
        if(is_array($item)) {
            if(!array_is_list($item))ksort($item,SORT_STRING);
            foreach($item as &$child)$child=$normalize($child);
        }
        return $item;
    };
    return json_encode($normalize($value),JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
}

function grade_cells_path(mixed $path): array
{
    if(!is_array($path)||!array_is_list($path)||!$path)throw new RuntimeException('مسار خلية الدرجة غير صالح');
    foreach($path as $part)if(!is_string($part)||$part==='')throw new RuntimeException('مسار خلية الدرجة غير صالح');
    return $path;
}

function grade_cells_ready(PDO $pdo): void
{
    foreach(['grade_cell_versions','grade_operation_receipts'] as $table) {
        if(!plans_table_exists($pdo,$table))throw new RuntimeException('بروتوكول تأكيد الدرجة غير مهيأ؛ بقيت السجلات دون تغيير');
    }
}

/** Metadata follows the original physical app_state key, including the unscoped legacy schema. */
function grade_cells_context(PDO $pdo,int $cid): int
{
    return app_state_tenant_enabled($pdo)?$cid:0;
}

function grade_cells_calendar(PDO $pdo,int $cid,bool $lock): array
{
    if(!$lock)return app_state_read_calendar_context($pdo,$cid);
    if(!plans_table_exists($pdo,'semesters'))return ['known'=>false,'active_semester_id'=>null];
    $scoped=table_column_exists($pdo,'semesters','complex_id');
    $query=$pdo->prepare('SELECT id FROM semesters WHERE is_active=1'.($scoped?' AND complex_id=?':'').' ORDER BY id FOR UPDATE');
    $query->execute($scoped?[$cid]:[]);$ids=$query->fetchAll(PDO::FETCH_COLUMN);
    return count($ids)>1?['known'=>false,'active_semester_id'=>null]:['known'=>true,'active_semester_id'=>$ids?(string)$ids[0]:null];
}

function grade_cells_store(PDO $pdo,int $cid,string $key,bool $lock): stdClass
{
    if(!in_array($key,['grades','weekly_tests','scientific_grades'],true))throw new RuntimeException('مخزن الدرجات غير مدعوم');
    $scoped=app_state_tenant_enabled($pdo);
    $query=$pdo->prepare('SELECT value FROM app_state WHERE '.($scoped?'complex_id=? AND ':'').'`key`=?'.($lock?' FOR UPDATE':''));
    $query->execute($scoped?[$cid,$key]:[$key]);$raw=$query->fetchColumn();
    if($lock&&!$pdo->inTransaction())throw new RuntimeException('انتهت معاملة الدرجة؛ لم يُثبّت الطلب',409);
    if($raw===false)return new stdClass();
    $value=json_decode((string)$raw,false,512,JSON_THROW_ON_ERROR);
    if($value===null||$value===[])return new stdClass();
    if(!($value instanceof stdClass))throw new RuntimeException('صيغة مخزن الدرجات تحتاج مراجعة؛ لم تُستبدل أو تُصفّر');
    return $value;
}

function grade_cells_at(stdClass $value,array $path): array
{
    $current=$value;
    foreach($path as $part) {
        if(!($current instanceof stdClass))throw new RuntimeException('بنية خلية الدرجة تغيرت؛ لم تُستبدل بيانات أخرى',409);
        if(!property_exists($current,$part))return ['present'=>false];
        $current=$current->{$part};
    }
    return ['present'=>true,'value'=>$current];
}

function grade_cells_set(stdClass $value,array $path,array $next): void
{
    $current=$value;$last=array_pop($path);
    foreach($path as $part) {
        if(!property_exists($current,$part)) {
            if(!$next['present'])return;
            $current->{$part}=new stdClass();
        }
        if(!($current->{$part} instanceof stdClass))throw new RuntimeException('بنية خلية الدرجة تغيرت؛ لم يُمس سجل مجاور',409);
        $current=$current->{$part};
    }
    if($next['present'])$current->{$last}=$next['value'];else unset($current->{$last});
}

function grade_cells_version(PDO $pdo,int $context,string $key,array $path,bool $lock): array
{
    $json=grade_cells_json($path);
    $query=$pdo->prepare('SELECT path_json,direct_version,subtree_version FROM grade_cell_versions WHERE context_id=? AND store_key=? AND path_sha256=?'.($lock?' FOR UPDATE':''));
    $query->execute([$context,$key,hash('sha256',$json)]);$row=$query->fetch();
    if(!$row)return ['direct_version'=>null,'subtree_version'=>null];
    if($row['path_json']!==$json)throw new RuntimeException('مرجع نسخة الخلية غير مطابق؛ لم يُصلح أو يُحذف تلقائيًا');
    return $row;
}

function grade_cells_stamp(PDO $pdo,int $context,string $key,array $path,bool $lock): array
{
    $ancestors=[];
    for($i=0;$i<count($path);$i++)$ancestors[]=grade_cells_version($pdo,$context,$key,array_slice($path,0,$i),$lock)['direct_version'];
    return ['ancestors'=>$ancestors,'subtree'=>grade_cells_version($pdo,$context,$key,$path,$lock)['subtree_version']];
}

/** Shared preflight for a composed write and its final grade-only commit. */
function grade_cells_assert_current(PDO $pdo,int $context,string $key,stdClass $store,array $path,array $base,mixed $stamp): void
{
    if(!$pdo->inTransaction())throw new RuntimeException('التحقق من مصدر الدرجة يتطلب معاملة الحفظ نفسها',409);
    if(!is_bool($base['present']??null)||($base['present']&&!array_key_exists('value',$base)))throw new RuntimeException('مصدر الدرجة غير مكتمل');
    if(grade_cells_json(grade_cells_at($store,$path))!==grade_cells_json($base)||grade_cells_json(grade_cells_stamp($pdo,$context,$key,$path,true))!==grade_cells_json($stamp))throw new RuntimeException('عدّل مستخدم آخر الخلية أو بنيتها؛ بقيت مسودتك للمقارنة دون استبدال كتابته',409);
}

/** Read metadata only; never initializes a row, attributes a semester, or rewrites stored grades. */
function grade_cells_capture(PDO $pdo,int $cid,string $key,array $paths): array
{
    $owns=!$pdo->inTransaction();
    try {
        if($owns)$pdo->beginTransaction();
        grade_cells_ready($pdo);$context=grade_cells_context($pdo,$cid);$store=grade_cells_store($pdo,$cid,$key,false);$cells=[];
        foreach($paths as $path) {
            $path=grade_cells_path($path);$cells[]=['path'=>$path,'base'=>grade_cells_at($store,$path),'stamp'=>grade_cells_stamp($pdo,$context,$key,$path,false)];
        }
        $result=['calendar_context'=>grade_cells_calendar($pdo,$cid,false),'cells'=>$cells];
        if($owns)$pdo->commit();
        return $result;
    } catch(Throwable $error) {
        if($owns&&$pdo->inTransaction())$pdo->rollBack();
        throw $error;
    }
}

function grade_cells_record_version(PDO $pdo,int $context,string $key,array $path,string $operation): void
{
    for($i=0;$i<=count($path);$i++) {
        $prefix=array_slice($path,0,$i);$row=grade_cells_version($pdo,$context,$key,$prefix,true);
        $direct=$i===count($path)?$operation:$row['direct_version'];$json=grade_cells_json($prefix);
        $query=$pdo->prepare('INSERT INTO grade_cell_versions(context_id,store_key,path_sha256,path_json,direct_version,subtree_version) VALUES(?,?,?,?,?,?) ON DUPLICATE KEY UPDATE direct_version=?,subtree_version=?,updated_at=CURRENT_TIMESTAMP');
        $query->execute([$context,$key,hash('sha256',$json),$json,$direct,$operation,$direct,$operation]);
    }
}

/** A tombstone is the retained version of an explicit removal, even if the value is absent. */
function grade_cells_apply(PDO $pdo,int $cid,string $key,string $operation,array $calendar,array $changes,int $attempt=0): array
{
    $owns=!$pdo->inTransaction();
    try {
        if(!preg_match('/^[A-Za-z0-9_-]{8,128}$/D',$operation)||!$changes)throw new RuntimeException('هوية طلب الدرجة أو خلاياه غير مكتملة');
        if($owns)$pdo->beginTransaction();
        grade_cells_ready($pdo);$context=grade_cells_context($pdo,$cid);
        $store=grade_cells_store($pdo,$cid,$key,true);
        $hash=hash('sha256',grade_cells_json(['protocol'=>1,'key'=>$key,'calendar_context'=>$calendar,'changes'=>$changes]));
        $query=$pdo->prepare('SELECT input_sha256 FROM grade_operation_receipts WHERE context_id=? AND store_key=? AND operation_id=? FOR UPDATE');
        $query->execute([$context,$key,$operation]);$known=$query->fetchColumn();
        if($known!==false) {
            if(!hash_equals((string)$known,$hash))throw new RuntimeException('معرّف طلب الدرجة مستخدم لمحتوى مختلف',409);
            if($owns)$pdo->commit();
            return ['operation_id'=>$operation,'input_sha256'=>$hash,'replayed'=>true];
        }
        if(($calendar['known']??null)!==true||grade_cells_json(grade_cells_calendar($pdo,$cid,true))!==grade_cells_json($calendar))throw new RuntimeException('تغيّر سياق الفصل منذ فتح الصفحة؛ بقي الطلب دون كتابة في فصل آخر',409);
        $paths=[];
        foreach($changes as $change) {
            if(!is_array($change))throw new RuntimeException('تعديل الدرجة غير صالح');
            $path=grade_cells_path($change['path']??null);
            foreach(['base','next'] as $field)if(!is_array($change[$field]??null)||!is_bool($change[$field]['present']??null)||($change[$field]['present']&&!array_key_exists('value',$change[$field])))throw new RuntimeException('قيمة الدرجة غير مكتملة');
            foreach($paths as $other)if(array_slice($path,0,min(count($path),count($other)))===array_slice($other,0,min(count($path),count($other))))throw new RuntimeException('طلب الدرجة يحتوي مسارات متداخلة؛ لم يُطبق جزء منه');
            $paths[]=$path;
            grade_cells_assert_current($pdo,$context,$key,$store,$path,$change['base'],$change['stamp']??null);
        }
        foreach($changes as $i=>$change) {
            grade_cells_set($store,$paths[$i],$change['next']);
            grade_cells_record_version($pdo,$context,$key,$paths[$i],$operation);
        }
        if(!$pdo->inTransaction())throw new RuntimeException('انتهت معاملة الدرجة قبل تثبيتها؛ لم يكتمل الحفظ',409);
        app_state_upsert($pdo,$key,$store,app_state_tenant_enabled($pdo)?$cid:null);
        $pdo->prepare('INSERT INTO grade_operation_receipts(context_id,store_key,operation_id,input_sha256) VALUES(?,?,?,?)')->execute([$context,$key,$operation,$hash]);
        if($owns)$pdo->commit();
        return ['operation_id'=>$operation,'input_sha256'=>$hash,'replayed'=>false];
    } catch(Throwable $error) {
        if($pdo->inTransaction()) {try {$pdo->rollBack();} catch(Throwable) {}}
        $code=$error instanceof PDOException?(int)($error->errorInfo[1]??0):0;
        if(in_array($code,[1020,1205,1213],true)) {
            if($owns&&!$pdo->inTransaction()&&$attempt<2)return grade_cells_apply($pdo,$cid,$key,$operation,$calendar,$changes,$attempt+1);
            throw new RuntimeException('تعارض حفظ الدرجة؛ أُلغيت المعاملة كاملة. أعد المحاولة بنفس الطلب',409,$error);
        }
        throw $error;
    }
}
