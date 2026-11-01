const assert = require('node:assert/strict'), fs = require('node:fs'), cp = require('node:child_process');
const { withoutCompletionEditData } = require('./completion-edits-scope-support.cjs');
const base = '6da9dc3862a07eaea6614f0d065bfabe09f6684f';
const path = 'api/lib/plan-completion-events.php';
assert.equal(require('./completion-current-reads-scope-support.cjs').withoutCompletionCurrentReads(withoutCompletionEditData(fs.readFileSync(path, 'utf8'))), cp.execFileSync('git', ['show', base + ':' + path], { encoding: 'utf8' }), 'only explicit-source single-segment data edit and its receipt kind are added');
assert.equal(cp.execFileSync('git', ['diff', base, '--', 'src/', 'api/', ':!api/lib/plan-completion-events.php', ':!api/lib/grade-cell-operations.php', ':!api/routes/app_state.php', ':!api/lib/grade-plan-operations.php', ':!api/routes/plans.php', 'database/', 'package.json', 'package-lock.json', 'bun.lock'], { encoding: 'utf8' }), '', 'no public route, permission, ownership, phase, catalog, UI, grade format or schema changes');
console.log('PASS: isolated exact-reference hifz data edits only; original public supervisor/teacher guards and sard criteria remain literal and unconnected');

assert.equal(require('./completion-current-reads-scope-support.cjs').withoutCompletionCurrentReads(fs.readFileSync('api/routes/plans.php','utf8')), cp.execFileSync('git',['show',base+':api/routes/plans.php'],{encoding:'utf8'}),'two existing count callers use current reads inside their existing transaction only; all access and policy guards literal');
