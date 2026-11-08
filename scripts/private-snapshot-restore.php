<?php
declare(strict_types=1);

final class QhpDumpFormatException extends RuntimeException {
    public function __construct(public readonly array $shape,string $fixtureLine=''){parent::__construct('unsupported_dump_statement_'.$shape['kind'].$fixtureLine);}
}

function qhp_restore_identity(PDO $pdo,string $target):void {
    if($pdo->query('SELECT DATABASE()')->fetchColumn()!==$target)throw new RuntimeException('wrong_test_database');
    $scoped=false;
    foreach($pdo->query('SHOW GRANTS')->fetchAll(PDO::FETCH_COLUMN)as$grant){
        if(!preg_match('/^GRANT (.*?) ON (.*?) TO /i',$grant,$m))throw new RuntimeException('unrecognized_or_role_grant');
        if(strtoupper($m[1])==='USAGE'&&$m[2]==='*.*')continue;
        $scope=str_replace('\\_','_',$m[2]);
        if($scope!=='`'.$target.'`.*'&&$scope!==$target.'.*')throw new RuntimeException('test_user_has_other_scope');
        $scoped=true;
    }
    if(!$scoped)throw new RuntimeException('test_database_grant_missing');
}
function qhp_restore_tables(PDO $pdo):array {
    $tables=$pdo->query("SELECT TABLE_NAME, TABLE_TYPE, ENGINE FROM information_schema.tables WHERE table_schema=DATABASE() ORDER BY TABLE_NAME")->fetchAll(PDO::FETCH_ASSOC);$names=[];
    foreach($tables as$row){if($row['TABLE_TYPE']!=='BASE TABLE'||strcasecmp((string)$row['ENGINE'],'InnoDB')!==0)throw new RuntimeException('unsupported_test_table_type');$names[]=$row['TABLE_NAME'];}
    foreach(['TRIGGERS'=>'TRIGGER_SCHEMA','ROUTINES'=>'ROUTINE_SCHEMA','EVENTS'=>'EVENT_SCHEMA']as$table=>$column)if((int)$pdo->query("SELECT COUNT(*) FROM information_schema.$table WHERE $column=DATABASE()")->fetchColumn()!==0)throw new RuntimeException('test_schema_contains_programmable_objects');
    sort($names);return $names;
}
/** Only the plain table dump grammar emitted by the existing backup command is accepted. */
function qhp_restore_rows(string $sql):array {
    if(!preg_match('/^INSERT INTO `[A-Za-z0-9_]+` VALUES\s+/D',$sql,$prefix))throw new RuntimeException('bad_dump_insert_prefix');
    $values=substr($sql,strlen($prefix[0]));$i=0;$n=strlen($values);$rows=[];
    while($i<$n){
        $i+=strspn($values," \t\r\n",$i);$start=$i;if(($values[$i++]??'')!=='(')throw new RuntimeException('bad_dump_tuple');
        while(true){
            $i+=strspn($values," \t",$i);if($i>=$n)throw new RuntimeException('bad_dump_literal');
            if(substr($values,$i,8)==="_binary'")$i+=7;
            elseif(substr($values,$i,2)==="b'")$i++;
            if($values[$i]==="'"){
                ++$i;while(true){$i+=strcspn($values,"'\\",$i);if($i>=$n)throw new RuntimeException('unterminated_dump_literal');if($values[$i++]==='\\'){++$i;continue;}if(($values[$i]??'')==="'"){++$i;continue;}break;}
            }else{
                $length=strcspn($values,',)',$i);$literal=trim(substr($values,$i,$length));$i+=$length;
                if(!preg_match('/^(?:NULL|0x[0-9a-f]*|[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?)$/iD',$literal))throw new RuntimeException('unsupported_dump_literal');
            }
            $i+=strspn($values," \t",$i);$separator=$values[$i++]??'';if($separator===')')break;if($separator!==',')throw new RuntimeException('bad_dump_tuple_separator');
        }
        $rows[]=hash('sha256',substr($values,$start,$i-$start));$separator=$values[$i++]??'';
        if($separator===';'&&$i===$n)return $rows;if($separator!==',')throw new RuntimeException('bad_dump_row_separator');
    }
    throw new RuntimeException('dump_insert_missing_terminator');
}
function qhp_restore_archive(string $file,?PDO $write=null):array {
    $h=gzopen($file,'rb');if(!$h)throw new RuntimeException('archive_unreadable');$result=[];$dropped=[];$create='';$complete=false;$lineNumber=0;
    try{while(($line=gzgets($h))!==false){
        ++$lineNumber;$line=rtrim($line," \t\r\n");
        if($create!==''){$create.="\n".$line;if(!str_ends_with($line,';'))continue;$line=$create;$create='';}else{$line=ltrim($line," \t");}
        if($line===''||str_starts_with($line,'--')){if(str_starts_with($line,'-- Dump completed'))$complete=true;continue;}
        if(preg_match('/^;+$/D',$line)||preg_match('/^\/\*(?!M?!)[^\r\n]*\*\/\s*;?$/D',$line))continue;
        if(preg_match('/^\/\*M?!999999.*enable the sandbox mode.*\*\/$/D',$line))continue;
        if(preg_match('/^\/\*M?![0-9]{5,6}\s+SET\s+[^\r\n]+\*\/\s*;?$/iD',$line)){
            if(preg_match('/\b(?:GLOBAL|GTID|SQL_LOG_BIN)\b/i',$line))throw new RuntimeException('unsupported_global_dump_directive');continue;
        }
        // The exporter can also emit bare session/setup directives. Do not replay them.
        if(preg_match('/^SET\s+[^\r\n]+;$/iD',$line))continue;
        if(preg_match('/^(?:COMMIT|START TRANSACTION(?: WITH CONSISTENT SNAPSHOT)?);$/iD',$line))continue;
        // The --events/--routines exporter emits these delimiters even for empty sections.
        // Actual triggers, routines, events and any associated executable statements remain refused.
        if(preg_match('/^DELIMITER\s+;{1,2}$/D',$line))continue;
        if(preg_match('/^(?:LOCK TABLES `[A-Za-z0-9_]+` WRITE|UNLOCK TABLES|\/\*!40000 ALTER TABLE `[A-Za-z0-9_]+` (?:DISABLE|ENABLE) KEYS \*\/);$/D',$line))continue;
        if(preg_match('/^DROP TABLE IF EXISTS `([A-Za-z0-9_]+)`;$/D',$line,$m)){
            if(isset($dropped[$m[1]]))throw new RuntimeException('duplicate_dump_drop');$dropped[$m[1]]=true;if($write)$write->exec($line);continue;
        }
        if(preg_match('/^CREATE TABLE `([A-Za-z0-9_]+)` \(/',$line,$m)){
            if(!str_ends_with($line,';')){$create=$line;continue;}
            if(!isset($dropped[$m[1]])||isset($result[$m[1]])||!preg_match('/\) ENGINE=InnoDB\b/i',$line))throw new RuntimeException('unexpected_dump_create');
            $structure=preg_replace("/'(?:\\\\.|[^'\\\\])*'/s","''",$line);
            if($structure===null||preg_match('/\/\*|--|;.+|`\s*\.\s*`|\b(?:SELECT|TABLESPACE|CONNECTION|DEFINER)\b|\b(?:DATA|INDEX)\s+DIRECTORY\b/is',substr($structure,0,-1)))throw new RuntimeException('unsafe_dump_create');
            $result[$m[1]]=['schema_sha256'=>hash('sha256',$line),'rows'=>[]];if($write)$write->exec($line);continue;
        }
        if(preg_match('/^INSERT INTO `([A-Za-z0-9_]+)` VALUES(?:\s|$)/',$line,$m)&&isset($result[$m[1]])){
            if(!str_ends_with($line,';')){$create=$line;continue;}
            $rows=qhp_restore_rows($line);foreach($rows as$row)$result[$m[1]]['rows'][]=$row;if($write)$write->exec($line);continue;
        }
        $kind='other';foreach(['versioned'=>'/^\/\*/','use'=>'/^\s*USE\b/i','insert'=>'/^\s*INSERT\b/i','create'=>'/^\s*CREATE\b/i','drop'=>'/^\s*DROP\b/i','set'=>'/^\s*SET\b/i','delimiter'=>'/^\s*DELIMITER\b/i','lock'=>'/^\s*(?:UN)?LOCK\b/i']as$type=>$pattern)if(preg_match($pattern,$line)){$kind=$type;break;}
        preg_match_all('/\b(?:SELECT|UPDATE|DELETE|CREATE|DROP|INSERT|REPLACE|ALTER|SET|USE|FLUSH|COMMIT|ROLLBACK|START|TRANSACTION|TRIGGER|FUNCTION|PROCEDURE|VIEW|EVENT|DEFINER|DELIMITER|RENAME|REVOKE|GRANT|CHARSET|TABLE|RESET|LOCK|UNLOCK|IF|END|BEGIN|ROLLUP)\b/i',$line,$words);
        throw new QhpDumpFormatException(['kind'=>$kind,'line'=>$lineNumber,'first_byte'=>ord($line[0]),'length'=>strlen($line),'sql_keywords'=>array_values(array_unique(array_map('strtoupper',array_slice($words[0],0,20)))),'tables_parsed'=>count($result)],getenv('QHP_RESTORE_FIXTURE')==='1'?': '.substr($line,0,160):'');
    }}finally{gzclose($h);}
    if(!$complete||$create!==''||!$result||array_keys($dropped)!==array_keys($result))throw new RuntimeException('incomplete_plain_dump');
    foreach($result as&$table){sort($table['rows']);$table['row_count']=count($table['rows']);$table['data_sha256']=hash('sha256',implode('',$table['rows']));unset($table['rows']);}unset($table);ksort($result);return $result;
}
function qhp_restore_dump(array $settings,string $target,string $directory,string $name,int $port=3306,bool $sourceHeaders=false):string {
    $binary=null;foreach(['/usr/bin/mariadb-dump','/usr/bin/mysqldump','/bin/mariadb-dump','/bin/mysqldump']as$path)if(is_executable($path)){$binary=$path;break;}if(!$binary)throw new RuntimeException('dump_tool_missing');
    $quote=static fn(string $v):string=>'"'.strtr($v,["\\"=>"\\\\",'"'=>'\\"',"\n"=>'\\n',"\r"=>'\\r']).'"';
    $credentials=$directory.'/.test-client-'.bin2hex(random_bytes(8)).'.cnf';$config="[client]\nhost=".$quote($settings['host'])."\nport=$port\nuser=".$quote($settings['user'])."\npassword=".$quote($settings['password'])."\ndefault-character-set=utf8mb4\n";
    $h=fopen($credentials,'x');if(!$h)throw new RuntimeException('private_client_config_failed');
    $archive=$directory.'/'.$name.'.sql.gz';
    try{
        if(fwrite($h,$config)!==strlen($config))throw new RuntimeException('private_client_config_incomplete');fclose($h);unset($h,$config);
        $headers=$sourceHeaders?['--routines','--events','--triggers']:['--skip-triggers'];
        $process=proc_open([$binary,'--defaults-file='.$credentials,'--single-transaction','--quick','--skip-lock-tables','--no-tablespaces','--hex-blob',...$headers,$target],[0=>['file','/dev/null','r'],1=>['pipe','w'],2=>['file',$directory.'/'.$name.'.stderr','w']],$pipes);
        if(!is_resource($process))throw new RuntimeException('test_dump_process_failed');$gzip=gzopen($archive,'wb6');if(!$gzip)throw new RuntimeException('private_test_archive_unavailable');
        try{while(!feof($pipes[1])){$chunk=fread($pipes[1],1048576);if($chunk===false||($chunk!==''&&gzwrite($gzip,$chunk)!==strlen($chunk)))throw new RuntimeException('test_dump_incomplete');}}
        finally{fclose($pipes[1]);gzclose($gzip);$exit=proc_close($process);}
        if($exit!==0)throw new RuntimeException('test_dump_failed');return $archive;
    }finally{if(isset($h)&&is_resource($h))fclose($h);if(is_file($credentials))unlink($credentials);}
}
function qhp_restore_compare(PDO $pdo,array $settings,string $target,string $directory,string $name,array $expected,int $port):void {
    if(qhp_restore_tables($pdo)!==array_keys($expected))throw new RuntimeException('restored_table_set_differs');
    foreach($expected as$table=>$meta)if((int)$pdo->query('SELECT COUNT(*) FROM `'.$table.'`')->fetchColumn()!==$meta['row_count'])throw new RuntimeException('restored_row_count_differs');
    if(qhp_restore_archive(qhp_restore_dump($settings,$target,$directory,$name,$port))!==$expected)throw new RuntimeException('restored_schema_or_values_differ');
}
function qhp_restore_apply(PDO $pdo,array $settings,string $target,string $archive,array $manifest,string $directory,int $port=3306):array {
    qhp_restore_identity($pdo,$target);
    if(($manifest['status']??null)!=='backup_created'||($manifest['consistent_snapshot']??false)!==true||!hash_equals((string)($manifest['sha256']??''),(string)hash_file('sha256',$archive)))throw new RuntimeException('source_archive_integrity_failed');
    $expected=qhp_restore_archive($archive);if(count($expected)!==(int)($manifest['table_count']??0))throw new RuntimeException('source_manifest_table_count_differs');
    if(qhp_restore_tables($pdo)!==array_keys($expected))throw new RuntimeException('test_schema_table_set_differs_before_restore');
    $old=qhp_restore_dump($settings,$target,$directory,'test-before-restore',$port);$previous=qhp_restore_archive($old);
    if(array_keys($previous)!==array_keys($expected))throw new RuntimeException('test_safety_backup_incomplete');
    $oldSha=hash_file('sha256',$old);if(!file_put_contents($directory.'/test-before-restore.sha256',$oldSha."\n",LOCK_EX))throw new RuntimeException('test_backup_manifest_write_failed');
    $pdo->exec("SET SESSION sql_mode='NO_AUTO_VALUE_ON_ZERO', SESSION time_zone='+00:00', SESSION foreign_key_checks=0");
    try{
        qhp_restore_identity($pdo,$target);if(!hash_equals($manifest['sha256'],(string)hash_file('sha256',$archive)))throw new RuntimeException('source_archive_changed');qhp_restore_archive($archive,$pdo);qhp_restore_compare($pdo,$settings,$target,$directory,'restored-roundtrip',$expected,$port);
    }catch(Throwable $failure){
        try{qhp_restore_identity($pdo,$target);if(!hash_equals($oldSha,(string)hash_file('sha256',$old)))throw new RuntimeException('test_backup_changed');qhp_restore_archive($old,$pdo);qhp_restore_compare($pdo,$settings,$target,$directory,'rollback-roundtrip',$previous,$port);}
        catch(Throwable){throw new RuntimeException('test_restore_failed_private_rollback_needs_review');}
        throw new RuntimeException('test_restore_failed_previous_test_state_verified');
    }finally{$pdo->exec('SET SESSION foreign_key_checks=1');}
    return ['status'=>'independent_restore_verified','source_backup_id'=>$manifest['backup_id'],'source_sha256'=>$manifest['sha256'],'table_count'=>count($expected),'rows_total'=>array_sum(array_column($expected,'row_count')),'schema_and_values_roundtrip_match'=>true,'previous_test_state_preserved'=>true,'production_database_connected'=>false,'production_writes'=>false];
}
