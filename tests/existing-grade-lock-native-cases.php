<?php
declare(strict_types=1);
// All connections use the existing isolated audit_test DSN checked by connectFixture().
$before=$pdo->query("SELECT value FROM app_state WHERE complex_id=1 AND `key`='grades'")->fetchColumn();
$children=[];$pipes=[];
for($i=0;$i<2;$i++) {
    $pair=stream_socket_pair(STREAM_PF_UNIX,STREAM_SOCK_STREAM,0);
    if($pair===false)throw new RuntimeException('isolated barrier unavailable');
    $pid=pcntl_fork();if($pid===-1)throw new RuntimeException('fork unavailable');
    if($pid===0) {
        fclose($pair[0]);stream_set_timeout($pair[1],15);
        try {
            $child=connectFixture();$child->exec('SET SESSION innodb_lock_wait_timeout=5');$child->beginTransaction();
            $child->prepare('INSERT IGNORE INTO app_state(complex_id,`key`,value) VALUES(?,?,?)')->execute([1,'grades','{}']);
            fwrite($pair[1],'R');
            if(fread($pair[1],1)!=='G')throw new RuntimeException('isolated start barrier failed');
            try {
                $query=$child->prepare('SELECT value FROM app_state WHERE complex_id=? AND `key`=? FOR UPDATE');$query->execute([1,'grades']);$query->fetchColumn();
                if($child->inTransaction())$child->rollBack();exit(0);
            } catch(PDOException $error) {
                $code=(int)($error->errorInfo[1]??0);if($child->inTransaction())$child->rollBack();
                if(!in_array($code,[1020,1205,1213],true))throw $error;
                echo 'PASS: forced old duplicate-insert/lock-upgrade pattern exposes engine conflict '.$code."\n";exit(2);
            }
        } catch(Throwable $error) {fwrite(STDERR,'Isolated legacy-lock control: '.$error->getMessage()."\n");exit(1);}
    }
    fclose($pair[1]);stream_set_timeout($pair[0],15);$pipes[]=$pair[0];$children[]=$pid;
}
foreach($pipes as $pipe)check(fread($pipe,1)==='R','old-pattern connections both hold their duplicate-insert lock before upgrade');
foreach($pipes as $pipe)fwrite($pipe,'G');
$results=[];foreach($children as $pid){pcntl_waitpid($pid,$status);check(pcntl_wifexited($status),'old-pattern worker exits cleanly');$results[]=pcntl_wexitstatus($status);}foreach($pipes as $pipe)fclose($pipe);
sort($results);$GLOBALS['pdo']=$pdo=connectFixture();
check($results===[0,2]&&$pdo->query("SELECT value FROM app_state WHERE complex_id=1 AND `key`='grades'")->fetchColumn()===$before,'negative control reproduces the avoidable existing-store conflict without altering any stored grade');
echo "PASS: the unchanged real concurrent valid-save/reset test now also runs against lock-first initialization in this job\n";
