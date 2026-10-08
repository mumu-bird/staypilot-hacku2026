import {effectiveReviewRating} from '../shared/evidence-checks.ts';
import type {CandidateDecision} from '../shared/live-workflow.ts';
/** Evidence-task planning only; full source records remain in the audit and review pipeline. */
export function inspectionCandidateState(decision:CandidateDecision){
 const c=decision.candidate,review=c.reviews,route=c.route;
 return {key:c.key,name:c.name,address:c.address,source:c.source,searchObservedAt:c.searchObservedAt,
 room:decision.representativeRoom,
 roomQuery:c.roomQuery?{...c.roomQuery,filter:{...c.roomQuery.filter},interpretation:'This query status and filter do not establish stock availability or free cancellation. Empty filtered results differ from an unqueried hotel. Retrying identical recent successful filters needs a specific reason.'}:null,
 commute:{tier:decision.tier,minutes:decision.minutes,source:route?.source??null,observedAt:route?.observedAt??null,walking:route?.walking??null,directMetro:route?.transits.filter(t=>t.metroDirect).map(t=>({minutes:t.minutes,lines:t.lines.map(l=>l.name)}))??[],warnings:route?.warnings??[]},
 reviews:review?{sourceUrl:review.sourceUrl,observedAt:review.observedAt,rating:effectiveReviewRating(review),openingYear:review.openingYear,renovationYear:review.renovationYear,negativeSample:review.negative.map(r=>({date:r.date,issues:r.issues})),positiveSampleCount:review.positive.length,sampleLimitations:review.sampleLimitations??[]}:null,
 semanticReviewSources:[review?.modelAnalysis,...c.additionalReviewAnalyses??[]].filter(Boolean),
 targetedReviewMetric:{value:decision.risk,rows:decision.reviewRows,interpretation:'Personal weighted targeted sample only; not population prevalence. Semantic sources stay separate.'},
 gaps:decision.gaps,reasons:decision.reasons,errors:c.errors,bookable:false};
}
