const assert=require('node:assert/strict');
const crypto=require('node:crypto');
(async()=>{
 const {createLegacyReviewManifest,verifyLegacyReviewManifest}=await import('../scripts/legacy-review-manifest.mjs');
 const records=Array.from({length:7737},(_,i)=>({id:'synthetic-'+i,student_id:'private-fixture-value',assignment_id:null,score:i%2===0?0:null,original:{notRecovered:true}}));
 const raw=Buffer.from(JSON.stringify(records));const original=crypto.createHash('sha256').update(raw).digest('hex');
 const manifest=createLegacyReviewManifest(raw,'segment_completions');
 assert.equal(manifest.rowCount,7737);assert.equal(manifest.records.length,7737);assert.equal(manifest.sourceSha256,original);
 assert.ok(manifest.records.every((record,index)=>record.ordinal===index&&record.state==='unresolved'));
 assert.ok(!JSON.stringify(manifest).includes('private-fixture-value'),'inventory metadata contains no student identifiers');
 assert.equal(verifyLegacyReviewManifest(raw,manifest),true);
 const changed=structuredClone(records);changed[0].score=null;
 assert.equal(verifyLegacyReviewManifest(Buffer.from(JSON.stringify(changed)),manifest),false);
 const truncated=structuredClone(manifest);truncated.records.pop();assert.equal(verifyLegacyReviewManifest(raw,truncated),false);
 const approved=structuredClone(manifest);approved.records[0].state='approved';assert.equal(verifyLegacyReviewManifest(raw,approved),false,'approval decisions must be separate from the immutable inventory');
 const duplicates=createLegacyReviewManifest(Buffer.from('[{"score":0},{"score":0}]'),'grades');assert.equal(duplicates.rowCount,2);assert.notEqual(duplicates.records[0].ordinal,duplicates.records[1].ordinal);
 for(const kind of ['grades','weekly_tests','scientific_grades']){
  const snapshot=Buffer.from(JSON.stringify([{value:'{"1":{"sun":{"hifz":0}}}',semester_id:null}]));
  const report=createLegacyReviewManifest(snapshot,kind);assert.equal(verifyLegacyReviewManifest(snapshot,report),true);assert.equal(report.records[0].state,'unresolved');
 }
 assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),original,'source bytes remain intact');
 console.log('PASS: 7,737 synthetic records retained, zero/null and duplicates preserved, tampering rejected, no guessed bindings');
})().catch(error=>{console.error(error);process.exitCode=1;});
