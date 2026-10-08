import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {attachXinqiaoAdditionalAnalysis} from '../server/additional-review-source.ts';
import {recordedCandidates,assessCandidate,defaultWorkflowPolicy} from '../server/live-workflow.ts';
import {buildTradeoffOptions} from '../server/tradeoffs.ts';
test('additional real source preserves primary reviews and participates as separate evidence gaps',()=>{
 const c=structuredClone(recordedCandidates().candidates.find(c=>c.hotelId==='43565')!);const original=JSON.stringify(c.reviews);const a=JSON.parse(readFileSync('docs/cases/xinqiao-public-review-analysis-20261008.json','utf8')).analysis;
 assert.equal(attachXinqiaoAdditionalAnalysis({...c,address:'Another branch'},a),false);assert.equal(attachXinqiaoAdditionalAnalysis(c,a),true);assert.equal(JSON.stringify(c.reviews),original);assert.equal(c.additionalReviewAnalyses?.[0].sourceRating?.score,9.1);
 const d=assessCandidate(c,defaultWorkflowPolicy,a.analyzedAt);assert.ok(d.gaps.some(g=>g.includes('2127627773')));
 const options=buildTradeoffOptions([c],defaultWorkflowPolicy,a.analyzedAt,2);assert.ok(options.length>0);assert.ok(options.every(o=>o.gaps.some(g=>g.includes('2127627773'))));assert.ok(options.every(o=>o.evidence.some(e=>e.sourceUrl===a.sourceUrl)));
});
test('additional source refresh preserves candidate data on service failure and rejects unknown candidates before queries',async()=>{
 const {refreshXinqiaoAdditionalAnalysis}=await import('../server/additional-review-source.ts');
 const c=structuredClone(recordedCandidates().candidates.find(c=>c.hotelId==='43565')!);const original=JSON.stringify(c);let calls=0;
 await assert.rejects(refreshXinqiaoAdditionalAnalysis({...c,hotelId:'999'},{capture:async()=>{calls++;throw new Error('unreachable');}}));assert.equal(calls,0);
 await assert.rejects(refreshXinqiaoAdditionalAnalysis(c,{capture:async()=>{throw new Error('source unavailable');}}),/source unavailable/);assert.equal(JSON.stringify(c),original);
});
test('model-detected unacceptable issues exclude options across platforms; uncertain labels remain evidence gaps',()=>{
 const c=structuredClone(recordedCandidates().candidates.find(c=>c.hotelId==='43565')!);c.reviews=null;
 const a=JSON.parse(readFileSync('docs/cases/xinqiao-public-review-analysis-20261008.json','utf8')).analysis;assert(attachXinqiaoAdditionalAnalysis(c,a));
 const policy={...defaultWorkflowPolicy,unacceptable:['noise' as const]};const d=assessCandidate(c,policy,a.analyzedAt);assert.equal(d.status,'excluded');assert.ok(d.reasons.some(r=>r.includes('2127627773')));
 const options=buildTradeoffOptions([c],policy,a.analyzedAt,2);assert.ok(options.length);assert.ok(options.every(o=>o.status==='blocked'&&o.hardViolations.some(v=>v.includes('noise'))));
 const uncertain=structuredClone(c);uncertain.additionalReviewAnalyses![0].mentions=[];const u=assessCandidate(uncertain,policy,a.analyzedAt);assert.ok(!u.reasons.some(r=>r.includes('模型识别用户不可接受')));assert.ok(u.gaps.some(r=>r.includes('评论语义待核验')));
});
test('tradeoff summaries retain exact observed offer fields without claiming availability',()=>{
 const c=structuredClone(recordedCandidates().candidates.find(c=>c.hotelId==='43565')!);const options=buildTradeoffOptions([c],defaultWorkflowPolicy,c.searchObservedAt,2);assert.ok(options.length);
 for(const o of options){const r=c.rooms.find(r=>r.ratePlanId===o.ratePlanId)!;assert.equal(o.offer?.mealAmount,r.mealAmount);assert.equal(o.offer?.cancelUntil,r.cancelUntil);assert.equal(o.offer?.onRequest,r.onRequest);assert.equal(o.offer?.maxOccupancy,r.maxOccupancy);}
});
