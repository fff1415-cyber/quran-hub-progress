const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const {withoutCompletionRetry}=require('./completion-retry-scope-support.cjs');
const path='api/lib/plan-completion-events.php',base='38ae8a35cf4d9dea983fee1fc1a480792fefc5d5';
const source=fs.readFileSync(path,'utf8');
assert.equal(withoutCompletionRetry(source),cp.execFileSync('git',['show',base+':'+path],{encoding:'utf8'}),'only bounded owned-transaction contention retry and explicit caller-transaction conflict reporting are added');
assert.doesNotMatch(source,/SET\s+(?:SESSION\s+)?TRANSACTION|innodb_snapshot_isolation|SET\s+GLOBAL/i,'application does not change connection/database isolation settings');
console.log('PASS: only 1020/1205/1213 retries, after rollback, bounded to three owned attempts; caller transactions and unrelated SQL errors cannot be replayed as fragments');
