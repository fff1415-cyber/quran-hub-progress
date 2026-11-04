"""Bounded SSH metadata probe. No routes, DDL, record writes, backups, or deployment."""
import base64
import ipaddress
import json
import os
import pathlib
import re
import shlex
import subprocess
import tempfile


def main():
    user = os.environ['DEPLOY_USER'].strip().split('@')[0]
    host = os.environ['DEPLOY_HOST'].strip()
    ipaddress.IPv4Address(host)
    if not re.fullmatch(r'[A-Za-z0-9_-]+', user):
        raise ValueError('Invalid deployment user')
    api_root = '/' + os.environ['DEPLOY_API_PATH'].strip().strip('/')
    if not api_root.startswith('/home/'):
        api_root = '/home/' + user + api_root
    if not api_root.startswith('/home/' + user + '/') or '..' in pathlib.PurePosixPath(api_root).parts:
        raise ValueError('Unsafe API root')
    # This does not authorize writing even to the configured main root.
    if '/m1.msht.io/' in api_root or '/m2.msht.io/' in api_root:
        raise ValueError('Main-site scope forbids subdomain roots')
    schema = pathlib.Path('api/schema.php').read_bytes()
    encoded_schema = base64.b64encode(schema).decode()
    php = r'''
    $stage='config';
    try {
      $root=realpath($argv[1]);
      if(!$root || !is_file($root.'/config.php'))throw new RuntimeException('config unavailable');
      require $root.'/config.php';
      eval(substr(base64_decode($argv[3]),5));
      $stage='connection';
      $pdo=new PDO('mysql:host='.DB_HOST.';dbname='.DB_NAME.';charset='.DB_CHARSET,DB_USER,DB_PASS,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
      $stage='readonly';$pdo->exec('SET TRANSACTION READ ONLY');$pdo->beginTransaction();
      $stage='metadata';$schema=schema_inspect($pdo);
      $stage='select_contracts';$selects=[];
      foreach(schema_required_columns() as $table=>$columns){
        if(array_filter($schema['missing_columns'],fn($item)=>str_starts_with($item,$table.'.'))) {$selects[$table]='schema_missing';continue;}
        $pdo->query('SELECT `'.implode('`,`',$columns).'` FROM `'.$table.'` LIMIT 0');$selects[$table]='ok';
      }
      $stage='settings_integrity';
      $settingsKeys=$pdo->query("SELECT INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='evaluation_settings' ORDER BY INDEX_NAME,SEQ_IN_INDEX")->fetchAll(PDO::FETCH_ASSOC);
      $duplicateSettingsGroups=(int)$pdo->query('SELECT COUNT(*) FROM (SELECT complex_id FROM evaluation_settings GROUP BY complex_id HAVING COUNT(*) > 1) AS duplicate_settings')->fetchColumn();
      $pdo->rollBack();
      $stage='isolation';$isolation=[];
      foreach(['m1','m2'] as $sub){
        $other=$argv[2].'/domains/'.$sub.'.msht.io/public_html/api';
        $real=realpath($other);
        $isolation[$sub]=['api_present'=>$real!==false,'shares_api_root'=>$real!==false&&$real===$root,'shares_config_file'=>is_file($other.'/config.php')&&realpath($other.'/config.php')===realpath($root.'/config.php'),'same_config_contents'=>is_file($other.'/config.php')&&hash_file('sha256',$other.'/config.php')===hash_file('sha256',$root.'/config.php')];
        // Report only same/different database identity; never expose configuration values.
        if(is_file($other.'/config.php')){
          $child='require $argv[1];echo hash("sha256",DB_HOST."|".DB_NAME);';
          $output=[];$status=1;exec(escapeshellarg(PHP_BINARY).' -r '.escapeshellarg($child).' -- '.escapeshellarg($other.'/config.php'),$output,$status);
          $isolation[$sub]['shares_database']=$status===0&&count($output)===1?hash('sha256',DB_HOST.'|'.DB_NAME)===$output[0]:null;
        }
      }
      $stage='storage_inventory';
      $private=$argv[2].'/.qhp-release-backups';
      $codeBackup=is_dir($private);
      echo json_encode(['schema'=>$schema,'read_contracts'=>$selects,'settings_unique_key_metadata'=>$settingsKeys,'settings_duplicate_complex_groups'=>$duplicateSettingsGroups,'isolation'=>$isolation,'private_code_backup_directory_present'=>$codeBackup,'database_backup_restore_verified'=>false,'production_writes'=>false],JSON_UNESCAPED_UNICODE)."\n";
    }catch(Throwable $e){if(isset($pdo)&&$pdo->inTransaction())$pdo->rollBack();echo json_encode(['probe_failed_stage'=>$stage,'error_class'=>get_class($e),'errno'=>$e instanceof PDOException?(int)($e->errorInfo[1]??0):null])."\n";exit(1);}
    '''
    with tempfile.TemporaryDirectory() as folder:
        ask = pathlib.Path(folder, 'askpass')
        ask.write_text('#!/bin/sh\nprintf "%s\\n" "$DEPLOY_SSH_PASSWORD"\n')
        ask.chmod(0o700)
        env = dict(os.environ, SSH_ASKPASS=str(ask), SSH_ASKPASS_REQUIRE='force', DISPLAY=':0')
        command = 'php -r ' + shlex.quote(php) + ' -- ' + ' '.join(map(shlex.quote, [api_root, '/home/' + user, encoded_schema]))
        result = subprocess.run(['ssh', '-T', '-p', '65002', '-o', 'ConnectTimeout=20', '-o', 'ServerAliveInterval=10', '-o', 'StrictHostKeyChecking=accept-new', user + '@' + host, command], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=90, start_new_session=True)
        try:
            data = json.loads(result.stdout)
        except Exception:
            raise SystemExit('Read-only probe transport failed; private details withheld')
        print(json.dumps(data, ensure_ascii=False, indent=2))
        if result.returncode:
            raise SystemExit('Read-only probe incomplete; no production changes made')
        pathlib.Path('stage1-readonly-result.json').write_text(json.dumps(data, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
