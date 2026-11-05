<?php
declare(strict_types=1);
require_once __DIR__.'/../lib/shared-transfers.php';
function handle_list_transfers():void {
    $auth=require_auth();$cid=require_complex_id($auth);
    try{transfers_actor($auth);json_response(['protocol'=>1,'context_complex_id'=>$cid]+transfers_projection($auth,transfers_store(db(),$cid,false,$auth)));}
    catch(Throwable $e){error_response($e instanceof PDOException?api_safe_failure_message($e,'transfers_read'):$e->getMessage(),$e instanceof PDOException?api_database_error_status($e):(in_array($e->getCode(),[400,401,403,409,503],true)?$e->getCode():503));}
}
function handle_change_transfer():void {
    $auth=require_auth();$cid=require_complex_id($auth);
    try{json_response(transfers_apply(db(),$cid,$auth,json_input()));}
    catch(Throwable $e){error_response($e instanceof PDOException?api_safe_failure_message($e,'transfers_write'):$e->getMessage(),$e instanceof PDOException?api_database_error_status($e):(in_array($e->getCode(),[400,401,403,409,503],true)?$e->getCode():503));}
}
