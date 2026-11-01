const assert = require('node:assert/strict'), fs = require('node:fs'), cp = require('node:child_process');
const { withoutCompletionEditData } = require('./completion-edits-scope-support.cjs');
const base = '6da9dc3862a07eaea6614f0d065bfabe09f6684f';
const path = 'api/lib/plan-completion-events.php';
assert.equal(withoutCompletionEditData(fs.readFileSync(path, 'utf8')), cp.execFileSync('git', ['show', base + ':' + path], { encoding: 'utf8' }), 'only explicit-source single-segment data edit and its receipt kind are added');
assert.equal(cp.execFileSync('git', ['diff', base, '--', 'src/', 'api/', ':!api/lib/plan-completion-events.php', 'database/', 'package.json', 'package-lock.json', 'bun.lock'], { encoding: 'utf8' }), '', 'no public route, permission, ownership, phase, catalog, UI, grade format or schema changes');
console.log('PASS: isolated exact-reference hifz data edits only; original public supervisor/teacher guards and sard criteria remain literal and unconnected');
