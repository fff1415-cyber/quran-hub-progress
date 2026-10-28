const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(path,deps){const e={};const js=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','exports',js)(n=>{if(!deps[n])throw Error(n);return deps[n]},e);return e;}
const types=load('src/lib/evaluation-types.ts',{});let token='session-A',complex=1;
const m=new Map();global.window={};global.localStorage={getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)};
const service=load('src/lib/evaluation-settings-service.ts',{'@/lib/api-base':{buildRphpUrl:p=>p},'@/lib/evaluation-types':types,'@/lib/auth-session':{getToken:()=>token},'@/lib/tenant':{getActiveComplexId:()=>complex}});
(async()=>{
 const settings={...types.DEFAULT_EVALUATION_SETTINGS,error_deduction:7};
 global.fetch=async()=>({ok:true,text:async()=>JSON.stringify({settings})});await service.fetchEvaluationSettings();assert.equal(service.getCachedEvaluationSettings().error_deduction,7);
 global.fetch=async()=>({ok:false,status:503,text:async()=>JSON.stringify({error:'migrate-evaluation-settings unavailable'})});await assert.rejects(service.saveEvaluationSettings({...settings,error_deduction:8}),/unavailable/);assert.equal(service.getCachedEvaluationSettings().error_deduction,7,'failed shared save never claims local success');
 let release;global.fetch=()=>new Promise(r=>release=r);const pending=service.fetchEvaluationSettings();complex=2;token='session-B';release({ok:true,text:async()=>JSON.stringify({settings:{...settings,error_deduction:99}})});await assert.rejects(pending,/تغيّرت الجلسة/);assert.equal(service.getCachedEvaluationSettings().error_deduction,5,'previous session response cannot populate new complex settings');
 const calc=load('src/lib/evaluation-calculator.ts',{});const flow=load('src/lib/sard-phased-flow.ts',{'@/lib/evaluation-calculator':calc});
 const rules={reference:'rule-A',adoptedAt:'2026-10-11',settings};const deferred=flow.buildReviewOnlyPatch({evaluationRules:rules},38,1,0,3,2);
 const before=flow.computeMergedEvaluation(38,[{errors:1,warnings:0}],deferred.evaluationRules.settings);
 settings.review_max_score=200;assert.equal(deferred.evaluationRules.reference,'rule-A');
 // Persisted snapshots are JSON values, independent from subsequent configuration objects.
 const persisted=JSON.parse(JSON.stringify({...rules,settings:{...types.DEFAULT_EVALUATION_SETTINGS,error_deduction:7}}));
 assert.equal(flow.computeMergedEvaluation(38,[{errors:1,warnings:0}],persisted.settings).percent,before.percent);
 assert.equal(flow.resetFullSardAttempt(3).evaluationRules,undefined,'next full attempt can adopt a new confirmed rules version');
 console.log('PASS: shared-save failure, session response isolation, rule-pinned deferred calculation and prospective reset');
})().catch(e=>{console.error(e);process.exitCode=1});
