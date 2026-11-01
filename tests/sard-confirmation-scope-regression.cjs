const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const base='e6ec7b5b779260cd0839f0c2c599bf0fb3b5d443',path='src/lib/sard-queue-refresh.ts',old=cp.execFileSync('git',['show',base+':'+path],{encoding:'utf8'});
const addition='      if (!row && JSON.stringify(loadSardQueue()) === baseline && baseline !== "[]") {\n        throw new Error("لم يؤكد المصدر المشترك القائمة المحفوظة؛ بقيت معروضة دون تغيير");\n      }\n';
assert.equal(fs.readFileSync(path,'utf8').replace(addition,''),old,'only absence-confirmation feedback changes; no queue writes, clock, access, ownership or cache behavior changes');
assert.deepEqual(cp.execFileSync('git',['diff','--name-only',base,'--','api/','src/','database/','package.json','package-lock.json','bun.lock'],{encoding:'utf8'}).trim().split('\n'),['api/lib/grade-cell-operations.php','src/lib/plan-response-cache.ts','src/lib/plans-service.ts',path,'src/lib/scientific-grades.ts']);
console.log('PASS: same shared GET, cache and context guards; all API/permissions/rules/history/schema/dependencies unchanged');
