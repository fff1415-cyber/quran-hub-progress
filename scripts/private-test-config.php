<?php
declare(strict_types=1);

/** Decode only a PHP literal token; never execute the supplied configuration. */
function qhp_config_literal(string $literal): string
{
    $quote=$literal[0];$body=substr($literal,1,-1);$out='';
    for($i=0;$i<strlen($body);$i++){
        if($body[$i]!=="\\"){$out.=$body[$i];continue;}
        $next=$body[++$i]??'';
        if($quote==="'"){$out.=in_array($next,["'","\\"],true)?$next:"\\".$next;continue;}
        $map=['n'=>"\n",'r'=>"\r",'t'=>"\t",'v'=>"\v",'e'=>"\033",'f'=>"\f",'\\'=>'\\','"'=>'"','$'=>'$'];
        if(array_key_exists($next,$map)){$out.=$map[$next];continue;}
        if($next==='x'&&isset($body[$i+1])&&ctype_xdigit($body[$i+1])){
            $digits=$body[++$i];if(isset($body[$i+1])&&ctype_xdigit($body[$i+1]))$digits.=$body[++$i];$out.=chr(hexdec($digits));continue;
        }
        if($next>='0'&&$next<='7'){
            $digits=$next;for($n=0;$n<2&&isset($body[$i+1])&&$body[$i+1]>='0'&&$body[$i+1]<='7';$n++)$digits.=$body[++$i];$out.=chr(octdec($digits)&255);continue;
        }
        $out.="\\".$next;
    }
    return $out;
}

/** Accept literal return arrays, define(DB_*, literal), and literal variable assignments. */
function qhp_load_private_test_config(string $contents): array
{
    if(strlen($contents)>65536)throw new RuntimeException('Private test configuration too large');
    $source=preg_replace('/^\xEF\xBB\xBF/','',trim($contents));
    if(!str_starts_with($source,'<?php'))$source="<?php\n".$source;
    $tokens=array_values(array_filter(token_get_all($source,TOKEN_PARSE),static fn($t)=>!is_array($t)||!in_array($t[0],[T_WHITESPACE,T_COMMENT,T_DOC_COMMENT,T_OPEN_TAG,T_CLOSE_TAG],true)));
    $aliases=['host'=>'host','db_host'=>'host','database'=>'database','dbname'=>'database','db_name'=>'database','user'=>'user','username'=>'user','db_user'=>'user','password'=>'password','pass'=>'password','db_pass'=>'password','db_password'=>'password'];
    $values=[];
    $capture=static function(string $name,string $value)use(&$values,$aliases):void{
        $key=$aliases[strtolower(ltrim($name,'$'))]??null;if($key===null)return;
        if(isset($values[$key])&&$values[$key]!==$value)throw new RuntimeException('Ambiguous private configuration');
        $values[$key]=$value;
    };
    for($i=0;$i<count($tokens);$i++){
        $t=$tokens[$i];
        if(is_array($t)&&$t[0]===T_VARIABLE&&($tokens[$i+1]??null)==='='&&is_array($tokens[$i+2]??null)&&$tokens[$i+2][0]===T_CONSTANT_ENCAPSED_STRING)$capture($t[1],qhp_config_literal($tokens[$i+2][1]));
        if(is_array($t)&&$t[0]===T_CONSTANT_ENCAPSED_STRING&&is_array($tokens[$i+1]??null)&&$tokens[$i+1][0]===T_DOUBLE_ARROW&&is_array($tokens[$i+2]??null)&&$tokens[$i+2][0]===T_CONSTANT_ENCAPSED_STRING)$capture(qhp_config_literal($t[1]),qhp_config_literal($tokens[$i+2][1]));
        if(is_array($t)&&$t[0]===T_STRING&&strtolower($t[1])==='define'&&($tokens[$i+1]??null)==='('&&is_array($tokens[$i+2]??null)&&$tokens[$i+2][0]===T_CONSTANT_ENCAPSED_STRING&&($tokens[$i+3]??null)===','&&is_array($tokens[$i+4]??null)&&$tokens[$i+4][0]===T_CONSTANT_ENCAPSED_STRING)$capture(qhp_config_literal($tokens[$i+2][1]),qhp_config_literal($tokens[$i+4][1]));
    }
    foreach(['host','database','user','password']as$key)if(!isset($values[$key])||$values[$key]==='')throw new RuntimeException('Private configuration needs literal connection fields');
    if($values['database']!=='u112851217_msht_test')throw new RuntimeException('Private configuration names an unexpected database');
    return $values;
}
