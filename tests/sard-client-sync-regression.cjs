const assert=require('node:assert/strict');const fs=require('fs');const ts=require('typescript');
function storage(){const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}}
function loadMock(push){const exports={};const code=ts.transpileModule(fs.readFileSync('src/lib/mock-data.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','exports',code)(name=>name==='@/lib/shared-state'?{captureSharedEdit:()=>{},sharedSaveStatus:()=>({state:"failed"}),getDataSemester:()=>null,flushSharedEdits:async()=>{},semesterStorageKey:k=>k}:name==='@/lib/auth-session'?{hasAuthToken:()=>true}:name==='./cloud-sync'?{pushAppState:push}:name==='sonner'?{toast:{error:()=>{}}}:(()=>{throw Error(name)})(),exports);return exports;}
global.window={};
(async()=>{
 global.localStorage=storage();global.sessionStorage=storage();let release;const gate=new Promise(resolve=>release=resolve);const calls=[];
 const mock=loadMock(async(key,value)=>{calls.push({key,value});await gate});
 const item=mock.enqueuePlanCompleted('student',1,1,'plan','assignment-1');
 await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.length,1);assert.equal(calls[0].value.changes[0].base,null);
 sessionStorage.setItem('qs_syncing','1');mock.saveSardQueue([]);sessionStorage.removeItem('qs_syncing');assert.equal(mock.loadSardQueue().length,1);console.log('PASS: cloud pull cannot erase pending local queue write');
 mock.updateSardItem(item.id,{status:'pending'});assert.equal(calls.length,1);release();await mock.flushSardQueue();assert.equal(calls.length,2);assert.equal(calls[1].value.changes[0].base.status,'plan_completed');assert.equal(calls[1].value.changes[0].item.status,'pending');console.log('PASS: queue writes serialize with item-specific previous state');
 mock.saveSardQueue([]);await mock.flushSardQueue();assert.equal(calls[2].value.removals[0].id,item.id);console.log('PASS: queue removals are sent to server rather than local-only');
 global.localStorage=storage();global.sessionStorage=storage();let fail=false;const failing=loadMock(async()=>{if(fail)throw Error('409 stale')});const saved=failing.enqueuePlanCompleted('student',1,1,'plan','assignment-2');await failing.flushSardQueue();fail=true;failing.updateSardItem(saved.id,{status:'passed'});await assert.rejects(failing.flushSardQueue(),/409 stale/);await new Promise(resolve=>setImmediate(resolve));assert.equal(failing.loadSardQueue()[0].status,'plan_completed');console.log('PASS: rejected remote update restores confirmed local status');
})().catch(e=>{console.error(e);process.exitCode=1});
