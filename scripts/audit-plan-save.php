<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit(1);
$root=$argv[1]??'';
if (!preg_match('~^(/home/[A-Za-z0-9_-]+)/domains/msht\.io/public_html$~D',$root,$scope) || realpath($root)!==$root ||
    trim(file_get_contents($root.'/deploy-sha.txt'))!=='d01b8b10d966ba3177e33bff9fe20f2e035f9198') exit(1);
$home=$scope[1];
$paths=[];
foreach ([$root,$root.'/api',dirname($root),dirname($root).'/logs',$home.'/logs',$home.'/.logs',
    $home.'/public_html',$home.'/domains/msht.io/.logs',$home.'/.php',$home.'/.qhp-private'] as $dir) {
    foreach (['error_log','*error*.log','*error_log*','*stderr*','*php*.log','*lsphp*.log'] as $pattern) {
        foreach (glob("$dir/$pattern")?:[] as $file) {
            $path=realpath($file);
            if ($path && str_starts_with($path,$home.'/') && is_file($path) && is_readable($path) &&
                !str_ends_with($path,'.gz')) $paths[$path]=true;
        }
    }
}
$matches=[];
foreach (array_keys($paths) as $path) {
    $fp=fopen($path,'rb');
    if (!$fp) continue;
    fseek($fp,max(0,filesize($path)-2_000_000));
    while (($line=fgets($fp))!==false) {
        if (!str_contains($line,'218f4a351a477d5f') || !preg_match('/\{.*"event"\s*:\s*"qhp_failure".*\}/',$line,$m)) continue;
        $entry=json_decode($m[0],true);
        if (($entry['reference']??null)!=='218f4a351a477d5f' || ($entry['context']??null)!=='atomic_grade_write') continue;
        $matches[]=array_intersect_key($entry,array_flip(['reference','context','category','sqlstate','errno','file','line']));
    }
    fclose($fp);
}
echo 'ATOMIC_GRADE_REFERENCE '.json_encode(['logs_checked'=>count($paths),'matches'=>$matches],JSON_THROW_ON_ERROR).PHP_EOL;
