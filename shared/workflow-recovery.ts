import {inspectionObservationCurrent} from './zoned-time.ts';
import type {WorkflowResult} from './live-workflow';
/** Bounded inspection targets from existing observations; no permission changes or invented options. */
export function workflowRecovery(result:WorkflowResult,now=Date.now()){
 const options=result.tradeoffs?.options??[];
 const cancellationBlocksShownOffers=result.policy.requireCancelable&&options.length>0&&options.every(o=>o.status==='blocked'&&o.hardViolations.some(v=>/Free cancellation is explicitly unavailable|免费取消/.test(v)));
 const targets=result.candidates.filter(d=>d.reasons.length===0).map(d=>({key:d.candidate.key,name:d.candidate.name,missingRooms:d.candidate.rooms.length===0,cancellationUnverified:result.policy.requireCancelable&&d.candidate.rooms.length>0&&d.candidate.rooms.every(r=>r.cancellationStatus==='unknown'),staleRooms:d.candidate.rooms.some(r=>!inspectionObservationCurrent(r.sourceObservedAt,now)),staleRoute:!!d.candidate.route&&!inspectionObservationCurrent(d.candidate.route.observedAt,now),missingRoute:!d.candidate.route,missingReviews:!d.candidate.reviews&&!d.candidate.additionalReviewAnalyses?.length,roomToolAvailable:d.candidate.key.startsWith('rollinggo:')})).filter(t=>t.missingRooms||t.staleRooms||t.cancellationUnverified||t.missingRoute||t.staleRoute||t.missingReviews).sort((a,b)=>Number((b.missingRooms||b.staleRooms)&&b.roomToolAvailable&&!b.missingRoute&&!b.staleRoute)-Number((a.missingRooms||a.staleRooms)&&a.roomToolAvailable&&!a.missingRoute&&!a.staleRoute)||Number(a.missingRoute||a.staleRoute)-Number(b.missingRoute||b.staleRoute)).slice(0,3);
 return {cancellationBlocksShownOffers,targets};
}
