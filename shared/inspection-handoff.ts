import {zonedTimestamp,inspectionObservationCurrent} from './zoned-time.ts';
import type {WorkflowResult} from './live-workflow.ts';
import type {InspectionSelection,TradeoffOption} from './tradeoffs.ts';
/** Inspection only: this never establishes final price, inventory or purchase authority. */
export function inspectionHandoffOption(result:WorkflowResult|null,selection:InspectionSelection|null|undefined,context:{authorized:boolean;conditionsMatched:boolean;busy:boolean;now:number}):TradeoffOption|null{
 if(!result||!result.policy||!Array.isArray(result.candidates)||!selection||!context.authorized||!context.conditionsMatched||context.busy||result.mode!=='live'||selection.purpose!=='inspection_only'||selection.transactionEnabled!==false)return null;
 if(selection.runId!==result.id||selection.evidenceHash!==result.tradeoffs?.evidenceHash||selection.policyVersion!==result.tradeoffs?.policyVersion)return null;
 const evidenceTime=zonedTimestamp(result.evidenceAsOf);if(evidenceTime===null)return null;const age=context.now-evidenceTime;if(!Number.isFinite(age)||age<0||age>15*60000)return null;
 const option=result.tradeoffs.options.find(o=>o.id===selection.optionId);
 if(!option||option.status!=='within_bounds'||option.hardViolations.length||option.minutes===null||option.priceCents===null||option.priceCents>result.policy.budgetCents)return null;
 const candidate=result.candidates.find(d=>d.candidate.key===option.candidateKey)?.candidate;
 if(!inspectionObservationCurrent(candidate?.route?.observedAt,context.now))return null;
 const room=candidate?.rooms.find(r=>r.ratePlanId===option.ratePlanId);
 if(!room)return null;
 const quoteTime=zonedTimestamp(room.sourceObservedAt);if(quoteTime===null)return null;const quoteAge=context.now-quoteTime;if(!Number.isFinite(quoteAge)||quoteAge<0||quoteAge>15*60000)return null;
 if(result.policy.requireCancelable&&(room.cancellationStatus!=='free_until'||zonedTimestamp(room.cancelUntil)===null||zonedTimestamp(room.cancelUntil)!<=context.now))return null;
 return option;
}
