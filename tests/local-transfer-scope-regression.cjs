const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const base='36548eb993b4a3dc8d075371749d18f584685325',old=p=>cp.execFileSync('git',['show',base+':'+p],{encoding:'utf8'});
assert.equal(cp.execFileSync('git',['diff',base,'--','api/','database/','package.json','package-lock.json'],{encoding:'utf8'}),'','local transfer batch cannot change backend/schema/dependencies');
for(const path of ['src/lib/permissions.ts','src/lib/auth-session.ts','src/lib/session-role.ts','src/lib/tenant.ts','src/lib/teacher-halaqa-access.ts','src/components/role-workspace/RoleSections.tsx','src/components/role-workspace/SupervisorPanels.tsx'])assert.equal(fs.readFileSync(path,'utf8'),old(path),path);
const service=fs.readFileSync('src/lib/transfer-actions.ts','utf8');assert.doesNotMatch(service,/\b(fetch|localStorage|secureSet|secureList|require_auth|getToken|setToken|persistShared)\b/,'transfer helpers must use the existing local store only');
console.log('PASS: local transfer batch preserves routing filters, roles, visibility, student ownership and backend byte-for-byte; no shared recipient delivery enabled');
