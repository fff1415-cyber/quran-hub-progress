const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const source = fs.readFileSync('src/lib/plan-level-ranges.ts', 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const ranges = {};
new Function('require', 'exports', code)(name => {
  if (name !== '@/lib/plan-excel-import') throw new Error(`Unexpected dependency: ${name}`);
  return { planLevelNumber: (tier, phase) =>
    (['التأهيل', 'النجباء', 'الفرسان', 'الحفاظ', 'الخريجين'].indexOf(tier) + 1) * 1000 + phase };
}, ranges);

const plan = (id, track, level_number) => ({ id, track, level_number });
const silver = [
  plan('s18', 'silver', 2018), plan('s19', 'silver', 2019),
  plan('s20', 'silver', 2020), plan('s20b', 'silver', 3020),
  plan('s21', 'silver', 3021), plan('s26', 'silver', 3026),
  plan('s27', 'silver', 3027), plan('s32', 'silver', 3032),
  plan('s33a', 'silver', 3033), plan('s33b', 'silver', 4033),
  plan('s42a', 'silver', 4042), plan('s42b', 'silver', 5042),
];

assert.equal(ranges.globalPhaseFromPlanLevel('silver', 2018), 18);
assert.equal(ranges.legacyGlobalPhaseFromPlanLevel('silver', 2018), 26);
assert.equal(ranges.planLevelFromGlobalPhase('silver', 27), 3027);
assert.equal(ranges.findPlanByGlobalPhase(silver, 'silver', 27)?.id, 's27');
assert.equal(ranges.findPlanByGlobalPhase(silver, 'silver', 33)?.id, 's33a');
assert.equal(ranges.findPlanByGlobalPhase(silver, 'silver', 33, 'الحفاظ')?.id, 's33b');
assert.equal(ranges.validateLevelAndPhase('silver', 'الفرسان', 20).ok, true);
assert.equal(ranges.validateLevelAndPhase('silver', 'الفرسان', 33).ok, true);
assert.equal(ranges.validateLevelAndPhase('silver', 'الحفاظ', 33).ok, true);
assert.equal(ranges.validateLevelAndPhase('silver', 'الخريجين', 42).ok, true);
assert.equal(ranges.validateLevelAndPhase('silver', 'الخريجين', 43).ok, true);
assert.equal(ranges.followingPlan(silver, silver[0], 26)?.plan.id, 's27', 'existing student keeps the old sheet and advances from profile phase 26');
assert.equal(ranges.followingPlan(silver, silver[5], 26)?.plan.id, 's27', 'newly linked phase 26 advances normally');
assert.equal(ranges.followingPlan(silver, silver[2], 20)?.plan.id, 's20b');
assert.equal(ranges.followingPlan(silver, silver[3], 20)?.plan.id, 's21');
assert.equal(ranges.followingPlan(silver, silver[7], 32)?.plan.id, 's33a');
assert.equal(ranges.followingPlan(silver, silver[8], 33)?.plan.id, 's33b');
assert.equal(ranges.followingPlan(silver, silver[10], 42)?.plan.id, 's42b');
assert.equal(ranges.followingPlan(silver.filter(p => p.id !== 's27'), silver[5], 26), null, 'missing immediate phase cannot be skipped');

const gold = [plan('g4', 'gold', 1004), plan('g5', 'gold', 2005)];
assert.equal(ranges.followingPlan(gold, gold[0], 4)?.plan.id, 'g5');
const tierLocal = [plan('old-1', 'silver', 2001), plan('old-9', 'silver', 2009), plan('old-10', 'silver', 2010)];
assert.equal(ranges.globalPhaseFromPlanLevel('silver', 2009, tierLocal), 17);
assert.equal(ranges.findPlanByGlobalPhase(tierLocal, 'silver', 17)?.id, 'old-9');
assert.equal(ranges.followingPlan(tierLocal, tierLocal[1])?.plan.id, 'old-10');

const syllabus = (track, tiers) => tiers.flatMap(([slot, first, last]) =>
  Array.from({ length: last - first + 1 }, (_, i) => {
    const phase = first + i;
    return plan(`${track}-${slot}-${phase}`, track, slot * 1000 + phase);
  }));
const allSilver = syllabus('silver', [[1, 1, 8], [2, 9, 20], [3, 20, 33], [4, 33, 42], [5, 42, 60]]);
const allGold = syllabus('gold', [[1, 1, 4], [2, 5, 10], [3, 11, 16], [4, 17, 22], [5, 23, 30]]);
assert.equal(allSilver.length, 63);
assert.equal(allGold.length, 30);
for (const catalog of [allSilver, allGold]) {
  for (let i = 0; i < catalog.length - 1; i++) {
    assert.equal(ranges.followingPlan(catalog, catalog[i])?.plan.id, catalog[i + 1].id,
      `${catalog[i].id} must lead to the next imported plan`);
  }
}
console.log('PASS: imported phase numbering, existing students, split boundaries and missing-plan guard');
