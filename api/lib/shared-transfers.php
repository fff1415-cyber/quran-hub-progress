<?php
declare(strict_types=1);

function transfers_enabled():bool{return defined('QHP_TRANSFER_WRITES_V1')&&QHP_TRANSFER_WRITES_V1===true;}
function transfers_actor(array $auth):string {
    $role=(string)($auth['role']??'');
    if(!in_array($role,['teacher','assistant','manager','secretary','supervisor'],true))throw new RuntimeException('غير مصرح بسجل التحويلات',403);
    if(in_array($role,['teacher','assistant'],true)&&(int)($auth['halaqaId']??0)<1)throw new RuntimeException('هوية الحلقة ناقصة؛ أعد تسجيل الدخول',401);
    $id=(string)($auth['accountId']??$auth['taskActorId']??'');
    if($id===''&&in_array($role,['teacher','assistant'],true))$id=json_encode([$auth['halaqaId']??null,$auth['name']??null],JSON_THROW_ON_ERROR);
    if($id==='')throw new RuntimeException('هوية جلسة التحويل ناقصة؛ أعد تسجيل الدخول',401);
    return hash('sha256',json_encode([$role,$id,$auth['halaqaId']??null],JSON_THROW_ON_ERROR));
}
function transfers_can_read(array $auth,array $thread):bool {
    $role=$auth['role']??'';
    if($role==='manager')return true;
    if(in_array($role,['teacher','assistant'],true))return (int)($auth['halaqaId']??0)>0&&(int)$auth['halaqaId']===(int)($thread['halaqa_id']??0);
    return in_array($role,['secretary','supervisor'],true)&&($thread['target_role']??null)===$role;
}
function transfers_ready(PDO $pdo,bool $forWrite=false):void {
    if(!transfers_enabled())throw new RuntimeException('الحفظ المشترك للتحويلات غير مفعّل؛ بقيت المسودات على الجهاز',503);
    if(!table_column_exists($pdo,'students','complex_id'))throw new RuntimeException('مرجع مجمع الطالب غير مهيأ؛ لم تُرفع السجلات القديمة',503);
    // Metadata checks only. All structural changes belong to the reviewed migration.
    $pdo->query('SELECT complex_id,id,halaqa_id,target_role,version,value FROM transfer_threads WHERE 1=0');
    $pdo->query('SELECT complex_id,operation_id,actor_sha256,input_sha256,value FROM transfer_receipts WHERE 1=0');
    if($forWrite&&$pdo->getAttribute(PDO::ATTR_DRIVER_NAME)==='mysql')foreach(['transfer_threads'=>['complex_id','id'],'transfer_receipts'=>['complex_id','operation_id']]as$table=>$primary){
        $q=$pdo->prepare('SELECT ENGINE FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=?');$q->execute([$table]);
        if(strtolower((string)$q->fetchColumn())!=='innodb')throw new RuntimeException('الحفظ الذري للتحويلات يحتاج InnoDB؛ لم تبدأ أي كتابة',503);
        $q=$pdo->prepare("SELECT COLUMN_NAME FROM information_schema.statistics WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME='PRIMARY' ORDER BY SEQ_IN_INDEX");$q->execute([$table]);
        if($q->fetchAll(PDO::FETCH_COLUMN)!==$primary)throw new RuntimeException('مفتاح عزل التحويلات أو إيصالاتها غير مطابق؛ لم تبدأ أي كتابة',503);
    }
}
function transfers_decode(array $row):array {
    $thread=json_decode((string)$row['value'],true,512,JSON_THROW_ON_ERROR);
    if(!is_array($thread)||($thread['root']['id']??null)!==$row['id']||($thread['version']??null)!==$row['version']||(int)($thread['halaqa_id']??0)!==(int)$row['halaqa_id']||($thread['target_role']??null)!==$row['target_role']||!is_array($thread['events']??null))throw new RuntimeException('سجل التحويلات يحتاج مراجعة؛ لم يُستبدل أو يُكشف لمستخدم آخر',409);
    return $thread;
}
function transfers_store(PDO $pdo,int $cid,bool $lock,?array $auth=null):array {
    transfers_ready($pdo);$params=[$cid];$where='complex_id=?';
    if($auth!==null){
        transfers_actor($auth);$role=$auth['role'];
        if(in_array($role,['teacher','assistant'],true)){$where.=' AND halaqa_id=?';$params[]=(int)$auth['halaqaId'];}
        elseif(in_array($role,['secretary','supervisor'],true)){$where.=' AND target_role=?';$params[]=$role;}
    }
    $q=$pdo->prepare('SELECT id,halaqa_id,target_role,version,value FROM transfer_threads WHERE '.$where.($lock?' FOR UPDATE':''));$q->execute($params);$store=[];
    foreach($q->fetchAll(PDO::FETCH_ASSOC)as$row)$store[$row['id']]=transfers_decode($row);
    return $store;
}
function transfers_projection(array $auth,array $threads):array {
    $notifications=[];$versions=[];
    foreach($threads as$id=>$thread){
        if(!transfers_can_read($auth,$thread))continue;
        $versions[$id]=$thread['version'];$role=$auth['role'];$root=$thread['root'];$root['sharedTransferId']=$id;
        if(in_array($role,['teacher','assistant','manager'],true))$notifications[]=$root;
        if(isset($thread['recipient'])){$child=$thread['recipient'];$child['sharedTransferId']=$id;$notifications[]=$child;}
        if(in_array($role,['teacher','assistant'],true))foreach($thread['events']as$event){
            if(in_array($event['role'],['teacher','assistant'],true))continue;
            $notifications[]=['id'=>'transfer-event-'.$event['id'],'type'=>'info','message'=>'متابعة تحويل الطالب: '.$event['text'],'createdAt'=>$event['at'],'read'=>false,'targetHalaqaId'=>$thread['halaqa_id'],'sharedTransferId'=>$id];
        }
    }
    return ['notifications'=>$notifications,'versions'=>(object)$versions];
}
/** State, audit history and receipt commit under a thread row lock; old app-state APIs cannot expose these tables. */
function transfers_apply(PDO $pdo,int $cid,array $auth,array $packet,int $attempt=0):array {
    $actor=transfers_actor($auth);$operation=(string)($packet['operation_id']??'');$id=(string)($packet['thread_id']??'');$type=(string)($packet['type']??'');
    if(!preg_match('/^[A-Za-z0-9_-]{8,100}$/D',$operation)||!preg_match('/^[A-Za-z0-9_-]{8,80}$/D',$id)||!in_array($type,['create','forward','action'],true))throw new RuntimeException('طلب التحويل غير صالح',400);
    if($pdo->inTransaction())throw new RuntimeException('معاملة تحويل غير مستقلة',409);
    transfers_ready($pdo,true);$hash=hash('sha256',json_encode($packet,JSON_THROW_ON_ERROR));
    try {
        $pdo->beginTransaction();
        $q=$pdo->prepare('SELECT actor_sha256,input_sha256,value FROM transfer_receipts WHERE complex_id=? AND operation_id=? FOR UPDATE');$q->execute([$cid,$operation]);$savedReceipt=$q->fetch(PDO::FETCH_ASSOC);
        if($savedReceipt!==false){
            if($savedReceipt['actor_sha256']!==$actor||$savedReceipt['input_sha256']!==$hash)throw new RuntimeException('أعيد معرّف الطلب من مستخدم آخر أو بمحتوى مختلف؛ لم يُكرر الإجراء',409);
            $receipt=json_decode((string)$savedReceipt['value'],true,512,JSON_THROW_ON_ERROR);$pdo->commit();return $receipt+['replayed'=>true];
        }
        $q=$pdo->prepare('SELECT id,halaqa_id,target_role,version,value FROM transfer_threads WHERE complex_id=? AND id=? FOR UPDATE');$q->execute([$cid,$id]);$row=$q->fetch(PDO::FETCH_ASSOC);$thread=$row===false?null:transfers_decode($row);
        $role=$auth['role'];$name=(string)($auth['name']??$role);$at=gmdate('Y-m-d\TH:i:s\Z');$eventText='';
        if($type==='create'){
            if(!in_array($role,['teacher','assistant'],true))throw new RuntimeException('إنشاء التحويل للمعلم والمساعد فقط',403);
            if($thread!==null||($packet['expected_version']??null)!==null)throw new RuntimeException('التحويل موجود أو تغير منذ فتحه',409);
            $student=(string)($packet['student_id']??'');$reason=trim((string)($packet['reason']??''));$week=filter_var($packet['week']??null,FILTER_VALIDATE_INT);
            if($reason===''||strlen($reason)>6000||$week===false||$week<1||$week>60)throw new RuntimeException('سبب التحويل أو الأسبوع غير صالح',400);
            $q=$pdo->prepare('SELECT id,name,halaqa_id FROM students WHERE id=? AND complex_id=? FOR UPDATE');$q->execute([$student,$cid]);$row=$q->fetch();
            if(!$row||(int)($auth['halaqaId']??0)<1||(int)$row['halaqa_id']!==(int)$auth['halaqaId'])throw new RuntimeException('الطالب ليس في الحلقة المصرح بها',403);
            $root=['id'=>$id,'type'=>'transfer','message'=>'تحويل من '.$name.': الطالب '.$row['name'].' — '.$reason,'createdAt'=>$at,'read'=>false,'actionTab'=>'transfers','transferStatus'=>'pending','transferData'=>['studentId'=>$student,'halaqaId'=>(int)$row['halaqa_id'],'week'=>$week,'reason'=>$reason,'fromName'=>$name,'actions'=>[]]];
            $thread=['halaqa_id'=>(int)$row['halaqa_id'],'root'=>$root,'target_role'=>null,'events'=>[]];$eventText='إنشاء التحويل';
        }else{
            if(!$thread||!transfers_can_read($auth,$thread))throw new RuntimeException('التحويل غير متاح لهذا المستخدم',403);
            if(!is_string($packet['expected_version']??null)||$packet['expected_version']!==$thread['version'])throw new RuntimeException('تغيّر التحويل من جهاز آخر؛ حدّث القائمة وراجع المسودة',409);
            if($type==='forward'){
                if($role!=='manager')throw new RuntimeException('توجيه التحويل للمدير فقط',403);
                $target=(string)($packet['target_role']??'');if(!in_array($target,['secretary','supervisor'],true))throw new RuntimeException('وجهة التحويل غير صالحة',400);
                if(($thread['root']['transferStatus']??'')!=='pending'||$thread['target_role']!==null)throw new RuntimeException('التحويل موجّه أو منتهٍ؛ لم يُرسل إلى وجهة ثانية',409);
                $thread['target_role']=$target;$thread['root']['transferStatus']='to_'.$target;$thread['root']['read']=true;
                $child=$thread['root'];$child['id']='forward-'.$id.'-'.$target;$child['createdAt']=$at;$child['read']=false;$child['transferStatus']='pending';$child['targetRole']=$target;$child['transferData']['rootTransferId']=$id;$child['transferData']['forwardedBy']=$name;$thread['recipient']=$child;$eventText='إحالة المدير إلى '.($target==='secretary'?'السكرتير':'المشرف العلمي');
            }else{
                $text=trim((string)($packet['text']??''));$status=$packet['status']??null;if($text===''||strlen($text)>6000)throw new RuntimeException('نص الإجراء غير صالح',400);
                if(in_array($role,['teacher','assistant'],true)&&$status!==null)throw new RuntimeException('متابعة المعلم لا تغير وجهة التحويل أو تغلقه',403);
                if(in_array($role,['secretary','supervisor'],true)&&($status!=='closed'||$thread['target_role']!==$role||($thread['recipient']['transferStatus']??'')!=='pending'))throw new RuntimeException('الإجراء يخص الجهة الموجه إليها فقط ولا يعيد فتح تحويل مغلق',403);
                if($role==='manager'&&($status!==null&&($status!=='struggling'||$thread['target_role']!==null||($thread['root']['transferStatus']??'')!=='pending')))throw new RuntimeException('لا يغيّر المدير حالة تحويل موجّه أو مغلق من هذا الإجراء',403);
                if($status!==null){$thread['root']['transferStatus']=$status;$thread['root']['read']=true;if(isset($thread['recipient'])){$thread['recipient']['transferStatus']=$status;$thread['recipient']['read']=true;}}
                $eventText=$text;
            }
        }
        $event=['id'=>$operation,'role'=>$role,'byName'=>$name,'text'=>$eventText,'at'=>$at];$thread['events'][]=$event;$thread['root']['transferData']['actions'][]=$event;
        if(isset($thread['recipient']))$thread['recipient']['transferData']['actions']=$thread['root']['transferData']['actions'];
        $thread['version']=$operation;$value=json_encode($thread,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
        if($type==='create')$pdo->prepare('INSERT INTO transfer_threads(complex_id,id,halaqa_id,target_role,version,value)VALUES(?,?,?,?,?,?)')->execute([$cid,$id,$thread['halaqa_id'],$thread['target_role'],$operation,$value]);
        else $pdo->prepare('UPDATE transfer_threads SET target_role=?,version=?,value=?,updated_at=CURRENT_TIMESTAMP WHERE complex_id=? AND id=?')->execute([$thread['target_role'],$operation,$value,$cid,$id]);
        $receipt=['ok'=>true,'operation_id'=>$operation,'thread_id'=>$id,'version'=>$operation,'input_sha256'=>$hash];
        $pdo->prepare('INSERT INTO transfer_receipts(complex_id,operation_id,actor_sha256,input_sha256,value)VALUES(?,?,?,?,?)')->execute([$cid,$operation,$actor,$hash,json_encode($receipt,JSON_THROW_ON_ERROR)]);
        $pdo->commit();return $receipt+['replayed'=>false];
    }catch(Throwable $error){
        if($pdo->inTransaction())$pdo->rollBack();
        if($error instanceof PDOException&&$attempt<2&&in_array((int)($error->errorInfo[1]??0),[1062,1205,1213],true))return transfers_apply($pdo,$cid,$auth,$packet,$attempt+1);
        throw $error;
    }
}
