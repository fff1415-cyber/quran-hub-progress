const assert = require('node:assert/strict');
const fs = require('node:fs');
const cp = require('node:child_process');
const base = '7e9adf1d4059f20289f182e31613e18fe2cf0877';
const original = path => cp.execFileSync('git', ['show', `${base}:${path}`], {encoding:'utf8'});
for (const path of ['api/auth.php','api/tenant.php','api/routes/login.php','api/routes/students.php','api/routes/halaqat.php','api/routes/role_accounts.php','src/lib/permissions.ts','src/lib/auth-session.ts','src/lib/auth-redirect.ts','src/lib/tenant-session.ts','src/lib/teacher-halaqa-access.ts']) {
  assert.equal(fs.readFileSync(path,'utf8'), original(path), `excluded file changed: ${path}`);
}
const functions = ['plans_require_roles','plans_assert_student_in_complex','plans_assert_plan_in_complex','plans_assert_teacher_student_access'];
function extract(source,name) {
  const a=source.indexOf(`function ${name}(`); assert.ok(a>=0,name);
  const b=source.indexOf('\nfunction ',a+1); return source.slice(a,b<0?undefined:b).trim();
}
for(const name of functions) assert.equal(extract(fs.readFileSync('api/routes/plans.php','utf8'),name),extract(original('api/routes/plans.php'),name),name);
for (const name of ['handle_assign_plan','handle_import_plans','handle_patch_assignment','handle_apply_plan_input','handle_remove_plan_completions','handle_supervisor_plan_hifz']) {
  const before=extract(original('api/routes/plans.php'),name), after=extract(fs.readFileSync('api/routes/plans.php','utf8'),name);
  const guards = code => code.split('\n').filter(l=>/require_auth\(|require_complex_id\(|plans_require_roles\(|plans_assert_student_in_complex\(|plans_assert_plan_in_complex\(|plans_assert_teacher_student_access\(|\$auth\['role'\].*supervisor/.test(l)).map(l=>l.trim());
  assert.deepEqual(guards(after),guards(before),`authorization changed: ${name}`);
}
console.log('PASS: F01/F02 protected files and existing plan authorization checks unchanged');
for(const [path,name,until] of [
 ['api/routes/app_state.php','handle_set_app_state','    $pdo = db();'],
 ['api/routes/weekly_tests.php','handle_patch_weekly_test','    $pdo->beginTransaction();']
]) {
 const before=extract(original(path),name),after=extract(fs.readFileSync(path,'utf8'),name);
 assert.equal(after.slice(0,after.indexOf(until)),before.slice(0,before.indexOf(until)),`existing authorization preamble changed: ${name}`);
}
for(const path of ['package.json','package-lock.json']) assert.equal(fs.readFileSync(path,'utf8'),original(path),'dependency files unchanged');

for(const [path,name,marker] of [
 ['api/routes/kiosk.php','handle_kiosk_check_in','    $grades = kiosk_load_grades'],
 ['api/routes/evaluation_settings.php','handle_put_evaluation_settings','    $tenants = eval_settings_tenant_enabled'],
]){const before=extract(original(path),name),after=extract(fs.readFileSync(path,'utf8'),name);assert.equal(after.slice(0,after.indexOf(marker)),before.slice(0,before.indexOf(marker)),`authorization changed: ${name}`);}

assert.doesNotMatch(fs.readFileSync('src/lib/mock-data.ts','utf8'), /captureSharedEdit\(["']notifications/, 'F03 cannot publish recipient data through the unscoped endpoint');
assert.doesNotMatch(fs.readFileSync('src/lib/shared-refresh.ts','utf8'), /case ["']notifications/, 'F03 cannot pull recipient data through the unscoped endpoint');
