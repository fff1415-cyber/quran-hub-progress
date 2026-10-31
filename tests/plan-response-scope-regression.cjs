const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const {withoutPlanResponseClient}=require('./plan-response-scope-support.cjs');
const base='fa1cec6a55d4de88bf9eced6c17344987303f509',path='src/lib/plans-service.ts',old=cp.execFileSync('git',['show',base+':'+path],{encoding:'utf8'});
assert.equal(withoutPlanResponseClient(fs.readFileSync(path,'utf8')),old,'only response/context/cache fences; all requests, phase/grade rules, assignment identities and other client methods stay exact');
assert.deepEqual(cp.execFileSync('git',['diff','--name-only',base,'--','api/','src/','database/','package.json','package-lock.json','bun.lock'],{encoding:'utf8'}).trim().split('\n'),['src/lib/plan-response-cache.ts',path]);
const helper=fs.readFileSync('src/lib/plan-response-cache.ts','utf8');assert.doesNotMatch(helper,/setToken|setAuthItem|clearAuth|secureSet|pushNotification|saveGrades|saveStudents|fetch\(/,'response guard cannot acquire any permission, API write or side effect');
console.log('PASS: original request/authorization/transition/scoring paths unchanged; only late-response cache protection and session-context checks');
