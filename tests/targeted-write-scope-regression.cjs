const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),ts=require('typescript');
const base='f583c77ae809bfcf2bf19102d419d33bb4c9ed67',original=p=>cp.execFileSync('git',['show',base+':'+p],{encoding:'utf8'});
const plans=fs.readFileSync('api/routes/plans.php','utf8');
function omitQuota(s){const start=s.indexOf('function handle_patch_assignment_quotas(): void'),end=s.indexOf('\nfunction handle_patch_assignment(): void',start);assert.ok(start>0&&end>start);return s.slice(0,start)+s.slice(end);}
assert.equal(omitQuota(plans),omitQuota(original('api/routes/plans.php')),'other plan writes, completion rules, role and ownership guards remain exact');
assert.equal(fs.readFileSync('api/routes/app_state.php','utf8'),original('api/routes/app_state.php'),'grade metadata and all shared-state write handlers remain exact');
for(const path of ['src/routes/teacher.tsx','src/lib/cloud-sync.ts','src/lib/mock-data.ts','src/lib/permissions.ts','src/lib/auth-session.ts','src/lib/teacher-halaqa-access.ts'])assert.equal(fs.readFileSync(path,'utf8'),original(path),path);
assert.equal(cp.execFileSync('git',['diff',base,'--','database/','package.json','package-lock.json','api/auth.php','api/tenant.php','api/routes/login.php','api/routes/students.php'],{encoding:'utf8'}),'','no schema, dependency, authentication or student-scope changes');
function rest(code){const sf=ts.createSourceFile('scope.ts',code,ts.ScriptTarget.Latest,true);return sf.statements.filter(n=>!ts.isFunctionDeclaration(n)||n.name?.text!=='patchAssignmentFaceQuotas').map(n=>n.getText(sf));}
assert.deepEqual(rest(fs.readFileSync('src/lib/plans-service.ts','utf8')),rest(original('src/lib/plans-service.ts')),'only quota request/ack service changes');
console.log('PASS: exact quota target and manual local write only; other workflows, history, score policy, authentication and tenant boundaries unchanged');
