const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');
function storage(){const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}}
function client(send) {
 const local=storage(),session=storage(),e={};const deps={
  '@/lib/auth-session':{getToken:()=> 'isolated-token'},'@/lib/tenant':{getActiveComplexId:()=>1},
  '@/lib/secure-data.functions':{secureSetAppState:send,secureListAppState:async()=>[],securePatchWeeklyTest:send}
 };
 const js=ts.transpileModule(fs.readFileSync('src/lib/shared-state.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','exports','localStorage','sessionStorage','window',js)(n=>deps[n],e,local,session,new EventTarget());
 e.setDataSemester('A');return {...e,local};
}
(async()=>{
 const calls=[];let fail=true;const c=client(async({data})=>{calls.push(structuredClone(data));if(fail)throw Error('response lost');return {ok:true}});
 const before={S:{1:{days:{sun:{hifz:'one',attendance:'present'}}}}};
 const after=structuredClone(before);after.S[1].days.sun.hifz='';
 c.captureSharedEdit('grades',before,after);await assert.rejects(c.flushSharedEdits(),/response lost/);
 assert.equal(c.sharedSaveStatus().state,'failed');assert.equal(calls[0].value.semester_id,'A');
 assert.equal(calls[0].value.changes.length,1);assert.deepEqual(calls[0].value.changes[0].path,['S','1','days','sun','hifz']);
 fail=false;await c.flushSharedEdits();assert.equal(c.sharedSaveStatus().state,'saved');assert.equal(calls.at(-1).value.operation_id,calls[0].value.operation_id,'lost response retry reuses durable ID');
 assert.throws(()=>c.setDataSemester('B'),/تغيّر الفصل/);assert.equal(c.getDataSemester(),'A','old tab remains pinned');
 const distinct=c.stateChanges({}, {S:{1:{days:{sun:{hifz:'one'},mon:{rabt:'pass'}}}}});assert.equal(distinct.length,2,'new student branches still patch independent cells');
 const history=Array.from({length:650},(_,i)=>({id:String(i)}));c.captureSharedEdit('academic_records',history,[{id:'new'},...history]);await c.flushSharedEdits();assert.equal(calls.at(-1).value.changes.length,1);assert.equal(calls.at(-1).value.changes[0].path[0],'new');
 const d=client(async()=>{throw Error('offline')});d.captureSharedEdit('scientific_grades',{data:{H:{S:{1:{sun:{hifz:'7'}}}}}},{data:{H:{S:{1:{sun:{hifz:''}}}}}});await assert.rejects(d.flushSharedEdits());
 assert.equal(d.reconcileShared('scientific_grades',{data:{H:{S:{1:{sun:{hifz:'7'}}}}}}).data.H.S[1].sun.hifz,'','pending explicit clear survives pull');
 console.log('PASS: edit-only patches, durable response-loss retry, semester pinning, history and clear preservation');
})().catch(e=>{console.error(e);process.exitCode=1});
