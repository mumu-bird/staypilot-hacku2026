import type {WorkflowResult} from './live-workflow';
import {inspectionObservationCurrent} from './zoned-time.ts';
/** Current inspection guidance only, never booking permission. Source facts retain their own timestamps. */
export function inspectionAdviceCurrent(result:WorkflowResult,now=Date.now()):boolean{
 const advice=result.jev;
 return !!advice&&advice.evidenceHash===result.evidenceHash&&inspectionObservationCurrent(result.evidenceAsOf,now)&&inspectionObservationCurrent(advice.observedAt,now);
}
