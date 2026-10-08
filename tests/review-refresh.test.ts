import {createHash} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {refreshBoundReviewAnalysis} from '../server/review-refresh.ts';
const review=JSON.parse(readFileSync('docs/cases/timewalk-review-evidence-20261008.json','utf8'));
const analysis=JSON.parse(readFileSync('docs/cases/live-review-model-analysis-20261008.json','utf8'));
const capture:any={sourceUrl:analysis.sourceUrl,observedAt:analysis.sourceObservedAt,hotel:analysis.hotel,rating:9.5,ratingMax:10,totalCount:1434,samples:analysis.rows.map((r:any)=>({id:r.id,publishedAt:r.publishedAt,stayMonth:r.stayMonth,rating:r.rating,ratingMax:r.ratingMax,content:'synthetic source text '+r.id})),coverage:'visible_page_only'};
const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
analysis.evidenceHash=hash(JSON.stringify(capture));analysis.rows.forEach((r:any,i:number)=>r.textHash=hash(capture.samples[i].content));
test('fresh review pipeline preserves historical observations and returns separately dated source metadata',async()=>{
 const result=await refreshBoundReviewAnalysis(review,{capture:async()=>capture,analyze:async()=>analysis});assert.equal(result.review.score,review.score);assert.equal(result.metadata.rating,9.5);assert.equal(result.review.modelAnalysis?.sourceObservedAt,capture.observedAt);assert.equal(review.modelAnalysis,undefined);
});
test('unsupported identity, capture conflict or model failure leaves existing evidence unchanged',async()=>{
 const original=JSON.stringify(review);let calls=0;await assert.rejects(refreshBoundReviewAnalysis({...review,sourceUrl:'https://example.com'},{capture:async()=>{calls++;return capture;}}));assert.equal(calls,0);
 await assert.rejects(refreshBoundReviewAnalysis(review,{capture:async()=>({...capture,hotel:{...capture.hotel,id:'other'}})}));
 await assert.rejects(refreshBoundReviewAnalysis(review,{capture:async()=>capture,analyze:async()=>{throw new Error('model unavailable');}}));assert.equal(JSON.stringify(review),original);
});

test('fresh pipeline rejects replayed or mismatched model results from another capture',async()=>{
 for(const mutate of [(v:any)=>v.evidenceHash='0'.repeat(64),(v:any)=>v.sourceObservedAt='2026-10-07T10:00:00Z',(v:any)=>v.rows[0].textHash='0'.repeat(64),(v:any)=>v.rows[0].id='other',(v:any)=>v.rows.pop()]){const wrong=structuredClone(analysis);mutate(wrong);await assert.rejects(refreshBoundReviewAnalysis(review,{capture:async()=>capture,analyze:async()=>wrong}),/fresh/);}
});
