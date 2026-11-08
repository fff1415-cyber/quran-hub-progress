const fs=require('node:fs'),assert=require('node:assert/strict');
const {load,storage,deferred,hooks,jsx,find,text}=require('./independent-test-support.cjs');
global.window=new EventTarget();global.localStorage=storage();global.sessionStorage=storage();
let token='A',cid=1,failRoster=false,failState=false,studentGate=null,publicReads=0,students=[{id:'S',name:'cached',nationalId:'private-preserved'}],halaqat=[{id:1,name:'cached',teacherCode:'preserved-code'}],writes=0,stateRows=[];
const file='src/lib/cloud-sync.ts',source=fs.readFileSync(file,'utf8');
const deps=Object.fromEntries([...source.matchAll(/from "([^"]+)"/g)].map(m=>[m[1],{}]));
deps['@/lib/auth-session']={getToken:()=>token,getAuthItem:key=>key==='qs_account'?token:key==='qs_complex'?String(cid):null};
deps['@/lib/tenant']={getActiveComplexId:()=>cid};
deps['./mock-data']={loadStudents:()=>structuredClone(students),loadHalaqat:()=>structuredClone(halaqat),saveStudents:v=>students=v,saveHalaqat:v=>halaqat=v,loadSardQueue:()=>[]};
deps['./halaqa-assistants']={normalizeExtraAssistants:()=>[]};
deps['./academic-context']={fetchActiveCalendar:async()=>{},loadCachedCalendar:()=>null};
deps['./secure-data.functions']={
 secureListStudents:async()=>{if(studentGate)return studentGate.promise;if(failRoster)throw Error('offline');return [];},
 secureListHalaqatFull:async()=>{if(failRoster)throw Error('offline');return [];},
 listPublicStudents:async()=>{publicReads++;return [];},listPublicHalaqat:async()=>{publicReads++;return [];},
 secureListAppState:async({data})=>{assert.equal(data.omitGradeValue,true);if(failState)throw Error('state offline');return stateRows;},secureSetAppState:async()=>{writes++;},
};
const scientific=load('src/lib/scientific-grades.ts',{
 '@/lib/auth-session':{hasAuthToken:()=>true},
 '@/lib/grade-input-settings':{},
 '@/lib/scientific-grades-program':{SCIENTIFIC_PROGRAM_ID:'fixture'},
});
deps['./scientific-grades']=scientific;
deps['./financial-ledger']={loadFinancialLedger:()=>({entries:[{id:'pending-local'}]})};
deps['./tarbawi-program']={loadTarbawiStore:()=>({settingsBySemester:{pending:{}},plans:{}})};
const cloud=load(file,deps);const warn=console.warn;console.warn=()=>{};
(async()=>{
 failRoster=true;await cloud.syncFromCloud({force:true});assert.equal(students[0].nationalId,'private-preserved');assert.equal(halaqat[0].teacherCode,'preserved-code');assert.equal(publicReads,0);assert.equal(cloud.isCloudSyncFresh(),false);assert.equal(cloud.getCloudSyncStatus(),'failed');assert.equal(writes,0,'pull never creates shared stores from local leftovers');
 failRoster=false;await cloud.syncFromCloud({force:true});assert.deepEqual(students,[],'confirmed empty roster remains distinguishable from a failed request');assert.equal(cloud.isCloudSyncFresh(),true);
 token='B';cid=2;assert.equal(cloud.isCloudSyncFresh(),false,'freshness cannot cross account/complex boundaries');
 failState=true;await cloud.syncFromCloud({force:true});assert.equal(cloud.isCloudSyncFresh(),false);failState=false;
 students=[{id:'new-session',name:'new'}];studentGate=deferred();const task=cloud.syncFromCloud({force:true});token='C';cid=3;studentGate.resolve([{id:'old-response',name:'old',halaqa_id:1,level:'1',level_type:'gold'}]);await task;
 assert.equal(students[0].id,'new-session','late roster response cannot overwrite another session cache');
 assert.equal(sessionStorage.getItem('qs_syncing'),null);assert.equal(writes,0);
 studentGate=null;failRoster=true;await cloud.syncFromCloud({force:true});
 const runtime=hooks();const ui=load('src/components/CloudSyncStatus.tsx',{'react':runtime.react,'react/jsx-runtime':jsx,'@/lib/cloud-sync':cloud});
 let tree=runtime.render(()=>ui.CloudSyncStatus());runtime.effects();assert.match(text(tree),/آخر نسخة محفوظة/);
 failRoster=false;const button=find(tree,n=>n.type==='button')[0];button.props.onClick();for(let i=0;i<30;i++)await Promise.resolve();tree=runtime.render(()=>ui.CloudSyncStatus());assert.equal(tree,null,'confirmed manual retry removes failure banner');runtime.cleanup();
 const remote={configs:{1:{visible:true,fields:{attendance:true}},2:{visible:true,fields:{attendance:true},defaultScores:{attendance:{late:'4'}}}},data:{1:{S:{1:{sun:{attendance:'0'}}}}},overrides:{}};
 const cache={configs:{1:{visible:true,fields:{attendance:true},defaultScores:{attendance:{present:'7'}}},2:{visible:true,fields:{attendance:true}}},data:{1:{S:{1:{mon:{hifz:'5'}}}}},overrides:{1:{S:{1:{sun:{attendance:true}}}}}};
 stateRows=[{key:'scientific_grades',value:remote}];
 for(const role of ['manager','teacher','assistant']){
   token=role;sessionStorage.setItem('qs_syncing','1');scientific.saveScientificGradesStore(cache);sessionStorage.removeItem('qs_syncing');
   await cloud.syncFromCloud({force:true});assert.equal(cloud.getCloudSyncStatus(),'confirmed');
   const saved=scientific.loadScientificGradesStore();
   assert.deepEqual(saved.configs[1].defaultScores.attendance,{present:'7'});
   assert.deepEqual(saved.configs[2].defaultScores.attendance,{late:'4'});
   assert.deepEqual(saved.data[1].S[1],{sun:{attendance:'0'},mon:{hifz:'5'}});
   assert.equal(saved.overrides[1].S[1].sun.attendance,true);
   assert.equal(saved.data[1].S[1].mon.attendance,undefined);
   assert.equal(writes,0);
 }
 console.log('PASS: manager, teacher and assistant refresh legacy scientific config with missing defaults, keep attendance, zero and overrides, and make no writes');
 const timeout=load('src/lib/request-timeout.ts',{}), originalFetch=global.fetch;
 const attempts=[];
 try{
  global.fetch=async(input,options)=>{attempts.push(input);return new Response(new ReadableStream({start(controller){options.signal.addEventListener('abort',()=>controller.error(Error('aborted fixture')))}}));};
  await assert.rejects(timeout.fetchWithTimeout('/app-state?omit_grade_value=1',{},5),/مهلة قراءة البيانات/);
  await assert.rejects(timeout.fetchWithTimeout('/app-state',{method:'POST'},5),/لم يتأكد الحفظ/);
  assert.deepEqual(attempts,['/app-state?omit_grade_value=1','/app-state']);
 }finally{global.fetch=originalFetch;}
 console.log('PASS: timed-out read is labeled as a read and an uncertain write is not retried');
 console.log('PASS: authenticated failure preserves complete roster; genuine empty is accepted; no false freshness or pull writes; late session response fenced');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>console.warn=warn);
