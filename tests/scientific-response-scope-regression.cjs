const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const {withoutScientificResponseGuard,current}=require('./scientific-response-scope-support.cjs');
const base='1bb0b54c4084877ab58d246fac57ed539f6fb607',path='src/lib/cloud-sync.ts',source=fs.readFileSync(path,'utf8');
assert.equal(source.split(current).length,2);
assert.equal(withoutScientificResponseGuard(source),cp.execFileSync('git',['show',base+':'+path],{encoding:'utf8'}),'only scientific snapshot capture and ACK application change; every other writer, route, session, role, owner, calendar and merge rule remains literal');
assert.equal(cp.execFileSync('git',['diff',base,'--','src/',':!'+path,'api/','database/','package.json','package-lock.json','bun.lock'],{encoding:'utf8'}),'','no schema, API, permissions, persistence format, scientific formula or other component changes');
console.log('PASS: only scientific request snapshot/ACK local-application guard; exact existing transport and business rules');
