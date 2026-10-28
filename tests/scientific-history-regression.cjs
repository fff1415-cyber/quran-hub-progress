const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function storage(){const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}}
global.localStorage=storage();global.sessionStorage=storage();global.window=new EventTarget();
let edits=0;
function load(path,deps){const e={};const js=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','exports',js)(n=>{if(!(n in deps))throw Error(n);return deps[n]},e);return e;}
const shared={captureSharedEdit:()=>edits++,semesterStorageKey:k=>k,flushSharedEdits:async()=>{}};
const deps={'@/lib/auth-session':{hasAuthToken:()=>false},'@/lib/shared-state':shared,'@/lib/mock-data':{isHifzChecked:v=>['half','one','two'].includes(v)},'@/lib/grade-input-settings':{},'@/lib/scientific-grades-program':{ensureScientificHalaqaProgram:()=>{},removeScientificHalaqaProgram:()=>{}}};
const sci=load('src/lib/scientific-grades.ts',deps);
const config={visible:true,fields:{attendance:false,hifz:true,rabt:false,muraja:false},defaultScores:{hifz:'10'}};
localStorage.setItem('qshatawi_scientific_grades_v1',JSON.stringify({configs:{1:config},data:{1:{S:{1:{sun:{hifz:'7'}}}}},overrides:{}}));
sci.syncScientificScoresFromPrepForHalaqa(1,{S:{1:{days:{sun:{hifz:'one'}}}}},['S'],config);
assert.equal(sci.loadScientificData(1).S[1].sun.hifz,'7','unversioned historical score is never recomputed by opening a page');
edits=0;sci.setTeacherScientificDayScore(1,'S',1,'sun','hifz','');assert.equal(edits,1,'manual clear and override are one captured transaction');
sci.syncScientificScoresFromDayPatch(1,'S',1,'mon',config,{hifz:'one'},{hifz:'one'});
assert.equal(sci.loadScientificData(1).S[1].mon.hifz,'10');
const next={...config,defaultScores:{hifz:'20'}};sci.saveScientificConfig(1,next,{resetOverrides:true});
sci.syncScientificScoresFromPrepForHalaqa(1,{S:{1:{days:{sun:{hifz:'one'},mon:{hifz:'one'}}}}},['S'],next);
assert.equal(sci.loadScientificData(1).S[1].sun.hifz,'','clear survives refresh/configuration change');
assert.equal(sci.loadScientificGradesStore().overrides['1'].S[1].sun.hifz,true,'configuration does not erase manual override history');
assert.equal(sci.loadScientificData(1).S[1].mon.hifz,'10','existing score keeps pinned rules');
sci.syncScientificScoresFromDayPatch(1,'S',1,'tue',next,{hifz:'one'},{hifz:'one'});assert.equal(sci.loadScientificData(1).S[1].tue.hifz,'20','new explicit recording adopts current rules');
const policy=load('src/lib/grade-policy-preview.ts',{'@/lib/tenant':{getActiveComplexId:()=>1},'@/lib/shared-state':shared});
const days=[{iso:'2026-10-11',isWorking:true},{iso:'2026-10-12',isWorking:true},{iso:'2026-10-13',isWorking:false},{iso:'2026-10-14',isWorking:true},{iso:'2026-10-15',isWorking:true}];
assert.equal(policy.previewWeekDenominator(days,'2026-10-14','scheduled_working_days',65),260);assert.equal(policy.previewWeekDenominator(days,'2026-10-14','elapsed_working_days',65),195);
console.log('PASS: scientific clear, manual/history preservation, prospective rule snapshots; unactivated calendar denominator previews');
