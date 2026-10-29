const assert=require('node:assert/strict');
const {load,storage,deferred,flush}=require('./independent-test-support.cjs');
global.window=new EventTarget();global.localStorage=storage();global.sessionStorage=storage();
let token='fixture-A',cid=1,posts=[],transport=()=>Promise.reject(Error('unconfigured fixture'));
const meta=(semester='1',versions={})=>({version:1,semester_id:semester,versions});
let rows=[{key:'grades',value:{S:{1:{days:{sun:{hifz:'',rabt:''}}}}},context_complex_id:1,cell_sync:meta()}];
const service=load('src/lib/grade-cell-sync.ts',{'@/lib/auth-session':{getToken:()=>token},'@/lib/tenant':{getActiveComplexId:()=>cid},'@/lib/secure-data.functions':{secureListAppState:async()=>rows,securePatchGradeCells:async data=>{posts.push(structuredClone(data.value));return transport(data.value);}},'./mock-data':{saveGrades:(value,options)=>{assert.equal(options.sync,false);localStorage.setItem('qshatawi_grades_v2',JSON.stringify(value));}}});
const original=structuredClone(rows[0].value);
(async()=>{
localStorage.setItem('qshatawi_grades_v2',JSON.stringify(original));await service.readGradeCellSnapshot();
let gate=deferred();transport=()=>gate.promise;
const one=structuredClone(original);one.S[1].days.sun.hifz='one';one.S[1].days.sun.touchedAt=50;one.S[1].days.sun.fieldTouchedAt={hifz:50};
service.captureGradeCellEdit(original,one);await flush();assert.equal(posts.length,1);assert.equal(posts[0].changes.length,1);assert.deepEqual(posts[0].changes[0].path,['S','1','days','sun','hifz']);assert.equal(service.gradeCellSaveStatus().state,'saving');
const two=structuredClone(one);two.S[1].days.sun.hifz='two';service.captureGradeCellEdit(one,two);await flush();assert.equal(posts.length,1,'writes serialize while preserving a later field tap');
const firstID=posts[0].operation_id;let firstVersions={};firstVersions['d:'+JSON.stringify(posts[0].changes[0].path)]=firstID;firstVersions['a:'+JSON.stringify(posts[0].changes[0].path)]=firstID;
const secondGate=deferred();transport=()=>secondGate.promise;
gate.resolve({ok:true,value:one,context_complex_id:1,cell_sync:meta('1',firstVersions)});await flush();assert.equal(posts.length,2);assert.equal(posts[1].changes[0].tokens['d:'+JSON.stringify(posts[1].changes[0].path)],firstID,'later tap depends on its actual preceding local intent');
assert.equal(JSON.parse(localStorage.getItem('qshatawi_grades_v2')).S[1].days.sun.hifz,'two','first acknowledgement cannot erase the later tap');
secondGate.resolve({ok:true,value:two,context_complex_id:1,cell_sync:meta('1',{['d:'+JSON.stringify(posts[1].changes[0].path)]:posts[1].operation_id})});
await service.flushGradeCellEdits();assert.equal(service.gradeCellSaveStatus().state,'saved');

// A server failure keeps the exact operation and retry identity; no success is fabricated.
const before=JSON.parse(localStorage.getItem('qshatawi_grades_v2')),next=structuredClone(before);next.S[1].days.sun.rabt='pass';
transport=async()=>{throw Error('fixture response lost');};service.captureGradeCellEdit(before,next);await flush();assert.equal(service.gradeCellSaveStatus().state,'failed');const failedID=posts.at(-1).operation_id;
transport=async op=>({ok:true,value:next,context_complex_id:1,cell_sync:meta('1',{['d:'+JSON.stringify(op.changes[0].path)]:op.operation_id})});await service.flushGradeCellEdits();assert.equal(posts.at(-1).operation_id,failedID);assert.equal(service.gradeCellSaveStatus().state,'saved');

// Explicit deletion is kept as an intent; rejection may be archived, unknown responses may not.
const clear=structuredClone(next);delete clear.S[1].days.sun.hifz;transport=async()=>{throw Object.assign(Error('fixture same-cell conflict'),{status:409});};
service.captureGradeCellEdit(next,clear);await flush();assert.equal(posts.at(-1).changes.find(x=>x.path.at(-1)==='hifz').next.present,false);assert.ok(service.gradeCellSaveStatus().rejected);
rows=[{key:'grades',value:next,context_complex_id:1,cell_sync:meta()}];await service.archiveRejectedGradeDraft();assert.ok([...localStorage.data.keys()].some(key=>key.includes(':rejected:')));assert.equal(JSON.parse(localStorage.getItem('qshatawi_grades_v2')).S[1].days.sun.hifz,next.S[1].days.sun.hifz);

// A response belonging to a former signed-in context never writes the next context's cache.
gate=deferred();transport=()=>gate.promise;const later=structuredClone(next);later.S[1].days.sun.muraja='pass';service.captureGradeCellEdit(next,later);await flush();const count=posts.length;token='fixture-B';cid=2;localStorage.setItem('qshatawi_grades_v2',JSON.stringify({other:'untouched'}));gate.resolve({ok:true,value:later,context_complex_id:1,cell_sync:meta()});await flush();assert.deepEqual(JSON.parse(localStorage.getItem('qshatawi_grades_v2')),{other:'untouched'});assert.equal(posts.length,count);
token='fixture-A';cid=1;rows=[{key:'grades',value:next,context_complex_id:1,cell_sync:meta('2')}];await assert.rejects(service.readGradeCellSnapshot(),/تغيّر الفصل/);
assert.ok([...localStorage.data.keys()].some(key=>key.includes(':op:')),'old-context pending requests remain recoverable');
console.log('PASS: field-only capture, serialized rapid taps, durable same-ID retry, explicit clear/rejection archive, stale session and semester guards');
})().catch(error=>{console.error(error);process.exitCode=1;});
