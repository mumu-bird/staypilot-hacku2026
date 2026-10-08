import {refreshBoundReviewAnalysis} from './review-refresh.ts';
import {attachReviewAnalysis} from './review-analysis-binding.ts';
import type {WorkflowCandidate,ReviewEvidence} from '../shared/live-workflow.ts';
export function xinqiaoReviewSource(candidate:WorkflowCandidate):ReviewEvidence|null{
 if(candidate.key!=='rollinggo:43565'||candidate.hotelId!=='43565'||candidate.name!=='北京新侨饭店'||candidate.address.replace(/\s/g,'')!=='崇文门西大街1号')return null;
 const review:ReviewEvidence={sourceUrl:'https://hk.trip.com/hotels/beijing-hotel-detail-374787/novotel-beijing-xinqiao/review.html',observedAt:'2026-10-04T04:42:55.700Z',score:'',count:0,selection:'Additional source, kept separate from existing platform evidence',binding:{name:candidate.name,address:candidate.address,platformIds:{trip:'374787'}},negative:[],positive:[],openingYear:null,renovationYear:null};
 return review;
}
export function attachXinqiaoAdditionalAnalysis(candidate:WorkflowCandidate,value:unknown):boolean{
 const review=xinqiaoReviewSource(candidate);if(!review)return false;
 if(!attachReviewAnalysis(review,value)||!review.modelAnalysis)return false;
 candidate.additionalReviewAnalyses=[review.modelAnalysis];return true;
}

export async function refreshXinqiaoAdditionalAnalysis(candidate:WorkflowCandidate,deps:Parameters<typeof refreshBoundReviewAnalysis>[1]={}){
 const review=xinqiaoReviewSource(candidate);if(!review)throw new Error('No verified additional source for this candidate');
 const result=await refreshBoundReviewAnalysis(review,deps);
 if(!result.review.modelAnalysis)throw new Error('Missing fresh source analysis');
 candidate.additionalReviewAnalyses=[result.review.modelAnalysis];return result;
}
