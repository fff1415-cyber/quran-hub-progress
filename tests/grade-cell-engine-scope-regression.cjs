const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const base='ca3d341abc3d63e4c4110cef3c65bb51cf4c3c0e',path='api/lib/grade-cell-operations.php';
assert.deepEqual(cp.execFileSync('git',['diff','--name-only',base,'--','api/','src/','database/','package.json','package-lock.json','bun.lock'],{encoding:'utf8'}).trim().split('\n'),[path,'api/lib/grade-plan-operations.php','api/lib/plan-completion-events.php','api/routes/app_state.php','api/routes/plans.php','src/lib/cloud-sync.ts','src/lib/plan-assignment-requests.ts','src/lib/plans-service.ts'],'only separately guarded plan data primitives plus a new unconnected data primitive; all routes, roles, ownership, login and application rules remain literal');
const code=fs.readFileSync(path,'utf8');
assert.doesNotMatch(code,/require_auth\(|plans_require_roles\(|header\(|json_response\(|setcookie\(|\$_(?:GET|POST|REQUEST)|\b(?:CREATE|ALTER|DROP|TRUNCATE)\s+TABLE\b|DELETE\s+FROM|LIMIT\s+500|array_slice\([^,]+,\s*0,\s*500/i);
const proposal=cp.execFileSync('git',['show','0b63be93032aee3d8476a11d1e15f8de6ea74a0e:database/proposed-progress-foundation.sql'],{encoding:'utf8'});
const expected=['grade_cell_versions','grade_operation_receipts'].map(name=>proposal.match(new RegExp('CREATE TABLE IF NOT EXISTS '+name+' \\([\\s\\S]*?;'))[0]).join('\n')+'\n';
assert.equal(fs.readFileSync('tests/fixtures/grade-cell-operations.sql','utf8'),expected,'fixtures use only the two existing held #36 definitions');
console.log('PASS: unconnected grade-cell engine only; no permission, auth, access/tenant rule, old data attribution, score calculation, route or schema changes');

assert.equal(require('./grade-plan-scope-support.cjs').withoutSharedGradePreflight(fs.readFileSync(path,'utf8')),cp.execFileSync('git',['show','d19347b3df30044a7aaf82a4a4dd7e624fe63602:'+path],{encoding:'utf8'}),'accepted grade-cell engine remains exact during atomic composition');
