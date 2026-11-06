const assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const {load,storage}=require('./independent-test-support.cjs');
function full(){const s=storage();return {...s,get length(){return s.data.size},key:i=>[...s.data.keys()][i]??null};}
global.window=new EventTarget();global.localStorage=full();global.sessionStorage=storage();
const php=process.env.PHP_CMD||'php',folder=fs.mkdtempSync(path.join(os.tmpdir(),'qhp-atomic-')),db=path.join(folder,'qhp-atomic-assessments.sqlite'),env={...process.env,QHP_FIXTURE_DB:db,QHP_FIXTURE_TRANSITIONS:'1'};
cp.execFileSync(php,['tests/grade-http-fixture.php'],{env,stdio:'pipe'});let server,base,token='fixture-musammi',actor={role:'musammi',complexId:1,accountId:'musammi'},offline=true,lost=false,oldCapability=false,posted=[];
const realFetch=global.fetch;global.fetch=async(url,options={})=>{
 if(String(url).endsWith('/sard/capabilities')&&oldCapability)return new Response(JSON.stringify({context_complex_id:1,sard_assessment_protocol:0}));
 if(options.body&&JSON.parse(options.body).value?.sard_assessment_protocol){posted.push(options.body);const response=await realFetch(url,options);if(lost&&response.ok)throw Error('reply lost after atomic commit');return response;}
 return realFetch(url,options);
};
const auth={getToken:()=>token,hasAuthToken:()=>true,decodeAuthTokenPayload:()=>actor},tenant={getActiveComplexId:()=>1},api=load('src/lib/secure-data.functions.ts',{'@/lib/api-base':{buildRphpUrl:p=>base+p},'@/lib/tenant':tenant});
function browser(){
 const mock=load('src/lib/mock-data.ts',{'./grade-sync':{gradeView:v=>v},'@/lib/auth-session':auth,'./cloud-sync':{pushAppState:async()=>{throw Error('Unexpected legacy echo');}}});
 const refresh=load('src/lib/sard-queue-refresh.ts',{'@/lib/auth-session':auth,'@/lib/tenant':tenant,'@/lib/secure-data.functions':api,'@/lib/mock-data':mock});
 const service=load('src/lib/sard-assessments.ts',{'./auth-session':auth,'./tenant':tenant,'./api-base':{buildRphpUrl:p=>base+p},'./mock-data':{...mock,flushSardQueue:async()=>{if(offline)throw Error('offline during old queue flush');}},'./sard-queue-refresh':refresh,'./request-timeout':{fetchWithTimeout:(...args)=>global.fetch(...args)}});
 return {mock,service};
}
const history=item=>({id:'untrusted',studentId:item.studentId,halaqaId:item.halaqaId,week:item.week,attempt:item.attempt,result:'failed',percent:0,hifzErrors:4,hifzWarnings:0,reviewErrors:[0,2],reviewWarnings:[0,0],at:'',evaluationRules:{reference:'original-rule',settings:{zero:0,unknown:null}}});
(async()=>{
 const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));base=`http://127.0.0.1:${port}`;server=cp.spawn(php,['-S',`127.0.0.1:${port}`,'tests/grade-http-fixture.php'],{env,stdio:'ignore'});
 let ready=false,last;for(let i=0;i<50;i++){try{await api.secureListAppState({data:{token,key:'sard_queue'}});ready=true;break;}catch(e){last=e;await new Promise(r=>setTimeout(r,50));}}if(!ready)throw last;
 const read=async key=>(await api.secureListAppState({data:{token,key}}))[0].value;
 const initial=await read('sard_queue'),item=initial.find(q=>q.id==='sq-1'),patch={status:'scheduled',attempt:2,scheduledAt:'2026-11-15T00:00:00Z',hifzErrors:0,reviewErrors:[0,0]},details=history(item);let client=browser();
 sessionStorage.setItem('qs_syncing','1');client.mock.saveSardQueue(initial);sessionStorage.removeItem('qs_syncing');
 await assert.rejects(client.service.saveSardAssessment(item,patch,details),/offline during old/);assert.equal(posted.length,0);assert.equal(client.service.assessmentEntries()[0].status,'pending');const frozenBody=client.service.assessmentEntries()[0].body;
 details.hifzErrors=99;assert.equal(JSON.parse(frozenBody).value.history_record.hifzErrors,4,'assessment is frozen before any network attempt');
 offline=false;lost=true;client=browser();const id=client.service.assessmentEntries()[0].id;await assert.rejects(client.service.resumeSardAssessment(id),/reply lost/);assert.equal(client.mock.loadSardQueue().find(q=>q.id===item.id).attempt,1,'unknown reply cannot confirm the next attempt locally');
 const saved=(await read('sard_history')).find(h=>h.sourceQueueItemId===item.id);assert.equal(saved.hifzErrors,4);assert.equal(saved.hifzWarnings,0);assert.equal(saved.evaluationRules.settings.unknown,null);
 lost=false;const queue=await read('sard_queue'),current=queue.find(q=>q.id===item.id);await api.secureSetAppState({data:{token:'fixture-manager',key:'sard_queue',value:{changes:[{base:current,item:{...current,status:'approved_third',attempt:3,newerDeviceMarker:'keep'}}]}}});
 client=browser();await Promise.all([client.service.resumeSardAssessment(id),client.service.resumeSardAssessment(id)]);assert.equal(posted.length,2,'two simultaneous recoveries share one send');assert.equal(posted[0],frozenBody);assert.equal(posted[1],frozenBody);assert.equal(client.service.assessmentEntries()[0].status,'verified');assert.equal(client.mock.loadSardQueue().find(q=>q.id===item.id).newerDeviceMarker,'keep');assert.equal((await read('sard_history')).filter(h=>h.sourceQueueItemId===item.id).length,1);assert.equal(client.mock.loadSardHistory()[0].at,saved.at);
 const primaryDisk=localStorage;global.localStorage=full();token='fixture-assistant';actor={role:'assistant',complexId:1,accountId:'assistant'};client=browser();await assert.rejects(client.service.saveSardAssessment(item,patch,history(item)),/جهاز آخر/);assert.equal(client.service.assessmentEntries()[0].status,'conflict');assert.equal((await read('sard_history')).filter(h=>h.sourceQueueItemId===item.id).length,1,'a conflicting independent device cannot duplicate the assessment');
 global.localStorage=primaryDisk;token='fixture-musammi';actor={role:'musammi',complexId:1,accountId:'musammi'};client=browser();const final=initial.find(q=>q.id==='sq-final'),before=posted.length;oldCapability=true;await assert.rejects(client.service.saveSardAssessment(final,{status:'final_failed'},history(final)),/لم يُرسل/);assert.equal(posted.length,before);oldCapability=false;
 const blocked=client.service.assessmentEntries().find(e=>e.id!==id);await client.service.resumeSardAssessment(blocked.id);assert.equal((await read('sard_queue')).find(q=>q.id===final.id).status,'final_failed');
 const store=localStorage.setItem;localStorage.setItem=()=>{throw Error('quota');};const count=posted.length;await assert.rejects(client.service.saveSardAssessment({...item,id:'quota'},patch,history(item)),/تعذّر حفظ طلب/);assert.equal(posted.length,count);localStorage.setItem=store;
 token='fixture-assistant';actor={role:'assistant',complexId:1,accountId:'assistant'};assert.equal(client.service.assessmentEntries().length,0,'account scope does not expose another user’s pending or completed assessments');
 console.log('PASS: actual failed/deferred serializer + production router: durable-before-network, exact lost-reply recovery after reopen, no stale queue overlay, independent-session conflict, frozen counters/rules, capability-before-send, quota and account isolation');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{server?.kill();global.fetch=realFetch;fs.rmSync(folder,{recursive:true,force:true});});
