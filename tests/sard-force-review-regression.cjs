const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const source = fs.readFileSync('src/lib/sard-phased-flow.ts', 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const flow = {};
new Function('require', 'exports', code)(name => {
  if (name !== '@/lib/evaluation-calculator') throw new Error(`Unexpected dependency: ${name}`);
  return {
    emptyReviewSegments: count => Array.from({ length: count }, () => ({ errors: 0, warnings: 0 })),
    computeHifzScore: () => ({}),
    computeReviewScore: () => ({}),
  };
}, flow);

const legacy = { status: 'awaiting_review', scheduledAt: '2999-01-01T00:00:00.000Z' };
const patch = flow.buildForceImmediatePatch(legacy);
assert.equal(patch.status, 'awaiting_review');
assert.ok(Date.parse(patch.scheduledAt) <= Date.now());
assert.equal(patch.reviewSegmentCount, undefined);
assert.equal(patch.reviewErrors, undefined);
assert.equal(flow.isMusammiVisible({ ...legacy, ...patch }), true, 'review becomes visible to the musammi immediately');

const fromScores = flow.buildForceImmediatePatch({ ...legacy, reviewErrors: [2, 1, 0] });
assert.deepEqual(fromScores.reviewErrors, [0, 0, 0]);
assert.deepEqual(fromScores.reviewWarnings, [0, 0, 0]);

const fromCount = flow.buildForceImmediatePatch({ ...legacy, reviewSegmentCount: 2 });
assert.deepEqual(fromCount.reviewErrors, [0, 0]);

const fullSard = flow.buildForceImmediatePatch({ status: 'scheduled' });
assert.equal(fullSard.status, 'pending');

console.log('PASS: immediate review handles legacy requests without segment metadata');
