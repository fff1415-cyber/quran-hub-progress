<?php
declare(strict_types=1);

// Storage/versioning helpers. Every entry point keeps its existing authorization.
function state_semester_key(string $key): bool {return in_array($key,['grades','weekly_tests','scientific_grades'],true);}
function state_list_key(string $key): bool {return in_array($key,['notifications','academic_records','sard_history'],true);}
function state_protected_key(string $key): bool {return state_semester_key($key)||state_list_key($key)||in_array($key,['grade_input_settings','grade_point_settings'],true);}
function state_active_semester(PDO $pdo,int $cid,bool $lock=false): string {
    $scoped=table_column_exists($pdo,'semesters','complex_id');
    $s=$pdo->prepare('SELECT id FROM semesters WHERE is_active = 1'.($scoped?' AND complex_id = ?':'').' ORDER BY id'.($lock?' FOR UPDATE':''));
    $s->execute($scoped?[$cid]:[]);$ids=$s->fetchAll(PDO::FETCH_COLUMN);
    if(count($ids)!==1) throw new RuntimeException('يلزم فصل دراسي حالي واحد مؤكد قبل حفظ الدرجات');
    return (string)$ids[0];
}
function state_envelope(mixed $raw): array {
    if(is_array($raw)&&($raw['integrity_version']??null)===1)return $raw;
    return ['integrity_version'=>1,'legacy'=>$raw,'scopes'=>[],'operations'=>[],'removed'=>[],'revision'=>0];
}
function state_scope_value(array $e,string $key,string $scope): array {
    $v=$e['scopes'][$scope]??(state_semester_key($key)?[]:($e['legacy']??[]));
    if(!is_array($v))return [];
    if(state_list_key($key)) {
        $map=[];foreach($v as $item)if(is_array($item)&&isset($item['id']))$map[(string)$item['id']]=$item;
        return $map;
    }
    return $v;
}
function state_present_row(PDO $pdo,int $cid,array $row): array {
    $key=(string)$row['key'];$raw=json_decode((string)($row['value']??'null'),true);
    if(!state_protected_key($key)){ $row['value']=$raw;return $row; }
    $e=state_envelope($raw);$scope='_';
    if(state_semester_key($key)){try{$scope=state_active_semester($pdo,$cid);}catch(RuntimeException){$scope='';}}
    $legacy=state_semester_key($key)&&!empty($_GET['legacy']);
    $v=$legacy?($e['legacy']??[]):state_scope_value($e,$key,$scope);
    $row['value']=state_list_key($key)?array_values($v):($v?:new stdClass());
    $row['integrity']=['version'=>1,'semester_id'=>state_semester_key($key)?$scope:null,'revision'=>$e['revision']??0,'legacy_available'=>!empty($e['legacy']),'legacy_view'=>$legacy];
    return $row;
}
function state_canonical(mixed $v): string {
    if(is_array($v)&&!array_is_list($v)){ksort($v);foreach($v as &$x)$x=json_decode(state_canonical($x),true);unset($x);}
    return app_state_json_encode($v);
}
function state_cell(array $value,array $path): array {
    $v=$value;foreach($path as $p){if(!is_array($v)||!array_key_exists($p,$v))return ['present'=>false];$v=$v[$p];}
    return ['present'=>true,'value'=>$v];
}
function state_set_cell(array &$value,array $path,array $next): void {
    $ref=&$value;$last=array_pop($path);foreach($path as $p){if(!isset($ref[$p])||!is_array($ref[$p]))$ref[$p]=[];$ref=&$ref[$p];}
    if($next['present'])$ref[$last]=$next['value']??null;else unset($ref[$last]);
}
function state_lock_envelope(PDO $pdo,int $cid,string $key): array {
    $tenants=app_state_tenant_enabled($pdo);$args=$tenants?[$cid,$key]:[$key];
    $pdo->prepare($tenants?'INSERT IGNORE INTO app_state (complex_id, `key`, value) VALUES (?, ?, ?)':'INSERT IGNORE INTO app_state (`key`, value) VALUES (?, ?)')->execute([...$args,'null']);
    $s=$pdo->prepare('SELECT value FROM app_state WHERE '.($tenants?'complex_id = ? AND ':'').'`key` = ? FOR UPDATE');$s->execute($args);
    return state_envelope(json_decode((string)$s->fetchColumn(),true));
}
function app_state_patch_integrity(PDO $pdo,int $cid,string $key,mixed $input): array {
    if(!is_array($input)||($input['protocol']??null)!==1||!is_array($input['changes']??null))error_response('نسخة الحفظ قديمة — حدّث الصفحة، لم تُغيّر البيانات المحفوظة',409);
    $id=(string)($input['operation_id']??'');if(!preg_match('/^[a-zA-Z0-9:_-]{8,128}$/',$id))error_response('معرّف حفظ صالح مطلوب',400);
    $pdo->beginTransaction();
    try {
        // Freeze semester selection while validating and writing this request.
        $scope=state_semester_key($key)?state_active_semester($pdo,$cid,true):'_';
        if(state_semester_key($key)&&($input['semester_id']??'')!==$scope)throw new RuntimeException('تغيّر الفصل الدراسي — لم تُحفظ درجات التبويب القديم');
        $e=state_lock_envelope($pdo,$cid,$key);$hash=hash('sha256',state_canonical($input));
        if(isset($e['operations'][$id])) {
            if($e['operations'][$id]!==$hash)throw new RuntimeException('معرّف الحفظ مستخدم لتعديل مختلف');
        } else {
            $v=state_scope_value($e,$key,$scope);
            foreach($input['changes'] as $change) {
                $path=$change['path']??[];$base=$change['base']??null;$next=$change['next']??null;
                if(!is_array($path)||!$path||count($path)>12||!is_array($base)||!is_array($next)||!isset($base['present'],$next['present']))throw new RuntimeException('تعديل خلية غير صالح');
                foreach($path as $p)if(!is_string($p)||$p===''||in_array($p,['__proto__','constructor','prototype'],true))throw new RuntimeException('مسار خلية غير صالح');
                $current=state_cell($v,$path);
                if(!$base['present']&&isset($e['removed'][$scope][implode('/',$path)]))throw new RuntimeException('الخلية أزيلت في نسخة أحدث — يلزم مراجعة النسخة المحفوظة');
                if(state_canonical($current)===state_canonical($next))continue;
                if(state_canonical($current)!==state_canonical($base))throw new RuntimeException('تعارض تعديل الخلية '.implode('/',$path).' — أعد تحميل القيمة وأعد المحاولة');
                if(!$next['present'])$e['removed'][$scope][implode('/',$path)]=['previous'=>$current,'revision'=>($e['revision']??0)+1];
                state_set_cell($v,$path,$next);
            }
            $e['scopes'][$scope]=state_list_key($key)?array_values($v):$v;
            $e['revision']=($e['revision']??0)+1;$e['operations'][$id]=$hash;$e['operation_log'][$id]=$input;
            app_state_upsert($pdo,$key,$e,app_state_tenant_enabled($pdo)?$cid:null);
        }
        $pdo->commit();$v=state_scope_value($e,$key,$scope);
        return ['ok'=>true,'value'=>state_list_key($key)?array_values($v):($v?:new stdClass()),'revision'=>$e['revision'],'semester_id'=>state_semester_key($key)?$scope:null];
    }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();error_response($e->getMessage(),409);}
}
