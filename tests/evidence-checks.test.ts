import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizedReviewRating} from '../shared/evidence-checks.ts';
import {recordedCandidates} from '../server/live-workflow.ts';
test('rating normalization rejects empty, out-of-scale and invalid values rather than inventing a rating',()=>{
 const review=recordedCandidates().candidates[0].reviews!;
 assert.equal(normalizedReviewRating({...review,score:'9.4',scoreMax:10}),4.7);
 for(const score of ['', ' ', '-1','11','not-rated'])assert.equal(normalizedReviewRating({...review,score,scoreMax:10}),null);
 assert.equal(normalizedReviewRating({...review,score:'4',scoreMax:0}),null);
 assert.equal(normalizedReviewRating({...review,score:'4',scoreMax:undefined}),null);
});
test('rating rules use a newer bound page observation while preserving old rating records',()=>{
 const old=recordedCandidates().candidates[0].reviews!;
 const newer={...old,score:'9.4',scoreMax:10,observedAt:'2026-10-08T08:58:00Z',modelAnalysis:{model:'jev-test',sourceUrl:old.sourceUrl,sourceObservedAt:'2026-10-08T10:25:00Z',analyzedAt:'2026-10-08T10:26:00Z',evidenceHash:'a'.repeat(64),sampleCount:15,coverage:'visible_page_only' as const,uncertain:[],sourceRating:{score:9.5,scale:10,totalCount:1434}}};
 assert.equal(normalizedReviewRating(newer),4.75);assert.equal(newer.score,'9.4');
 assert.equal(normalizedReviewRating({...newer,modelAnalysis:{...newer.modelAnalysis,sourceObservedAt:'2026-10-07T10:25:00Z'}}),4.7);
 assert.equal(normalizedReviewRating({...newer,modelAnalysis:{...newer.modelAnalysis,sourceRating:{score:11,scale:10,totalCount:1434}}}),null);
});
