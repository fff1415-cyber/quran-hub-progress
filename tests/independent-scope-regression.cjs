const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),ts=require('typescript');
const base='3511c25308393218a6a9d5db69efaa8011f8cebc';
const original=path=>cp.execFileSync('git',['show',`${base}:${path}`],{encoding:'utf8'});
for(const path of ['api/auth.php','api/tenant.php','api/routes/login.php','api/routes/students.php','api/routes/halaqat.php','api/routes/role_accounts.php','src/lib/auth-session.ts','src/lib/auth-redirect.ts','src/lib/tenant-session.ts','src/lib/tenant.ts','src/lib/permissions.ts','src/lib/teacher-halaqa-access.ts','src/lib/cloud-sync.ts','src/lib/secure-data.functions.ts','src/lib/semester-grading.ts','src/lib/evaluation-calculator.ts','package.json','package-lock.json','bun.lock','.github/workflows/deploy.yml'])assert.equal(fs.readFileSync(path,'utf8'),original(path),path);
assert.equal(cp.execFileSync('git',['diff',base,'--','database'],{encoding:'utf8'}),'','release requires no schema migration');
function functions(code){const sf=ts.createSourceFile('scope.tsx',code,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);return new Map(sf.statements.filter(ts.isFunctionDeclaration).filter(n=>n.name).map(n=>[n.name.text,n.getText(sf)]));}
function phpFunction(code,name){const start=code.indexOf(`function ${name}(`),end=code.indexOf('\nfunction ',start+1);assert.ok(start>=0,name);return code.slice(start,end<0?undefined:end).trim();}
for(const name of ['plans_require_roles','plans_assert_student_in_complex','plans_assert_plan_in_complex','plans_assert_teacher_student_access','handle_patch_assignment','handle_apply_plan_input'])assert.equal(phpFunction(fs.readFileSync('api/routes/plans.php','utf8'),name),phpFunction(original('api/routes/plans.php'),name),name);
const before=phpFunction(original('api/routes/plans.php'),'handle_assign_plan'),after=phpFunction(fs.readFileSync('api/routes/plans.php','utf8'),'handle_assign_plan');
assert.equal(after.slice(0,after.indexOf('    try {')),before.slice(0,before.indexOf('    try {')),'assignment authorization remains literal');
const oldEval=phpFunction(original('api/routes/evaluation_settings.php'),'handle_put_evaluation_settings'),newEval=phpFunction(fs.readFileSync('api/routes/evaluation_settings.php','utf8'),'handle_put_evaluation_settings');
assert.equal(newEval.slice(0,newEval.indexOf('    $tenants =')),oldEval.slice(0,oldEval.indexOf('    $tenants =')),'settings roles and scope remain literal');
for(const name of ['eval_settings_defaults','eval_settings_sanitize'])assert.equal(phpFunction(fs.readFileSync('api/routes/evaluation_settings.php','utf8'),name),phpFunction(original('api/routes/evaluation_settings.php'),name),'no threshold, weight, rounding or retry policy change');
const oldState=phpFunction(original('api/routes/app_state.php'),'handle_set_app_state'),newState=phpFunction(fs.readFileSync('api/routes/app_state.php','utf8'),'handle_set_app_state');
assert.equal(newState.slice(0,newState.indexOf('    $pdo = db();')),oldState.slice(0,oldState.indexOf('    $pdo = db();')),'shared-state authorization preamble remains literal');
for(const [path,allowed] of [
 ['src/lib/mock-data.ts',['persistShared','saveSardQueue','pushSardHistory','saveSardHistory']],
 ['src/lib/plans-service.ts',['assignStudentPlan']],
 ['src/components/role-workspace/RoleSections.tsx',['SecretarySardPanel','SupervisorPlanCompletedPanel','SupervisorApprovalsPanel','SupervisorForceRetryPanel','SupervisorPassedPanel']],
]){const current=functions(fs.readFileSync(path,'utf8'));for(const [name,body] of functions(original(path)))if(!allowed.includes(name))assert.equal(current.get(name),body,`unrelated function changed: ${name}`);}
assert.ok(!fs.readFileSync('src/lib/sard-queue-refresh.ts','utf8').includes('secureSetAppState'),'queue refresh cannot write shared state');
console.log('PASS: F01/F02, ownership, tenancy, grade storage, policy rules, API guards, deploy workflow and dependency files unchanged');
