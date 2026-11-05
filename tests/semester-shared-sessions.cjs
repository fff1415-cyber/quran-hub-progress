const assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const {load}=require('./independent-test-support.cjs');const {GradeOutbox,GRADE_ORIGIN}=load('src/lib/grade-outbox.ts',{});
function storage(){const m=new Map();return {get length(){return m.size},key:i=>[...m.keys()][i]??null,getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};}
const php=process.env.PHP_CMD||'php',folder=fs.mkdtempSync(path.join(os.tmpdir(),'qhp-atomic-')),db=path.join(folder,'qhp-atomic-semesters.sqlite');
const env={...process.env,QHP_FIXTURE_DB:db,QHP_FIXTURE_SEMESTERS:'1'};cp.execFileSync(php,['tests/grade-http-fixture.php'],{env,stdio:'pipe'});
let server,base,sequence=0;const id=()=>`semester-fixture-operation-${++sequence}`;
async function request(role,key,packet,extra=''){
 const weekly=packet&&key==='weekly_tests',slot=packet?.changes[0],p=slot?.path;
 const response=await fetch(base+(weekly?'/weekly-tests/result':'/app-state')+(packet?'':`?key=${key}&grade_protocol=1${extra}`),{method:packet?(weekly?'PATCH':'POST'):'GET',headers:{Authorization:'Bearer fixture-'+role,'Content-Type':'application/json'},body:packet?JSON.stringify(weekly?{studentId:p[0],week:Number(p[1]),kind:p[2],index:Number(p[3]),result:slot.next.value,grade_write_protocol:1,value:packet}:{key,grade_write_protocol:1,value:packet}):undefined});
 const value=await response.json();if(!response.ok)throw Object.assign(Error(value.error),{status:response.status});return value;
}
function box(role,key){return new GradeOutbox(storage(),role,id,()=>{},key);}
function edit(b,fn){const before=b.view({}),after={...before};fn(after);b.edit(before,after);}
(async()=>{
 const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));base=`http://127.0.0.1:${port}`;
 server=cp.spawn(php,['-S',`127.0.0.1:${port}`,'tests/grade-http-fixture.php'],{env,stdio:'ignore'});
 let ready=false,last;for(let i=0;i<50;i++){try{await request('teacher','grades');ready=true;break;}catch(e){last=e;await new Promise(r=>setTimeout(r,50));}}if(!ready)throw last;
 const legacy=await request('teacher','grades',null,'&legacy=1');assert.equal(legacy[0].legacy_unknown_semester,true);assert.equal(legacy[0].value.historic[8].keep,0);
 const daily=box('teacher','grades');daily.accept(await request('teacher','grades'));assert.deepEqual(Object.keys(daily.view({})),[],'legacy values never copied to current semester');
 edit(daily,v=>{v.S={1:{days:{sun:{attendance:'present'}}}}});await daily.flush(p=>request('teacher','grades',p));const receiptPacket=daily.drafts()[0].packet;
 const a=box('teacher','scientific_grades'),b=box('assistant','scientific_grades');a.accept(await request('teacher','scientific_grades'));b.accept(await request('assistant','scientific_grades'));
 assert.equal(a.view({}).configs[1].visible,true);assert.deepEqual(a.view({}).data,{});
 edit(a,v=>{v.data={1:{S:{1:{sun:{hifz:'0'}}}}};v.overrides={1:{S:{1:{sun:{hifz:true}}}}};});
 edit(b,v=>{v.data={1:{S:{1:{sun:{rabt:'7'}}}}};});
 await assert.rejects(a.flush(async p=>{await request('teacher','scientific_grades',p);throw Error('lost response');}),/lost response/);
 await b.flush(p=>request('assistant','scientific_grades',p));await a.flush(p=>request('teacher','scientific_grades',p));
 const sci=await request('assistant','scientific_grades');assert.equal(sci.value.data[1].S[1].sun.hifz,'0');assert.equal(sci.value.data[1].S[1].sun.rabt,'7');assert.equal(sci.value.overrides[1].S[1].sun.hifz,true);
 a.accept(sci);b.accept(sci);edit(a,v=>{v.data=structuredClone(v.data);v.data[1].S[1].sun.hifz='3';});edit(b,v=>{v.data=structuredClone(v.data);v.data[1].S[1].sun.hifz='4';});await a.flush(p=>request('teacher','scientific_grades',p));await b.flush(p=>request('assistant','scientific_grades',p));assert.equal(b.drafts().at(-1).status,'conflict');
 const wa=box('teacher','weekly_tests'),wb=box('assistant','weekly_tests');wa.accept(await request('teacher','weekly_tests'));wb.accept(await request('assistant','weekly_tests'));
 wa.editWeeklyResult('S',1,'muraja',0,'pass','1');wb.editWeeklyResult('S',1,'muraja',1,'fail','1');await Promise.all([wa.flush(p=>request('teacher','weekly_tests',p)),wb.flush(p=>request('assistant','weekly_tests',p))]);
 let weekly=await request('teacher','weekly_tests');assert.deepEqual(weekly.value.S[1].muraja,['pass','fail']);assert.equal(weekly.value.S[1].attribution.muraja[0].byName,'teacher');assert.equal(weekly.value.S[1].attribution.muraja[1].byName,'assistant');
 const committee=box('test_member','weekly_tests');committee.accept(await request('test_member','weekly_tests'));committee.editWeeklyResult('S',1,'rabt',0,'pass','1');await committee.flush(p=>request('test_member','weekly_tests',p));assert.equal(committee.drafts()[0].status,'confirmed');
 await assert.rejects(request('test_member','scientific_grades'),e=>e.status===403);await assert.rejects(request('test_member','grades'),e=>e.status===403);
 wa.accept(await request('teacher','weekly_tests'));wa.editWeeklyResult('foreign',1,'rabt',0,'pass','1');await assert.rejects(wa.flush(p=>request('teacher','weekly_tests',p)),e=>e.status===403);
 daily.accept(await request('teacher','grades'));const stale=daily.view({});edit(daily,v=>{v.S=structuredClone(v.S);v.S[1].days.sun.attendance='late';});
 await fetch(base+'/fixture-switch-semester',{headers:{Authorization:'Bearer fixture-teacher'}});
 const termTwo=await request('teacher','grades');assert.notEqual(termTwo.cursor,daily.snapshot().cursor);daily.accept(termTwo);assert.deepEqual(Object.keys(daily.view({})),[],'old drafts never overlay new semester');assert.equal(daily.drafts().at(-1).status,'pending','old draft preserved');
 assert.throws(()=>daily.edit(daily.view({}),stale),/تغيّر الفصل/);assert.throws(()=>daily.edit({},{}),/سياق الشاشة/);
 await daily.flush(p=>request('teacher','grades',p));assert.equal(daily.drafts().at(-1).status,'conflict');assert.deepEqual(Object.keys((await request('teacher','grades')).value),[]);
 assert.equal((await request('teacher','grades',receiptPacket)).replayed,true,'old receipt replays without moving data');
 const histories=await request('teacher','grades',null,'&history=1');assert.equal(histories.length,2);assert(histories.every(row=>row.read_only===true));assert.equal(histories.find(row=>row.semester_id==='1').value.S[1].days.sun.attendance,'present');assert.equal(histories.find(row=>row.legacy_unknown_semester).value.historic[8].keep,0);
 const nextSci=await request('teacher','scientific_grades');assert.deepEqual(nextSci.value.data,{});assert.deepEqual(nextSci.value.overrides,{});assert.equal((await request('teacher','scientific_grades',null,'&legacy=1'))[0].value.data[1].old[1].sun.hifz,'9');
 assert.equal(stale[GRADE_ORIGIN].active_semester_id,'1');await assert.rejects(request('teacher','term:1:grades'),e=>e.status===403);
 console.log('PASS: real PHP HTTP + two browser outboxes: scientific zero/override atomicity, receipt-loss recovery, independent writes, same-cell conflict, weekly slot merge + server attribution, unchanged committee/halaqa permissions, immutable legacy history and stale-screen/semester fences');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{server?.kill();if(path.dirname(path.resolve(folder))!==path.resolve(os.tmpdir())||!path.basename(folder).startsWith('qhp-atomic-'))throw Error('Unsafe fixture cleanup');fs.rmSync(folder,{recursive:true,force:true});});
