import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {attachReviewAnalysis} from '../server/review-analysis-binding.ts';
import {assessCandidate,recordedCandidates,defaultWorkflowPolicy} from '../server/live-workflow.ts';
import type {ReviewEvidence} from '../shared/live-workflow.ts';
test('saved real analysis binds to source and provider identity, retains old observations and surfaces uncertainty',()=>{
 const review=JSON.parse(readFileSync('docs/cases/timewalk-review-evidence-20261008.json','utf8')) as ReviewEvidence;
 const value=JSON.parse(readFileSync('docs/cases/live-review-model-analysis-20261008.json','utf8'));
 const old=JSON.stringify(review);assert.equal(attachReviewAnalysis(review,{...value,hotel:{id:'wrong'}}),false);assert.equal(JSON.stringify(review),old);
 assert.equal(attachReviewAnalysis(review,{...value,sourceUrl:'https://example.com'}),false);
 assert.equal(attachReviewAnalysis(review,value),true);assert.equal(review.observedAt,JSON.parse(old).observedAt);assert.equal(review.score,'9.4');assert.equal(review.modelAnalysis?.sampleCount,15);
 const candidate=structuredClone(recordedCandidates().candidates[0]);candidate.reviews=review;const result=assessCandidate(candidate,structuredClone(defaultWorkflowPolicy),value.analyzedAt);assert.ok(result.gaps.some(g=>g.includes('评论语义待核验')));assert.equal(result.bookable,false);
});
test('analysis binding rejects contradictory labels, duplicate IDs and impossible source dates without mutating evidence',()=>{
 const source=JSON.parse(readFileSync('docs/cases/timewalk-review-evidence-20261008.json','utf8'));
 const analysis=JSON.parse(readFileSync('docs/cases/live-review-model-analysis-20261008.json','utf8'));
 for(const mutate of [(v:any)=>v.rows.push(v.rows[0]),(v:any)=>v.rows[0].publishedAt='2026-02-30',(v:any)=>v.rows[0].publishedAt='2027-01-01',(v:any)=>v.rows[0].issues=['noise'],(v:any)=>v.rows[0].probabilities.noise=2]){const v=structuredClone(analysis);mutate(v);const r=structuredClone(source);assert.equal(attachReviewAnalysis(r,v),false);assert.deepEqual(r,source);}
 const valid=structuredClone(analysis);valid.rows[0].probabilities.noise=.9;valid.rows[0].issues=['noise'];valid.rows[0].uncertain=valid.rows[0].uncertain.filter((i:string)=>i!=='noise');
 assert.equal(attachReviewAnalysis(source,valid),true);assert.equal(source.modelAnalysis.mentions[0].issues[0],'noise');
});
test('new page rating is preserved separately; invalid scale is rejected',()=>{
 const review=JSON.parse(readFileSync('docs/cases/timewalk-review-evidence-20261008.json','utf8'));
 const value=JSON.parse(readFileSync('docs/cases/live-review-model-analysis-20261008.json','utf8'));
 assert.equal(attachReviewAnalysis(review,{...value,sourceRating:{score:11,scale:10,totalCount:1434}}),false);
 assert.equal(attachReviewAnalysis(review,{...value,sourceRating:{score:9.5,scale:10,totalCount:1434}}),true);
 assert.equal(review.score,'9.4');assert.equal(review.modelAnalysis.sourceRating.score,9.5);
});
