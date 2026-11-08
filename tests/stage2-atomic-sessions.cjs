const assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const {load}=require('./independent-test-support.cjs');const {GradeOutbox}=load('src/lib/grade-outbox.ts',{});
function storage(){const map=new Map();return {get length(){return map.size},key:i=>[...map.keys()][i]??null,getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};}
const php=process.env.PHP_CMD||'php',folder=fs.mkdtempSync(path.join(os.tmpdir(),'qhp-atomic-')),db=path.join(folder,'qhp-atomic-fixture.sqlite');
const env={...process.env,QHP_FIXTURE_DB:db};cp.execFileSync(php,['tests/grade-http-fixture.php'],{env,stdio:'pipe'});
let server,base,sequence=0;const id=()=>`fixture-operation-${++sequence}`;
const request=async(token,packet)=>{const response=await fetch(base+(packet?'':'?key=grades&grade_protocol=1'),{method:packet?'POST':'GET',headers:{Authorization:'Bearer fixture-'+token,'Content-Type':'application/json'},body:packet?JSON.stringify({key:'grades',grade_write_protocol:1,value:packet}):undefined});const value=await response.json();if(!response.ok)throw Object.assign(Error(value.error),{status:response.status});return value;};
const edit=(box,field,value)=>{const before=box.view({}),after=structuredClone(before);after.S[1].days.sun[field]=value;box.edit(before,after);};
const legacy=(token,store)=>fetch(base+(store?'':'?key=grades'),{
 method:store?'POST':'GET',headers:{Authorization:'Bearer fixture-'+token,'Content-Type':'application/json'},
 body:store?JSON.stringify({key:'grades',value:store}):undefined,
});
async function start(legacyMode){
 const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));
 const port=listener.address().port;await new Promise(r=>listener.close(r));base=`http://127.0.0.1:${port}/app-state`;
 server=cp.spawn(php,['-S',`127.0.0.1:${port}`,'tests/grade-http-fixture.php'],{env:{...env,QHP_FIXTURE_LEGACY:legacyMode?'1':'0'},stdio:'ignore'});
 let reason;
 for(let i=0;i<50;i++){try{const response=await legacy('teacher');if(response.ok)return;reason=await response.text();}catch(error){reason=error.message;}await new Promise(r=>setTimeout(r,50));}
 throw Error('Fixture HTTP server did not become ready: '+reason);
}
async function stop(){
 const child=server;server=null;
 if(child&&child.exitCode===null)await new Promise(resolve=>{child.once('exit',resolve);child.kill();});
}
(async()=>{
 await start(true);
 const prior=(await (await legacy('teacher')).json())[0].value;
 prior.S[1].days.sun.attendance='late';
 assert.equal((await legacy('teacher',prior)).status,200);
 assert.deepEqual((await (await legacy('assistant')).json())[0].value,prior);
 await assert.rejects(request('teacher'),{status:503});
 await assert.rejects(request('assistant',{operation_id:'premature-fixture-write'}),{status:503});
 assert.deepEqual((await (await legacy('teacher')).json())[0].value,prior);
 await stop();
 await start(false);
 assert.deepEqual((await request('assistant')).value,prior);
 for(const role of ['manager','teacher','assistant']){
  const response=await fetch(base+'?omit_grade_value=1',{headers:{Authorization:'Bearer fixture-'+role}});
  assert.equal(response.status,200);
  const row=(await response.json()).find(r=>r.key==='grades');assert(row);
  assert.deepEqual(row.value,[],'bulk refresh contains only the grade marker');
  assert.deepEqual((await request(role)).value,prior,'atomic endpoint still returns exact attendance and historical grades');
 }
 assert.equal((await legacy('teacher',{...prior,historic:{}})).status,409);
 assert.deepEqual((await request('teacher')).value,prior);
 console.log('PASS: legacy writes remain available before activation; atomic writes are fenced before activation, inherit the last saved store, and fence stale legacy replacements afterwards');
 const aStore=storage(),bStore=storage(),a=new GradeOutbox(aStore,'teacher',id),b=new GradeOutbox(bStore,'assistant',id);
 a.accept(await request('teacher'));b.accept(await request('assistant'));
 edit(a,'hifz','one');edit(b,'muraja','pass');await Promise.all([a.flush(p=>request('teacher',p)),b.flush(p=>request('assistant',p))]);
 let snapshot=await request('teacher');a.accept(snapshot);b.accept(await request('assistant'));
 assert.equal(a.view({}).S[1].days.sun.muraja,'pass');assert.equal(b.view({}).S[1].days.sun.hifz,'one');assert.equal(snapshot.value.historic[8].keep,0);
 edit(a,'hifz','two');edit(b,'hifz','half');await a.flush(p=>request('teacher',p));await b.flush(p=>request('assistant',p));assert.equal(b.drafts().at(-1).status,'conflict');assert.equal(b.view({}).S[1].days.sun.hifz,'half');assert.equal((await request('teacher')).value.S[1].days.sun.hifz,'two');
 b.accept(await request('assistant'));b.resolve(b.drafts().find(d=>d.status==='conflict').packet.operation_id,false);assert.equal(b.view({}).S[1].days.sun.hifz,'two');
 a.accept(await request('teacher'));edit(a,'attendance','present');const packet=a.drafts().at(-1).packet;
 await assert.rejects(a.flush(async p=>{await request('teacher',p);throw Error('response lost after commit');}),/response lost/);assert.equal(a.drafts().at(-1).status,'pending');
 await stop(); await start(false);
 assert.equal((await legacy('assistant',prior)).status,409,'a restart or fallback must not reopen the legacy writer');
 const reopened=new GradeOutbox(aStore,'teacher',id);await reopened.flush(p=>request('teacher',p));assert.equal(reopened.drafts().at(-1).status,'confirmed');assert.equal((await request('teacher',packet)).replayed,true);
 reopened.accept(await request('teacher'));edit(reopened,'muraja','fail');await assert.rejects(reopened.flush(async()=>{throw Error('offline');}),/offline/);const offlineId=reopened.drafts().at(-1).packet.operation_id;
 const reopenedAgain=new GradeOutbox(aStore,'teacher',id);assert.equal(reopenedAgain.view({}).S[1].days.sun.muraja,'fail');await reopenedAgain.flush(p=>request('teacher',p));assert.equal(reopenedAgain.drafts().find(d=>d.packet.operation_id===offlineId).status,'confirmed');
 reopenedAgain.accept(await request('teacher'));edit(reopenedAgain,'hifz','one');edit(reopenedAgain,'hifz','two');await reopenedAgain.flush(p=>request('teacher',p));assert.equal((await request('teacher')).value.S[1].days.sun.hifz,'two');assert(!reopenedAgain.drafts().some(d=>d.status==='pending'));
 const isolated=new GradeOutbox(aStore,'different-account',id);assert.deepEqual(isolated.view({}),{});assert.equal(isolated.drafts().length,0);
 const raw=await fetch(base,{method:'POST',headers:{Authorization:'Bearer fixture-teacher','Content-Type':'application/json'},body:JSON.stringify({key:'grades',value:{wipe:true}})});assert.equal(raw.status,409);assert.equal((await request('teacher')).value.historic[8].keep,0);
 const allRows=await (await fetch(base,{headers:{Authorization:'Bearer fixture-teacher'}})).json();assert(allRows.every(row=>!row.key.startsWith('grade_plan_')));
 for(const method of ['GET','POST']){const result=await fetch(base+(method==='GET'?'?key=grade_plan_event%3Afixture':''),{method,headers:{Authorization:'Bearer fixture-teacher','Content-Type':'application/json'},body:method==='POST'?JSON.stringify({key:'grade_plan_event:fixture',value:{forged:true}}):undefined});assert.equal(result.status,403);}
 console.log('PASS: two isolated sessions through actual PHP HTTP handlers preserve independent edits, detect same-cell conflict, retain offline drafts across reopen, replay lost-response packet once, chain rapid edits, isolate accounts and reject legacy whole-store replacement');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await stop();if(path.dirname(path.resolve(folder))!==path.resolve(os.tmpdir())||!path.basename(folder).startsWith('qhp-atomic-'))throw Error('Unsafe fixture cleanup');fs.rmSync(folder,{recursive:true,force:true});});
