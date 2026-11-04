const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const {withoutCompletionCurrentReads,pairs}=require('./completion-current-reads-scope-support.cjs');
const base='9f49a04fd368e4c832f4fe5f0220d19974557276';
const paths=['api/lib/plan-completion-events.php','api/routes/plans.php'];
const sources=paths.map(p=>fs.readFileSync(p,'utf8'));
for(const [from] of pairs)assert.equal(sources.join('\n').split(from).length,2,'every exact current-read guard is present once');
for(let i=0;i<paths.length;i++)assert.equal(withoutCompletionCurrentReads(sources[i]),cp.execFileSync('git',['show',base+':'+paths[i]],{encoding:'utf8'}),'only explicit FOR UPDATE source reads/signatures change after the failed native concurrency gate');
console.log('PASS: writer source reads and two transactional completion counts are current; display reads, transaction boundaries, roles, isolation configuration and rules remain unchanged');
