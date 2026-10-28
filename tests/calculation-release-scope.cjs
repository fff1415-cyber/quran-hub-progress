const assert = require('node:assert/strict');
const fs = require('node:fs');
const cp = require('node:child_process');
const ts = require('typescript');
const base = '7e9adf1d4059f20289f182e31613e18fe2cf0877';
const original = path => cp.execFileSync('git', ['show', `${base}:${path}`], {encoding:'utf8'});
assert.equal(cp.execFileSync('git',['diff',base,'--','api','database'],{encoding:'utf8'}),'','release must not deploy a schema or API change');
for(const path of ['package.json','package-lock.json','bun.lock','src/lib/permissions.ts','src/lib/auth-session.ts','src/lib/auth-redirect.ts','src/lib/tenant-session.ts','src/lib/teacher-halaqa-access.ts','src/lib/cloud-sync.ts','src/lib/plans-service.ts']) assert.equal(fs.readFileSync(path,'utf8'),original(path),path);
function statements(code,allowed) {
 const sf=ts.createSourceFile('release.ts',code,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 return sf.statements.filter(n=>!(ts.isFunctionDeclaration(n)&&allowed.includes(n.name?.text))).map(n=>n.getText(sf));
}
for(const [path,allowed] of [
 ['src/lib/mock-data.ts',['isHifzChecked','dayScore','studentStats']],
 ['src/lib/scientific-grades.ts',['scientificPeriodAssessmentCount']],
]) assert.deepEqual(statements(fs.readFileSync(path,'utf8'),allowed),statements(original(path),allowed),`persisted state and other behavior changed: ${path}`);
const workflow=fs.readFileSync('.github/workflows/deploy.yml','utf8');
assert.match(workflow,/Determine whether API files changed/);
assert.match(workflow,/Back up existing frontend before upload/);
for(const name of ['Sync frontend (SFTP primary)','Sync m1 subdomain frontend (SFTP)','Sync m2 subdomain frontend (SFTP)']) {
 const start=workflow.indexOf('      - name: '+name),end=workflow.indexOf('\n      - name:',start+1);
 assert.ok(start>=0,name);
 assert.match(workflow.slice(start,end<0?undefined:end),/rsyncArgs: "--recursive"/,'SFTP filtering must expand package contents instead of nesting client/');
}
assert.doesNotMatch(fs.readFileSync('scripts/deploy-hostinger-ci.sh','utf8'),/--delete/);
assert.doesNotMatch(fs.readFileSync('scripts/deploy-hostinger-api-ci.sh','utf8'),/--delete/);
console.log('PASS: calculation-only release preserves API/schema, auth, all storage declarations, weights and dependency files');
