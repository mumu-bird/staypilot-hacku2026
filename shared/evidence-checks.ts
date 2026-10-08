import type {ReviewEvidence,WorkflowCandidate} from './live-workflow.ts';
export function effectiveReviewRating(review:ReviewEvidence|null):{score:number;scale:number;observedAt:string;source:'page_observation'|'curated_record'}|null{
 if(!review)return null;
 const current=review.modelAnalysis?.sourceRating;
 const currentTime=Date.parse(review.modelAnalysis?.sourceObservedAt??''),oldTime=Date.parse(review.observedAt);
 if(current&&Number.isFinite(currentTime)&&Number.isFinite(oldTime)&&currentTime>=oldTime){
  if(!Number.isFinite(current.score)||!Number.isFinite(current.scale)||current.scale<=0||current.score<0||current.score>current.scale)return null;
  return {score:current.score,scale:current.scale,observedAt:review.modelAnalysis!.sourceObservedAt,source:'page_observation'};
 }
 if(typeof review.score!=='string'||!review.score.trim())return null;
 const score=Number(review.score),max=review.scoreMax;
 return typeof max==='number'&&Number.isFinite(max)&&max>0&&Number.isFinite(score)&&score>=0&&score<=max?{score,scale:max,observedAt:review.observedAt,source:'curated_record'}:null;
}
export function normalizedReviewRating(review:ReviewEvidence|null):number|null{
 const rating=effectiveReviewRating(review);return rating?rating.score/rating.scale*5:null;
}
export function facilityEvidenceStatus(candidate:WorkflowCandidate,facility:string,asOf:string):'missing'|'unbound'|'verified'{
 if(!candidate.amenities?.includes(facility))return 'missing';
 const evidence=candidate.amenityEvidence,age=evidence?Date.parse(asOf)-Date.parse(evidence.observedAt):NaN;
 return evidence&&evidence.hotelId===candidate.hotelId&&evidence.source===candidate.source&&Number.isFinite(age)&&age>=0&&age<=15*60000?'verified':'unbound';
}
