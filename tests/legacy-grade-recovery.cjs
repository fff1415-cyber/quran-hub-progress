const assert = require('node:assert/strict');
const { load, storage } = require('./independent-test-support.cjs');
const recovery = load('src/lib/legacy-grade-recovery.ts', {});
const local = storage();
const browser = { ...local, get length() { return local.data.size; }, key: i => [...local.data.keys()][i] ?? null };
const rows = [
  { id: 'S', name: 'Same halaqa', complex_id: 1, halaqa_id: 2 },
  { id: 'T', name: 'Other halaqa', complex_id: 1, halaqa_id: 3 },
  { id: 'U', name: 'Other complex', complex_id: 4, halaqa_id: 2 },
];
const scope = recovery.recoveryStudents(rows, { complexId: 1, halaqaId: 2 });
assert.deepEqual(scope.map(s => s.id), ['S']);
const grade = value => ({ 1: { days: { sun: { hifz: value, attendance: 'present', hifzPlanSegments: [1] } } } });
const previous = JSON.stringify({ S: grade('one'), T: grade('two') });
const latest = JSON.stringify({ S: grade('half') });
browser.setItem(recovery.LEGACY_GRADE_KEY, latest);
browser.setItem(recovery.LEGACY_SEMESTER_KEY, 'term-1');
const archived = {raw: previous, semester: null};
const copies = recovery.legacyGradeCopies(browser, [archived, archived]);
assert.equal(copies.length, 2);
assert.equal(copies[0].raw, latest);
assert.equal(copies[1].raw, previous);
assert.deepEqual(recovery.compareLegacyStudent(copies[1], 'T', scope, {}, null), []);
assert.deepEqual(recovery.compareLegacyStudent(copies[0], 'S', scope, { S: grade('two') }, 'term-1'), [
  { path: '1 / days / sun / hifz', local: 'half', confirmed: 'two' },
]);
const unknown = recovery.compareLegacyStudent(copies[1], 'S', scope, { S: grade('two') }, 'term-1');
assert.equal(unknown[0].confirmed, undefined);
assert.equal(unknown[0].local, 'one');
assert.equal(browser.getItem(recovery.LEGACY_GRADE_KEY), latest);
console.log('PASS: displaced legacy data survives reopen, review is roster scoped, and uncertain semester values are never rebased');
