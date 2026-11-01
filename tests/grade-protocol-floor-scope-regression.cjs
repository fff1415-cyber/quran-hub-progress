const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const {withoutGradeProtocolFloor,guard}=require('./grade-protocol-floor-scope-support.cjs');
const base='c805c5dad15dc12552751580f9eeae9fbc614f66',path='api/routes/app_state.php',source=fs.readFileSync(path,'utf8');
assert.equal(source.split(guard).length,2);
assert.equal(withoutGradeProtocolFloor(source),cp.execFileSync('git',['show',base+':'+path],{encoding:'utf8'}),'only unsupported explicitly versioned grade packets are rejected; all original auth, roles, ownership, current client saves, key predicates, lock/reset guards and GET behavior remain literal');
assert.equal(cp.execFileSync('git',['diff',base,'--','api/',':!'+path,'src/',':!src/lib/cloud-sync.ts','database/','package.json','package-lock.json','bun.lock'],{encoding:'utf8'}),'','no new route, permission, grade format, schema, dependency, client or grading rule changes');
console.log('PASS: explicit unsupported grade transport cannot reach legacy snapshot storage; unchanged current-client and permission behavior');
