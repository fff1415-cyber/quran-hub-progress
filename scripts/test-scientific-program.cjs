const assert = require('node:assert/strict');
const {load, storage} = require('../candidate/tests/independent-test-support.cjs');
const fixture = storage();
global.localStorage = fixture;
global.window = {dispatchEvent() {}};
global.sessionStorage = storage();
const lib = load('src/lib/scientific-grades.ts', {
  '@/lib/auth-session': {hasAuthToken: () => false},
  '@/lib/grade-input-settings': {ATTENDANCE_OPTION_LABELS: {}},
  '@/lib/scientific-grades-program': {ensureScientificHalaqaProgram() {}, removeScientificHalaqaProgram() {}},
});
const config = {visible:true,fields:{attendance:false,hifz:true,rabt:true,muraja:true},
  defaultScores:{hifz:'11',rabt:'7',muraja:'5'}};
for (const field of ['hifz','rabt','muraja']) {
  for (const value of [undefined,null,'','fail','unexpected']) {
    assert.equal(lib.resolveScientificScore(config,field,{[field]:value}),'');
  }
}
assert.equal(lib.resolveScientificScore(config,'hifz',{hifz:'half'}),'11');
assert.equal(lib.resolveScientificScore(config,'rabt',{rabt:'pass'}),'7');
assert.equal(lib.resolveScientificScore(config,'muraja',{muraja:'pass'}),'5');
lib.saveScientificGradesStore({configs:{1:config},data:{1:{prior:{1:{sun:{hifz:'20'}}}}},overrides:{}});
lib.syncScientificScoresFromPrepForHalaqa(1,{
  prior:{1:{days:{sun:{attendance:'present'}}}},
  new:{1:{days:{sun:{attendance:'present',rabt:'fail'},mon:{hifz:'one',rabt:'pass',muraja:'pass'}}}},
},['prior','new'],config);
assert.equal(lib.loadScientificData(1).prior[1].sun.hifz,'20');
assert.equal(lib.loadScientificData(1).new[1].sun,undefined);
assert.deepEqual(lib.loadScientificData(1).new[1].mon,{hifz:'11',rabt:'7',muraja:'5'});
const allFields = ['attendance','hifz','rabt','muraja'];
const active = {fixture:{1:{mon:{attendance:'9',hifz:'11',rabt:'7',muraja:'5'}}}};
const cleared = {fixture:{1:{mon:{attendance:'',hifz:'11',rabt:'',muraja:'5'}}}};
assert.equal(lib.studentScientificWeekTotals(active,'fixture',1,allFields).total,32);
assert.equal(lib.studentScientificWeekTotals(cleared,'fixture',1,allFields).total,16);
const noStandard = () => ({ earned:0, maxPossible:0, filledSlots:0 });
const combined = load('src/lib/halaqa-program-combined-totals.ts',{
  '@/lib/scientific-grades':lib,
  '@/lib/halaqa-programs':{studentAllProgramsWeekTotals:noStandard},
});
const totalsConfig = {...config,fields:{...config.fields,attendance:true},
  defaultScores:{...config.defaultScores,attendance:{present:'9'}}};
assert.equal(combined.buildCombinedProgramTotals([],{},'fixture',[1],active,allFields,['mon'],totalsConfig).percent,100);
assert.equal(combined.buildCombinedProgramTotals([],{},'fixture',[1],cleared,allFields,['mon'],totalsConfig).percent,50);
console.log('PASS: incomplete or failed preparation earns no points, and existing scores are not rewritten during display sync');
