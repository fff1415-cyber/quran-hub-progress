const assert=require('node:assert/strict');
const {load,storage,deferred,flush,hooks,jsx,find,text}=require('./independent-test-support.cjs');
global.window=new EventTarget();global.localStorage=storage();
const types=load('src/lib/evaluation-types.ts',{});let token='fixture-session-A',complex=1;
const service=load('src/lib/evaluation-settings-service.ts',{'@/lib/api-base':{buildRphpUrl:p=>p},'@/lib/evaluation-types':types,'@/lib/auth-session':{getToken:()=>token},'@/lib/tenant':{getActiveComplexId:()=>complex}});
const response=settings=>({ok:true,text:async()=>JSON.stringify({settings})});
(async()=>{
 const seven={...types.DEFAULT_EVALUATION_SETTINGS,error_deduction:7};
 localStorage.setItem('qshatawi_evaluation_settings_v1',JSON.stringify({...seven,error_deduction:99}));
 assert.equal(service.getCachedEvaluationSettings().error_deduction,5,'unassigned old cache must not be attributed to this complex');
 global.fetch=async()=>response(seven);await service.fetchEvaluationSettings();
 assert.equal(service.getCachedEvaluationSettings().error_deduction,7);
 global.fetch=async()=>({ok:false,status:503,text:async()=>JSON.stringify({error:'fixture shared write failed'})});
 await assert.rejects(service.saveEvaluationSettings({...seven,error_deduction:8}),/shared write failed/);
 assert.equal(service.getCachedEvaluationSettings().error_deduction,7);
 const late=deferred();global.fetch=()=>late.promise;const request=service.fetchEvaluationSettings();
 complex=2;token='fixture-session-B';late.resolve(response({...seven,error_deduction:90}));await assert.rejects(request,/تغيّرت الجلسة/);
 assert.equal(service.getCachedEvaluationSettings().error_deduction,5);
 const oldRead=deferred();global.fetch=()=>oldRead.promise;const pending=service.fetchEvaluationSettings();
 global.fetch=async()=>response({...seven,error_deduction:0});await service.saveEvaluationSettings(seven);
 oldRead.resolve(response({...seven,error_deduction:3}));await assert.rejects(pending,/أقدم/);
 assert.equal(service.getCachedEvaluationSettings().error_deduction,0,'old GET cannot overwrite a confirmed PUT in the same session');
 global.fetch=async()=>response({error_deduction:1});await assert.rejects(service.saveEvaluationSettings(seven),/صالحة/);
 assert.equal(service.getCachedEvaluationSettings().error_deduction,0);
 assert.equal(JSON.parse(localStorage.getItem('qshatawi_evaluation_settings_v1')).error_deduction,99,'old unassigned cache remains intact');

 // Exercise the actual provider: a late previous-session read cannot end the new loading state.
 const runtime=hooks();const requests=[];
 const provider=load('src/contexts/EvaluationSettingsContext.tsx',{'react':runtime.react,'react/jsx-runtime':jsx,'@/lib/evaluation-types':types,'@/lib/evaluation-settings-service':{getCachedEvaluationSettings:()=>({...seven,error_deduction:complex}),fetchEvaluationSettings:()=>{const d=deferred();requests.push(d);return d.promise;},saveEvaluationSettings:service.saveEvaluationSettings},'@/lib/auth-session':{getToken:()=>token},'@/lib/tenant':{getActiveComplexId:()=>complex}});
 const render=()=>runtime.render(()=>provider.EvaluationSettingsProvider({children:null})).props.value;
 let value=render();const first=value.refresh();complex=3;token='fixture-session-C';const second=render().refresh();
 requests[0].resolve(seven);await first;value=render();assert.equal(value.loading,true);assert.equal(value.settings.error_deduction,3);assert.equal(value.verified,false);
 requests[1].resolve({...seven,error_deduction:9});await second;value=render();assert.equal(value.loading,false);assert.equal(value.verified,true);assert.equal(value.settings.error_deduction,9);

 // A real settings-panel callback must not announce success before the shared save resolves.
 const panelRuntime=hooks(), notices=[];let saveGate=deferred();const context={settings:seven,loading:false,saving:false,verified:true,save:()=>saveGate.promise,refresh:async()=>{}};
 const panel=load('src/components/role-workspace/ManagerEvaluationSettingsPanel.tsx',{'react':panelRuntime.react,'react/jsx-runtime':jsx,'@/lib/evaluation-types':types,'@/contexts/EvaluationSettingsContext':{useEvaluationSettings:()=>context},'@/components/ui/input':{Input:'input'},'@/components/ui/button':{Button:'button'},'lucide-react':{ClipboardList:'icon',Loader2:'icon',RotateCcw:'icon',Save:'icon'},'sonner':{toast:{success:m=>notices.push(['success',m]),error:m=>notices.push(['error',m])}}});
 const panelTree=()=>panelRuntime.render(panel.ManagerEvaluationSettingsPanel);
 const click=()=>find(panelTree(),n=>n.type==='button'&&text(n).includes('حفظ الإعدادات'))[0].props.onClick();
 click();await flush();assert.equal(notices.length,0);saveGate.reject(Error('fixture denied save'));await flush();assert.deepEqual(notices.map(x=>x[0]),['error']);
 saveGate=deferred();click();saveGate.resolve(seven);await flush();assert.deepEqual(notices.map(x=>x[0]),['error','success']);
 context.saving=true;assert.equal(find(panelTree(),n=>n.type==='button'&&text(n).includes('تأكيد الحفظ'))[0].props.disabled,true);
 console.log('PASS: settings confirmation, failure, zero, stale session/read, retained legacy cache and actual panel callback');
})().catch(error=>{console.error(error);process.exitCode=1;});
