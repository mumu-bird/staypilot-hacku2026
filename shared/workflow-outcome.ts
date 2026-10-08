import type {WorkflowResult} from './live-workflow';
/** Observation coverage, not market availability or permission to buy. */
export function workflowOutcome(result:WorkflowResult){
 const options=result.tradeoffs?.options??[];
 const counts={hotels:result.candidates.length,withoutRooms:result.candidates.filter(d=>d.candidate.rooms.length===0).length,withoutRoute:result.candidates.filter(d=>!d.candidate.route).length,withoutReviews:result.candidates.filter(d=>!d.candidate.reviews&&!d.candidate.additionalReviewAnalyses?.length).length};
 const status=counts.hotels===0?(result.errors.length?'query_failed':'empty_observation'):options.some(o=>o.status==='within_bounds')?'provisional_options':options.some(o=>o.status==='requires_confirmation')?'confirmation_needed':options.length>0&&options.every(o=>o.status==='blocked')?'shown_offers_blocked':'evidence_needed';
 return {status,counts} as const;
}
