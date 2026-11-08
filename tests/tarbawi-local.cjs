const assert = require('node:assert/strict');
const { load, storage } = require('./independent-test-support.cjs');

global.window = {};
global.localStorage = storage();
const calls = [];
const warnings = [];
let rejection = 'تغيّر الفصل النشط';
const deps = {
  '@/lib/mock-data': {},
  '@/lib/auth-session': {
    getToken: () => 'fixture',
    decodeAuthTokenPayload: () => ({ complexId: 1, role: 'teacher', halaqaId: 2 }),
  },
  sonner: { toast: { error: (message, options) => warnings.push({message, ...options}) } },
  './secure-data.functions': {
    async secureSaveTarbawiRecord(token, edit) {
      calls.push({token, edit});
      if (rejection) throw new Error(rejection);
      return {ok:true};
    },
  },
};
const source = 'src/lib/tarbawi-program.ts';

(async () => {
  const tab = load(source, deps);
  const history = {semesterId:'old',halaqaId:2,status:'approved',items:[],updatedAt:'2026-10-20'};
  const initial = {settingsBySemester:{},plans:{'old:2':history}};
  tab.saveTarbawiStore(initial);
  assert.equal(tab.ensureTarbawiSemester('old'), false);
  assert.equal(tab.ensureTarbawiSemester('new'), true);
  assert.deepEqual(tab.loadTarbawiStore(), initial);
  assert.equal(calls.length, 0, 'changing semester must not write to the server');

  const next = tab.saveTarbawiPlan({...history,items:[{id:'local-only'}]});
  await assert.rejects(tab.pushTarbawiStoreCloud(), /تغيّر الفصل النشط/);
  assert.equal(warnings.at(-1).description, rejection);
  const reopened = load(source, deps);
  reopened.saveTarbawiStore(initial); // A refresh may return the prior confirmed value.
  assert.deepEqual(reopened.getTarbawiPlan('old',2), next);
  assert.deepEqual(calls[0].edit.base, history);
  assert.deepEqual(calls[0].edit.next, next);
  rejection = '';
  await reopened.pushTarbawiStoreCloud();
  const confirmedCalls = calls.length;
  await reopened.pushTarbawiStoreCloud();
  assert.equal(calls.length, confirmedCalls, 'confirmed draft should not be retried');
  assert.deepEqual(reopened.getTarbawiPlan('old',2), next);
  console.log('PASS: semester switch preserves local records and rejected drafts survive a reload until confirmed');
})().catch(error => { console.error(error); process.exitCode = 1; });
