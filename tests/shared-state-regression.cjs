const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');
function storage(){const m=new Map();return {get length(){return m.size},key:i=>Array.from(m.keys())[i]??null,getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}}
function client(send,provided) {
 const local=provided??storage(),session=storage(),e={};const deps={
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
 const initial={S:{1:{days:{sun:{attendance:'',hifz:'one',rabt:'',muraja:'',wajib:false,compensationFaces:0,touchedAt:10,fieldTouchedAt:{hifz:10}},mon:{attendance:'',hifz:'',rabt:'',muraja:'',wajib:false,compensationFaces:0}}}}};
 c.captureSharedEdit('grades',{},initial);await c.flushSharedEdits();
 assert.deepEqual(calls.at(-1).value.changes.map(x=>x.path.join('/')).sort(),['S/1/days/sun/fieldTouchedAt/hifz','S/1/days/sun/hifz'],'generated blank defaults and day timestamps do not conflict with another cell');
 const history=Array.from({length:650},(_,i)=>({id:String(i)}));c.captureSharedEdit('academic_records',history,[{id:'new'},...history]);await c.flushSharedEdits();assert.equal(calls.at(-1).value.changes.length,1);assert.equal(calls.at(-1).value.changes[0].path[0],'new');
 const d=client(async()=>{throw Error('offline')});d.captureSharedEdit('scientific_grades',{data:{H:{S:{1:{sun:{hifz:'7'}}}}}},{data:{H:{S:{1:{sun:{hifz:''}}}}}});await assert.rejects(d.flushSharedEdits());
 assert.equal(d.reconcileShared('scientific_grades',{data:{H:{S:{1:{sun:{hifz:'7'}}}}}}).data.H.S[1].sun.hifz,'','pending explicit clear survives pull');
 const sameBrowser=storage();let release;const gate=new Promise(r=>release=r);const concurrent=[];
 const send=async({data})=>{concurrent.push(data.value.operation_id);await gate;return {ok:true}};
 const tabA=client(send,sameBrowser),tabB=client(send,sameBrowser);
 tabA.captureSharedEdit('grades',{}, {S:{1:{days:{sun:{hifz:'one'}}}}});
 tabB.captureSharedEdit('grades',{}, {S:{1:{days:{sun:{attendance:'present'}}}}});
 assert.equal(sameBrowser.length,2,'each concurrent tab writes a distinct durable operation key');
 release();await Promise.all([tabA.flushSharedEdits(),tabB.flushSharedEdits()]);assert.equal(new Set(concurrent).size,2,'both operations survive concurrent acknowledgement');assert.equal(sameBrowser.length,0);
 let rejectA=true;const recovered=[];const conflict=client(async({data})=>{if(data.value.changes[0].path.at(-1)==='hifz'&&rejectA)throw Object.assign(Error('cell conflict'),{status:409});recovered.push(data.value);return {ok:true}});
 conflict.captureSharedEdit('grades',{}, {S:{1:{days:{sun:{hifz:'one'}}}}});await assert.rejects(conflict.flushSharedEdits(),/cell conflict/);
 conflict.captureSharedEdit('grades',{}, {T:{1:{days:{sun:{attendance:'present'}}}}});await assert.rejects(conflict.flushSharedEdits(),/cell conflict/);
 conflict.cancelRejectedEdit();await conflict.flushSharedEdits();assert.equal(recovered.length,1,'cancelled rejected operation unblocks independent queued work');assert.equal(conflict.sharedSaveStatus().state,'saved');assert.equal(conflict.local.length,1,'rejected request is retained as a review record');
 console.log('PASS: edit-only patches, durable response-loss retry, semester pinning, history and clear preservation');
})().catch(e=>{console.error(e);process.exitCode=1});
