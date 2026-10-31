const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),ts=require('typescript');
const {load,storage}=require('./independent-test-support.cjs');
global.window=new EventTarget();global.localStorage=storage();global.sessionStorage=storage();
const sci=load('src/lib/scientific-grades.ts',{'@/lib/auth-session':{hasAuthToken:()=>false},'@/lib/grade-input-settings':{},'@/lib/scientific-grades-program':{}},fs.readFileSync(process.argv[2]||'src/lib/scientific-grades.ts','utf8'));
const key='qshatawi_scientific_grades_v1',config={visible:true,fields:{hifz:true,rabt:true},defaultScores:{hifz:'10',rabt:'0'}};
const original={configs:{1:config},data:{1:{S:{1:{sun:{hifz:'7',rabt:'0'}},2:{sun:{hifz:'8'}}}}},overrides:{}};
localStorage.setItem(key,JSON.stringify(original));let events=0,writes=0;const setItem=localStorage.setItem;
localStorage.setItem=(k,v)=>{writes++;setItem(k,v);};
const listener=()=>{events++;const store=sci.loadScientificGradesStore();assert.equal(store.overrides[1].S[1].sun.hifz,true,'the event must observe the override together with the new score');sci.syncScientificScoresFromPrepForHalaqa(1,{S:{1:{days:{sun:{hifz:'one',rabt:'pass'}}}}},['S'],config);};window.addEventListener(sci.SCIENTIFIC_GRADES_CHANGED_EVENT,listener);
sci.setTeacherScientificDayScore(1,'S',1,'sun','hifz',' 0 ');let store=sci.loadScientificGradesStore();assert.equal(writes,1);assert.equal(events,1);assert.equal(store.data[1].S[1].sun.hifz,'0','synchronous reapply cannot replace the manual zero');assert.equal(store.data[1].S[1].sun.rabt,'0');assert.equal(store.data[1].S[2].sun.hifz,'8','other weeks remain unchanged');
sci.setTeacherScientificDayScore(1,'S',1,'sun','hifz','0');assert.equal(writes,1,'same value with existing override needs no second write');
sci.setTeacherScientificDayScore(1,'S',1,'sun','hifz','');assert.equal(writes,2);assert.equal(sci.getScientificDayScore(sci.loadScientificData(1),'S',1,'sun','hifz'),'','temporary manual clear retains its guard during editing');
const previous=localStorage.getItem(key),eventCount=events;localStorage.setItem=()=>{throw Error('fixture quota exceeded');};assert.throws(()=>sci.setTeacherScientificDayScore(1,'S',1,'sun','hifz','5'),/quota exceeded/);assert.equal(localStorage.getItem(key),previous);assert.equal(events,eventCount,'failed persistence cannot publish half of a manual edit');
window.removeEventListener(sci.SCIENTIFIC_GRADES_CHANGED_EVENT,listener);
// No score policy, blur/auto-return, cloud merge or old-score backfill was changed.
const base=cp.execFileSync('git',['show','f583c77ae809bfcf2bf19102d419d33bb4c9ed67:src/lib/scientific-grades.ts'],{encoding:'utf8'});
function rest(code){const sf=ts.createSourceFile('scope.ts',code,ts.ScriptTarget.Latest,true);return sf.statements.filter(n=>!ts.isFunctionDeclaration(n)||n.name?.text!=='setTeacherScientificDayScore').map(n=>n.getText(sf));}
assert.deepEqual(rest(fs.readFileSync('src/lib/scientific-grades.ts','utf8')),rest(base));
console.log('PASS: one atomic manual value+override, reentrant auto-backfill preserves zero/clear, storage failure leaves prior data and other weeks unchanged; existing score policy exact');
