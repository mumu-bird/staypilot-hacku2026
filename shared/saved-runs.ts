import type {WorkflowResult} from './live-workflow.ts';
/** Validate display shape/scope without transforming the original observations. */
export function savedRunsResponse(value:unknown,parentRunId?:string):WorkflowResult[]{
 if(!Array.isArray(value)||value.length>30)throw Error('Invalid saved assessments');
 for(const run of value){
 if(!run||typeof run.id!=='string'||!run.id||parentRunId&&run.id!==parentRunId||typeof run.completedAt!=='string'||typeof run.evidenceAsOf!=='string'||!run.query||!['destination','poi','checkIn','checkOut'].every(key=>typeof run.query[key]==='string')||!Number.isInteger(run.query.adultCount)||!run.policy||!Number.isSafeInteger(run.policy.budgetCents)||run.policy.budgetCents<0||!Array.isArray(run.candidates))throw Error('Invalid saved assessment scope');
 for(const d of run.candidates)if(!d||!d.candidate||!['key','name','source'].every(key=>typeof d.candidate[key]==='string')||!Array.isArray(d.gaps)||!d.gaps.every((gap:unknown)=>typeof gap==='string')||d.minutes!=null&&(typeof d.minutes!=='number'||!Number.isFinite(d.minutes)))throw Error('Invalid saved candidate');
 }
 return value;
}
