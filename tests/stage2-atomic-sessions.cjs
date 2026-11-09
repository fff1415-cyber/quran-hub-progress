const assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const {load,jsx,find}=require('./independent-test-support.cjs');const {GradeOutbox}=load('src/lib/grade-outbox.ts',{});
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
 assert.equal((await legacy('teacher',prior)).status,409);
 assert.deepEqual((await (await legacy('assistant')).json())[0].value,prior);
 await assert.rejects(request('teacher'),{status:503});
 await assert.rejects(request('assistant',{operation_id:'premature-fixture-write'}),{status:503});
 assert.deepEqual((await (await legacy('teacher')).json())[0].value,prior);
 await stop();
 await start(false);
 const program=async(role,packet,legacy=false)=>{
  const key='halaqa_program_grades';
  const response=await fetch(base+(packet?'':'?key='+key+'&grade_protocol=1'),{
   method:packet?'POST':'GET',headers:{Authorization:'Bearer fixture-'+role,'Content-Type':'application/json'},
   body:packet?JSON.stringify({key,...(legacy?{}:{grade_write_protocol:1}),value:packet}):undefined});
  const value=await response.json();if(!response.ok)throw Object.assign(Error(value.error),{status:response.status});return value;
 };
 const programTeacher=new GradeOutbox(storage(),'program-teacher',id);
 const programAssistant=new GradeOutbox(storage(),'program-assistant',id);
 const initialPrograms=await program('teacher');
 programTeacher.accept(initialPrograms);programAssistant.accept(await program('assistant'));
 const sun=['1','S','1','test-program','sun'],mon=['1','S','1','test-program','mon'];
 programTeacher.editCell(initialPrograms.value,sun,'yes');
 programAssistant.editCell(initialPrograms.value,mon,'no');
 await Promise.all([programTeacher.flush(p=>program('teacher',p)),programAssistant.flush(p=>program('assistant',p))]);
 await assert.rejects(program('teacher',initialPrograms.value,true),{status:409});
 const both=await program('assistant');
 assert.deepEqual(both.value[1].S[1]['test-program'],{sun:'yes',mon:'no'});
 assert.equal(both.value[1].S[2]['test-program'].tue,'yes');
 programAssistant.accept(both);
 programAssistant.editCell(both.value,sun,'');
 const cancel=programAssistant.drafts().at(-1).packet;
 await programAssistant.flush(p=>program('assistant',p));
 assert.equal((await program('assistant',cancel)).replayed,true);
 const current=await program('teacher');
 assert.deepEqual(current.value[1].S[1]['test-program'],{mon:'no'});
 const staleStorage=storage(),stale=new GradeOutbox(staleStorage,'stale-program',id);
 stale.accept(initialPrograms);
 stale.editCell(initialPrograms.value,sun,'no');
 await stale.flush(p=>program('teacher',p));
 const reopened=new GradeOutbox(staleStorage,'stale-program',id);
 assert.equal(reopened.drafts()[0].status,'conflict');
 assert.equal(reopened.drafts()[0].packet.changes[0].next.value,'no');
 assert.deepEqual((await program('teacher')).value,current.value);
 console.log('PASS: program cells support concurrent teacher/assistant saves, cancellation, replay and retained stale drafts; old whole-store requests cannot erase restored grades');
 assert.deepEqual((await request('assistant')).value,prior);
 for(const role of ['manager','teacher','assistant']){
  const response=await fetch(base+'?omit_grade_value=1',{headers:{Authorization:'Bearer fixture-'+role}});
  assert.equal(response.status,200);
  const row=(await response.json()).find(r=>r.key==='grades');assert(row);
  assert.deepEqual(row.value,prior,'bulk read preserves the legacy display data');
  assert.deepEqual((await request(role)).value,prior,'atomic endpoint still returns exact attendance and historical grades');
 }
 assert.equal((await legacy('teacher',{...prior,historic:{}})).status,409);
 assert.deepEqual((await request('teacher')).value,prior);
 for (const key of ['grades','weekly_tests']) {
  for (const value of [{}, [], {stale:{}}]) {
   const reset = await fetch(base,{method:'POST',headers:{Authorization:'Bearer fixture-teacher','Content-Type':'application/json'},body:JSON.stringify({key,value})});
   assert.equal(reset.status,409);
  }
 }
 const weekly = (await (await fetch(base+'?key=weekly_tests',{headers:{Authorization:'Bearer fixture-teacher'}})).json())[0].value;
 assert.deepEqual(weekly,{historic:{8:{muraja:['pass']}}});
 assert.deepEqual((await request('teacher')).value,prior);
 console.log('PASS: server rejects stale and empty legacy replacements for both grade and weekly test stores');
 const tarbawi = async (token, body) => {
  const url = body?.tarbawi_write_protocol ? new URL('/tarbawi/record',base) : base+(body?'':'?key=tarbawi_program');
  const response = await fetch(url, {
   method:body?'POST':'GET', headers:{Authorization:'Bearer fixture-'+token,'Content-Type':'application/json'},
   body:body?JSON.stringify({key:'tarbawi_program',...body}):undefined,
  });
  return {status:response.status,body:await response.json()};
 };
 const programEdit = (section,semesterId,base,next) => ({tarbawi_write_protocol:1,value:{section,semesterId,base,next}});
 const plan = {semesterId:'1',halaqaId:1,status:'draft',items:[{id:'existing'}]};
 const settings = {semesterId:'1',paragraphTypes:[],weeklyRequiredCount:2,halaqaSpans:{}};
 const createPlan = programEdit('plans','1',null,plan);
 assert.equal((await tarbawi('teacher',createPlan)).status,200);
 assert.equal((await tarbawi('teacher',createPlan)).status,200,'idempotent retry after a lost reply');
 assert.equal((await tarbawi('manager',programEdit('settingsBySemester','1',null,settings))).status,200);
 const program = (await tarbawi('manager')).body;
 assert.equal((await tarbawi('teacher',{value:{plans:{},settingsBySemester:{}}})).status,409);
 assert.equal((await tarbawi('assistant',programEdit('plans','old',null,{...plan,semesterId:'old',items:[]}))).status,409);
 assert.equal((await tarbawi('assistant',programEdit('plans','1',null,{...plan,items:[]}))).status,409);
 assert.deepEqual((await tarbawi('manager')).body,program);
 const updated = {...plan,items:[...plan.items,{id:'next'}]};
 assert.equal((await tarbawi('teacher',programEdit('plans','1',plan,updated))).status,200);
 assert.equal((await tarbawi('assistant',programEdit('plans','1',plan,{...plan,items:[]}))).status,409);
 const savedProgram = (await tarbawi('manager')).body[0].value;
 assert.deepEqual(savedProgram.plans['1:1'],updated);
 assert.equal(savedProgram.settingsBySemester['1'].weeklyRequiredCount,2);
 console.log('PASS: program record edits preserve other data and reject old bulk, stale semester, and concurrent stale edits');
 const state = async (key, value, revision) => {
  const writing = value !== undefined;
  const url = revision === undefined ? base+(writing?'':'?key='+key) : new URL('/scientific-grades/store',base);
  const response = await fetch(url,{
   method:writing?'POST':'GET',headers:{Authorization:'Bearer fixture-manager','Content-Type':'application/json'},
   body:writing?JSON.stringify({key,value,scientific_base:revision}):undefined,
  });
  return {status:response.status,body:await response.json()};
 };
 for (const key of ['academic_records','sard_history']) {
  const history = Array.from({length:501},(_,i)=>({id:'history-'+i}));
  assert.equal((await state(key,history)).status,200);
  assert.equal((await state(key,[{id:'new'},...history.slice(0,499)])).status,200);
  assert.deepEqual((await state(key)).body[0].value,[{id:'new'},...history]);
 }
 const science = {configs:{},data:{S:{week:{score:8}}},overrides:{}};
 const initialRevision = (await state('scientific_grades')).body[0].revision;
 assert.equal((await state('scientific_grades',science,initialRevision)).status,200);
 assert.equal((await state('scientific_grades',{},initialRevision)).status,409);
 assert.equal((await state('scientific_grades',{})).status,409);
 const currentScience = (await state('scientific_grades')).body[0];
 assert.equal((await state('scientific_grades',{},currentScience.revision)).status,409);
 assert.deepEqual(currentScience.value.data,science.data);
 const scientificConfig = async (revision, on) => {
  const response = await fetch(new URL('/scientific-grades/store',base), {
   method:'POST',headers:{Authorization:'Bearer fixture-teacher','Content-Type':'application/json'},
   body:JSON.stringify({scientific_base:revision,scientific_config:{halaqaId:1,settings:{
    visible:on,fields:{attendance:false,hifz:on,rabt:false,muraja:false},defaultScores:{hifz:'8'},
   }}}),
  });
  return response.status;
 };
 assert.equal(await scientificConfig(currentScience.revision,true),200);
 const enabledScience = (await state('scientific_grades')).body[0];
 assert.equal(enabledScience.value.configs['1'].fields.hifz,true);
 assert.equal(await scientificConfig(enabledScience.revision,false),200);
 const disabledScience = (await state('scientific_grades')).body[0];
 assert.equal(disabledScience.value.configs['1'].fields.hifz,false);
 assert.deepEqual(disabledScience.value.data,science.data);
 assert.equal((await state('scientific_grades',enabledScience.value,disabledScience.revision)).status,409);
 assert.equal((await state('scientific_grades',{
  ...disabledScience.value,data:{1:{S:{1:{sun:{hifz:'8',rabt:'8',muraja:'8'}}}}},
 },disabledScience.revision)).status,409,'no preparation means no automatic scientific points');
 assert.deepEqual((await state('scientific_grades')).body[0],disabledScience);
 assert.equal(await scientificConfig(disabledScience.revision,true),200);
 assert.equal((await state('scientific_grades')).body[0].value.configs['1'].fields.hifz,true);
 console.log('PASS: capped history submissions preserve every stored record and stale scientific snapshots cannot replace saved grades');
 const aStore=storage(),bStore=storage(),a=new GradeOutbox(aStore,'teacher',id),b=new GradeOutbox(bStore,'assistant',id);
 a.accept(await request('teacher'));b.accept(await request('assistant'));
 const staleBefore = a.view({}), staleAfter = structuredClone(staleBefore);
 staleAfter.S[1].days.sun.attendance = 'late';
 const staleBox = new GradeOutbox(storage(),'old-semester',id);
 const oldSnapshot = await request('teacher');
 staleBox.accept({...oldSnapshot,calendar_context:{known:true,active_semester_id:'previous'}});
 staleBox.edit(staleBefore,staleAfter);
 await staleBox.flush(p=>request('teacher',p));
 assert.equal(staleBox.drafts()[0].status,'conflict');
 assert.equal(staleBox.drafts()[0].packet.changes[0].next.value,'late');
 assert.deepEqual((await request('teacher')).value,prior);
 edit(a,'hifz','one');edit(b,'muraja','pass');await Promise.all([a.flush(p=>request('teacher',p)),b.flush(p=>request('assistant',p))]);
 let snapshot=await request('teacher');a.accept(snapshot);b.accept(await request('assistant'));
 assert.equal(a.view({}).S[1].days.sun.muraja,'pass');assert.equal(b.view({}).S[1].days.sun.hifz,'one');assert.equal(snapshot.value.historic[8].keep,0);
 const afterPreparation = (await state('scientific_grades')).body[0];
 const scoreWrite = {...afterPreparation.value,data:{...afterPreparation.value.data,1:{S:{1:{sun:{hifz:'8',muraja:'6'}}}}}};
 assert.equal((await state('scientific_grades',scoreWrite,afterPreparation.revision)).status,200);
 const afterPoints = (await state('scientific_grades')).body[0];
 assert.equal(afterPoints.value.data['1'].S[1].sun.muraja,'6');
 edit(a,'hifz','two');edit(b,'hifz','half');await a.flush(p=>request('teacher',p));await b.flush(p=>request('assistant',p));assert.equal(b.drafts().at(-1).status,'conflict');assert.equal(b.view({}).S[1].days.sun.hifz,'half');assert.equal((await request('teacher')).value.S[1].days.sun.hifz,'two');
 const conflictingPacket = b.drafts().at(-1).packet;
 b.accept(await request('assistant'));
 const archived = b.drafts().find(d => d.packet.operation_id === conflictingPacket.operation_id);
 assert.equal(archived.status, 'archived');
 assert.deepEqual(archived.packet, conflictingPacket);
 assert.equal(b.view({}).S[1].days.sun.hifz, 'two');
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
 const teacherStorage=storage(), assistantStorage=storage();
 const teacher=new GradeOutbox(teacherStorage,'cancel-teacher',id);
 const assistant=new GradeOutbox(assistantStorage,'cancel-assistant',id);
 for (const [field,value,seed] of [['attendance','present','late'],['hifz','one','two'],['rabt','pass','fail'],['muraja','pass','fail']]) {
  teacher.accept(await request('teacher'));
  if (teacher.view({}).S[1].days.sun[field]===value) {
   edit(teacher,field,seed);await teacher.flush(p=>request('teacher',p));teacher.accept(await request('teacher'));
  }
  edit(teacher,field,value);
  await teacher.flush(p=>request('teacher',p));
  const acknowledged=teacher.drafts().at(-1);
  assert.equal(acknowledged.status,'confirmed');
  assistant.accept(await request('assistant'));
  assert.equal(assistant.view({}).S[1].days.sun[field],value);
  // Undo in the real window between the POST receipt and the next GET.
  edit(teacher,field,'');
  const cancel=teacher.drafts().at(-1);
  assert.equal(cancel.status,'pending');
  assert.deepEqual(cancel.dependencies,[acknowledged.packet.operation_id]);
  await teacher.flush(p=>request('teacher',p));
  assistant.accept(await request('assistant'));
  assert.equal(assistant.view({}).S[1].days.sun[field],'');
  const reload=new GradeOutbox(teacherStorage,'cancel-teacher',id);
  reload.accept(await request('teacher'));
  assert.equal(reload.view({}).S[1].days.sun[field],'');
 }
 assert.equal((await request('assistant')).value.historic[8].keep,0);
 console.log('PASS: a cancellation after the receipt but before refresh persists for attendance, hifz, rabt and muraja across both sessions');
 const data=load('src/lib/mock-data.ts',{'./grade-sync':{},'@/lib/auth-session':{}});
 const inputSettings=load('src/lib/grade-input-settings.ts',{});
 const inputs=load('src/components/plans/TeacherGradeInputs.tsx',{
  'react/jsx-runtime':jsx,'@/lib/mock-data':data,'@/lib/grade-input-settings':inputSettings,
  '@/contexts/GradeInputSettingsContext':{useGradeInputSettings:()=>({settings:inputSettings.DEFAULT_GRADE_INPUT_SETTINGS})},
  '@/lib/utils':{cn:()=>''},'lucide-react':{},
 });
 const sparse=new GradeOutbox(storage(),'sparse-teacher',id);
 sparse.accept(await request('teacher'));
 const sparseEdit=(field,value)=>{
  const before=sparse.view({}),next=structuredClone(before);
  (next.S[1].days.tue??={})[field]=value;
  sparse.edit(before,next);
  assert.deepEqual(sparse.drafts().at(-1).packet.changes.map(c=>c.path),[['S','1','days','tue',field]]);
 };
 const day=()=>sparse.view({}).S[1].days.tue??{};
 const hifzInput=()=>inputs.HifzTaskInput({value:day().hifz,levelType:'gold',onChange:v=>sparseEdit('hifz',v)});
 const passFail=field=>inputs.PassFail({value:day()[field],field,onChange:v=>sparseEdit(field,v)});
 const attendance=()=>find(inputs.AttSelect({value:day().attendance,onChange:v=>sparseEdit('attendance',v)}),n=>n.type==='select')[0];
 const {PlanAwareTaskCell}=load('src/components/plans/PlanAwareTaskCell.tsx',{
  'react/jsx-runtime':jsx,'@/components/plans/TeacherGradeInputs':inputs,
 });
 const selected=[];
 const planCell=PlanAwareTaskCell({student:{levelType:'gold'},task:'hifz',hasPlan:true,hifzValue:'',
  onHifzChange:()=>assert.fail('a linked grade cannot be saved without its plan'),onPlanHifzChange:v=>selected.push(v),
 });
 planCell.props.onChange('two');
 assert.deepEqual(selected,['two'],'the plan receives the exact chosen memorization amount');
 const flushSparse=async()=>{await sparse.flush(p=>request('teacher',p));sparse.accept(await request('teacher'));assistant.accept(await request('assistant'));};
 attendance().props.onChange({target:{value:'present'}});
 await flushSparse();
 assert.deepEqual(assistant.view({}).S[1].days.tue,{attendance:'present'});
 assert.equal(hifzInput().props.checked,false);
 assert.equal(passFail('rabt').props.checked,false);
 assert.equal(passFail('muraja').props.checked,false);
 for(const [field,input,value] of [['hifz',hifzInput,'one'],['rabt',()=>passFail('rabt'),'pass'],['muraja',()=>passFail('muraja'),'pass']]){
  input().props.onChange(true);await flushSparse();
  assert.equal(input().props.checked,true);
  assert.equal(assistant.view({}).S[1].days.tue[field],value);
  input().props.onChange(false);await flushSparse();
  assert.equal(input().props.checked,false);
  assert.equal(assistant.view({}).S[1].days.tue[field],'');
  assert.equal(assistant.view({}).S[1].days.tue.attendance,'present');
 }
 attendance().props.onChange({target:{value:''}});await flushSparse();
 assert.deepEqual((await request('assistant')).value.S[1].days.tue,{attendance:'',hifz:'',rabt:'',muraja:''});
 console.log('PASS: actual preparation controls render a sparse attendance-only day correctly and save each control independently');
 console.log('PASS: two isolated sessions through actual PHP HTTP handlers preserve independent edits, detect same-cell conflict, retain offline drafts across reopen, replay lost-response packet once, chain rapid edits, isolate accounts and reject legacy whole-store replacement');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await stop();if(path.dirname(path.resolve(folder))!==path.resolve(os.tmpdir())||!path.basename(folder).startsWith('qhp-atomic-'))throw Error('Unsafe fixture cleanup');fs.rmSync(folder,{recursive:true,force:true});});
