const assert = require('node:assert/strict');
const fs = require('node:fs');
const cp = require('node:child_process');
const { load, storage } = require('./independent-test-support.cjs');
const deps = {
  '@/lib/auth-session': { hasAuthToken: () => false },
  '@/lib/grade-input-settings': {},
  '@/lib/scientific-grades-program': {},
};
global.window = new EventTarget();
global.localStorage = storage();
global.sessionStorage = storage();
const path = 'src/lib/scientific-grades.ts';
const source = fs.readFileSync(process.argv[2] || path, 'utf8');
const sci = load(path, deps, source);
const base = load(path, deps, cp.execFileSync('git', ['show', '26c16bfe3cea9df88e52ff76c1b2dc827ade2b0e:' + path], { encoding: 'utf8' }));
const config = { visible: true, fields: { hifz: true, attendance: false, rabt: false, muraja: false }, defaultScores: { hifz: '10' } };
const key = 'qshatawi_scientific_grades_v1';
const invalid = [undefined, null, false, 0, 1, 'unknown', ' half ', {}, []];
let writes = 0, events = 0;
const write = localStorage.setItem;
localStorage.setItem = (k, v) => { writes++; write(k, v); };
window.addEventListener(sci.SCIENTIFIC_GRADES_CHANGED_EVENT, () => events++);
const grade = entry => ({ S: { 1: { days: { sun: entry } } } });
function seed(value, overridden = false) {
  const initial = {
    configs: { 1: config },
    data: { 1: { S: { 1: { sun: { ...(value === undefined ? {} : { hifz: value }), unknown: null } }, 9: { sun: { hifz: '8' } } }, T: { 1: { sun: { hifz: '6' } } } } },
    overrides: overridden ? { 1: { S: { 1: { sun: { hifz: true } } } } } : {},
  };
  write(key, JSON.stringify(initial)); writes = 0; events = 0;
  return localStorage.getItem(key);
}
assert.equal(base.resolveScientificScore(config, 'hifz', {}), '10', 'negative control reproduces the missing-field default award');
for (const value of invalid) {
  const entry = { attendance: '', rabt: '', muraja: '', hifz: value };
  if (value === undefined) delete entry.hifz;
  assert.equal(sci.resolveScientificScore(config, 'hifz', entry), '', 'an invalid/missing hifz value is not recorded achievement');
  for (const existing of [undefined, '', '0', '7', '10']) for (const manual of [false, true]) {
    const before = seed(existing, manual);
    sci.syncScientificScoresFromPrepForHalaqa(1, grade(entry), ['S'], config);
    assert.equal(localStorage.getItem(key), before, 'passive mount/cloud refresh must neither create a score nor recalculate/erase a stored one');
    sci.syncScientificScoresFromDayPatch(1, 'S', 1, 'sun', config, { hifz: value }, entry);
    assert.equal(localStorage.getItem(key), before, 'a malformed patch must not erase the manual guard or change prior scores');
    assert.equal(sci.backfillMissingScientificScoresForHalaqa(1, grade(entry), ['S'], config), false);
    assert.equal(localStorage.getItem(key), before, 'missing historical grades are not backfilled from invalid prep');
    assert.equal(writes, 0); assert.equal(events, 0);
  }
}
for (const value of ['half', 'one', 'two']) {
  const entry = { attendance: '', hifz: value, rabt: '', muraja: '' };
  assert.equal(sci.resolveScientificScore(config, 'hifz', entry), base.resolveScientificScore(config, 'hifz', entry));
  seed(undefined);
  sci.syncScientificScoresFromDayPatch(1, 'S', 1, 'sun', config, { hifz: value }, entry);
  assert.equal(sci.loadScientificData(1).S[1].sun.hifz, '10', 'valid quantities retain the configured fixed score, without a new weight');
  assert.equal(writes, 1); assert.equal(events, 1);
  seed('0', true);
  sci.syncScientificScoresFromPrepForHalaqa(1, grade(entry), ['S'], config);
  assert.equal(sci.loadScientificData(1).S[1].sun.hifz, '0', 'manual zero remains assessed and protected');
  assert.equal(writes, 0);
  sci.syncScientificScoresFromDayPatch(1, 'S', 1, 'sun', config, { hifz: value }, entry);
  assert.equal(sci.loadScientificData(1).S[1].sun.hifz, '10', 'a real prep edit still releases its matching override');
  assert.equal(sci.loadScientificData(1).S[9].sun.hifz, '8');
  assert.equal(sci.loadScientificData(1).T[1].sun.hifz, '6');
}
seed('7', true);
sci.syncScientificScoresFromDayPatch(1, 'S', 1, 'sun', config, { hifz: '' }, { attendance: '', hifz: '', rabt: '', muraja: '' });
assert.equal(sci.getScientificDayScore(sci.loadScientificData(1), 'S', 1, 'sun', 'hifz'), '', 'an explicit user clear retains its existing behavior');
seed('0', true);
sci.finalizeTeacherScientificDayScore(1, 'S', 1, 'sun', 'hifz', '0', {}, config);
assert.equal(sci.loadScientificData(1).S[1].sun.hifz, '0', 'blur cannot turn a manual zero into a missing-field default');
seed('7', true);
const previous = localStorage.getItem(key), priorEvents = events;
localStorage.setItem = () => { throw Error('fixture quota'); };
assert.throws(() => sci.syncScientificScoresFromDayPatch(1, 'S', 1, 'sun', config, { hifz: 'one' }, { hifz: 'one' }), /fixture quota/);
assert.equal(localStorage.getItem(key), previous); assert.equal(events, priorEvents);
console.log('PASS: missing/invalid hifz creates no scientific award; all stored scores/zeros/clears/manual guards and unknown fields survive passive refresh; valid quantities, explicit clears and failure behavior remain');
