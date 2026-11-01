const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const {withoutExistingGradeLock}=require('./existing-grade-lock-scope-support.cjs');
const base='ca3d341abc3d63e4c4110cef3c65bb51cf4c3c0e',path='api/routes/app_state.php';
assert.equal(withoutExistingGradeLock(fs.readFileSync(path,'utf8')),cp.execFileSync('git',['show',base+':'+path],{encoding:'utf8'}),'only existing-store lock/optional initialization order changes; reset protection, roles, key/tenant predicates, encoding, errors and full-save behavior stay literal');
assert.equal(cp.execFileSync('git',['diff',base,'--','api/',':!'+path,'src/','database/','package.json','package-lock.json','bun.lock'],{encoding:'utf8'}),'','no permissions, authentication, ownership, plans, grading rules, schema, dependencies or frontend changes');
console.log('PASS: lock an existing grade store before initialization; original policy/records/API guards unchanged, no new format or migration');
