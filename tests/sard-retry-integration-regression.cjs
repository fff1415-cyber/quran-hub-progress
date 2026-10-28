const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const map=new Map();global.localStorage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};global.sessionStorage={getItem:()=>null};global.window={dispatchEvent:()=>{}};
function load(path,deps){const e={};const js=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','exports',js)(n=>{if(!deps[n])throw Error(n);return deps[n]},e);return e;}
let offline=true,requests=0;
const shared=load('src/lib/shared-state.ts',{'@/lib/auth-session':{getToken:()=> 'isolated'},'@/lib/tenant':{getActiveComplexId:()=>1},'@/lib/secure-data.functions':{secureSetAppState:async()=>{requests++;if(offline)throw Error('offline');return {ok:true}}}});shared.setDataSemester('A');
const mock=load('src/lib/mock-data.ts',{'@/lib/shared-state':shared,'@/lib/auth-session':{hasAuthToken:()=>true},'./cloud-sync':{pushAppState:async(key,payload)=>{assert.equal(key,'sard_queue');return shared.queueSardPatch(payload)}},sonner:{toast:{error:()=>{}}}});
(async()=>{
 mock.enqueuePlanCompleted('S',1,1,'plan','A');await assert.rejects(mock.flushSardQueue(),/offline/);assert.equal(shared.sharedSaveStatus().state,'failed');
 offline=false;await shared.flushSharedEdits();await mock.flushSardQueue();assert.equal(shared.sharedSaveStatus().state,'saved','confirmed durable retry clears the old rejected promise');
 assert.ok(requests>=2);console.log('PASS: real queue transport recovers from response failure without a permanently rejected sard chain');
})().catch(e=>{console.error(e);process.exitCode=1});
