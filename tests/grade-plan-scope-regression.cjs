const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const {withoutSharedGradePreflight}=require('./grade-plan-scope-support.cjs');
const base='b431b6a74d76eee83d3f9205834a0afc15181e81',path='api/lib/grade-plan-operations.php';
assert.equal(cp.execFileSync('git',['diff',base,'--','api/',':!api/lib/grade-cell-operations.php', ':!api/routes/app_state.php',':!'+path,'src/','database/','package.json','package-lock.json','bun.lock'],{encoding:'utf8'}),'','all existing public routes, original authorization, plan writers and client flows remain exact');
assert.equal(withoutSharedGradePreflight(fs.readFileSync('api/lib/grade-cell-operations.php','utf8')),cp.execFileSync('git',['show','d19347b3df30044a7aaf82a4a4dd7e624fe63602:api/lib/grade-cell-operations.php'],{encoding:'utf8'}),'the accepted grade engine changes only by sharing its exact base/stamp validator');
const code=fs.readFileSync(path,'utf8');assert.doesNotMatch(code,/require_auth\(|plans_require_roles\(|header\(|json_response\(|\$_(?:GET|POST|REQUEST)|\b(?:CREATE|ALTER|DROP|TRUNCATE)\s+TABLE\b|DELETE\s+FROM|pushNotification|UPDATE\s+students|academic_records/i);
assert.match(code,/\['','half','one','two'\]/);assert.match(code,/grade_plan_suboperation/);
console.log('PASS: dated hifz data coordination only; no phase/profile effect, broader permission, business-rule recalculation, public route or production schema change');

assert.equal(require('./existing-grade-lock-scope-support.cjs').withoutExistingGradeLock(fs.readFileSync('api/routes/app_state.php','utf8')),cp.execFileSync('git',['show',base+':api/routes/app_state.php'],{encoding:'utf8'}),'only the separately accepted existing-store lock fix changes legacy app_state; all public role/value/reset checks remain literal');
