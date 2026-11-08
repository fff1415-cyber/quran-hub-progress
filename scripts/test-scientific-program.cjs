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
console.log('PASS: incomplete or failed preparation earns no points, and existing scores are not rewritten during display sync');
