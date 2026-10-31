const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const values = new Map();
global.localStorage = {
  get length() { return values.size; },
  key: i => Array.from(values.keys())[i] ?? null,
  removeItem: key => values.delete(key),
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
};

let localAssignments = 0;
const deps = {
  '@/lib/api-base': { buildRphpUrl: path => `https://example.test${path}` },
  '@/lib/cloud-sync': { getToken: () => 'token' },
  '@/lib/plans-store': { localGetStudentSheet: () => ({ assignment: localAssignments ? { id: 'browser-only' } : null, plan: { title: 'محلية' } }) },
  '@/lib/student-phase-promote': { syncStudentPhaseFromPlan: async () => {} },
  '@/lib/plan-translator': { compensationHifzSegmentTarget: () => 0, compensationHifzTap: () => 'one' },
};
deps['@/lib/plan-response-cache']=require('./independent-test-support.cjs').load('src/lib/plan-response-cache.ts',{'@/lib/cloud-sync':deps['@/lib/cloud-sync'],'@/lib/tenant':{getActiveComplexId:()=>1},'@/lib/mock-data':{hasPendingSardWrites:()=>false}});
Object.assign(deps,{'@/lib/auth-session':{decodeAuthTokenPayload:()=>({role:'supervisor',accountId:'fixture'})},'@/lib/tenant':{getActiveComplexId:()=>1},'@/lib/plan-assignment-requests':require('./independent-test-support.cjs').load('src/lib/plan-assignment-requests.ts',{})});
const service = {};
const code = ts.transpileModule(fs.readFileSync('src/lib/plans-service.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
new Function('require', 'exports', code)(name => {
  if (!(name in deps)) throw Error(`Unexpected dependency: ${name}`);
  return deps[name];
}, service);

const response = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });
const sheet = assignmentId => ({
  assignment: assignmentId ? { id: assignmentId } : null,
  plan: assignmentId ? { id: 'plan', track: 'gold', level_number: 1 } : null,
  segments: [], completions: [],
});

(async () => {
  localAssignments = 1;
  global.fetch = async () => response(503, { error: 'قاعدة البيانات غير متاحة' });
  await assert.rejects(service.assignStudentPlan('student', 'plan', 1, 'supervisor'), /قاعدة البيانات/);
  assert.equal(values.size, 0, 'a failed server request must not create a local confirmation');
  assert.equal(service.unconfirmedLocalPlanLink('student', sheet(null)).assignment.id, 'browser-only');

  global.fetch = async (_url, options) => options?.method === 'POST'
    ? response(200, { ok:true, operation_id:JSON.parse(options.body).operation_id, operation_applied:true, assignment_id:'server-id' })
    : response(200, sheet(null));
  await assert.rejects(service.assignStudentPlan('student', 'plan', 1, 'supervisor'), /تعذّر تأكيد/);

  global.fetch = async (_url, options) => options?.method === 'POST'
    ? response(200, { ok:true, operation_id:JSON.parse(options.body).operation_id, operation_applied:true, assignment_id:'server-id' })
    : response(200, sheet('server-id'));
  await service.assignStudentPlan('student', 'plan', 1, 'supervisor');
  assert.equal(service.unconfirmedLocalPlanLink('student', sheet('server-id')), null);

  global.fetch = async (_url, options) => options?.method === 'POST'
    ? response(200, { ok: true, sard_queue: [{ assignmentId: 'server-id', status: 'plan_completed' }] })
    : response(200, sheet('server-id'));
  await service.updateSupervisorPlanHifz('student', 'server-id', 2, 'complete', '2026-10-21', 7);
  assert.equal(JSON.parse(values.get('qshatawi_sard_queue_v2'))[0].assignmentId, 'server-id');
  console.log('PASS: server-only plan link, read-back confirmation, legacy warning and supervisor hifz queue');
})().catch(error => { console.error(error); process.exitCode = 1; });
