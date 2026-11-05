const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');
function load(file,deps={}){const exports={};const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('exports','require',js)(exports,n=>{if(!(n in deps))throw Error('unmocked '+n);return deps[n]});return exports}
(async()=>{
 const original=global.fetch;
 const timeout=load('src/lib/request-timeout.ts');
 let calls=0;
 global.fetch=async(_input,options)=>{calls++;return new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('aborted'))));};
 await assert.rejects(timeout.fetchWithTimeout('/write',{method:'POST'},5),/لم يتأكد الحفظ/);assert.equal(calls,1);
 global.fetch=async()=>new Response(new ReadableStream({start(){}}));
 // Model a fetch body that honors its abort signal like a browser network body.
 global.fetch=async(_input,options)=>new Response(new ReadableStream({start(controller){options.signal.addEventListener('abort',()=>controller.error(new Error('aborted body')))}}));
 await assert.rejects(timeout.fetchWithTimeout('/read',{},5),/انتهت مهلة/);
 global.fetch=async()=>new Response('{"ok":true}',{status:200});
 assert.deepEqual(await(await timeout.fetchWithTimeout('/read')).json(),{ok:true});
 global.fetch=original;
 let writes=0;
 const fail=async()=>{throw Error('cloud read failed')};
 const noop=()=>{};
 const cloud=load('src/lib/cloud-sync.ts',{
 './mock-data':{},'./weekly-tests':{},'./staff-attendance':{},'./halaqa-assistants':{},'./student-portal-settings':{},'./complex-features':{},'./financial-ledger':{},'./push-notification-settings':{},'./tarbawi-program':{},'./academic-record':{},'./halaqa-programs':{},
 './secure-data.functions':{secureListAppState:fail,secureSetAppState:async()=>{writes++}},
 './academic-context':{},'./semester-absence':{},'@/lib/tenant':{},'@/lib/auth-session':{getToken:()=> 'fixture-token'},
 });
 await assert.rejects(cloud.pushMergedGrades({fixture:{}}),/cloud read failed/);
 await assert.rejects(cloud.pushMergedFinancialLedger({entries:[]}),/cloud read failed/);
 assert.equal(writes,0,'failed prerequisite read cannot issue a replacement write');
 console.log('PASS: bounded headers/body, no unknown-write retry, failed cloud reads issue zero writes');
})().catch(error=>{console.error(error);process.exitCode=1});
