const assert=require('node:assert/strict'),cp=require('node:child_process');
const {load}=require('./independent-test-support.cjs');
const out=cp.execFileSync('php',['tests/backend-retry-setting-compat.php'],{encoding:'utf8'});process.stdout.write(out);
const settings=JSON.parse(out.trim().split('\n').at(-1).slice('FIXTURES:'.length));
const types=load('src/lib/evaluation-types.ts',{}),calc=load('src/lib/evaluation-calculator.ts',{'@/lib/evaluation-types':types}),flow=load('src/lib/sard-phased-flow.ts',{'@/lib/evaluation-calculator':calc}),snapshots=load('src/lib/evaluation-rules-snapshot.ts',{'@/lib/evaluation-types':types});
const now=Date.now,clock=Date.parse('2026-11-02T10:00:00Z');Date.now=()=>clock;
try{for(const cfg of settings){const pinned=snapshots.snapshotEvaluationRules(cfg),patch=flow.buildReviewOnlyPatch({id:'fixture'},45,0,0,3,cfg.retry_delay_days,pinned);assert.equal(new Date(patch.scheduledAt).getTime(),clock+cfg.retry_delay_days*86400000);assert.equal(patch.lockedHifzScore,45);assert.equal(patch.evaluationRules.settings.retry_delay_days,cfg.retry_delay_days);assert.equal(new Date(flow.scheduleRetry(cfg.retry_delay_days)).getTime(),clock+cfg.retry_delay_days*86400000);}}finally{Date.now=now;}
console.log('PASS: loaded settings preserve original retry scheduling and deferred review rule snapshots (2/7 days), no score-policy change');
