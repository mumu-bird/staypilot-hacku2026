import {z} from 'zod';
import {policySchema} from './workflow-policy.ts';
export const workflowDraftKey='staypilot-live-trip-v1';
export function shanghaiToday(now=new Date()){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function defaultTripDates(now=new Date()){
 const day=Date.parse(shanghaiToday(now)+'T00:00:00Z');
 return {checkIn:new Date(day+86400000).toISOString().slice(0,10),checkOut:new Date(day+2*86400000).toISOString().slice(0,10)};
}
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(d=>Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d);
const query=z.object({destination:z.string().max(80),poi:z.string().max(120),checkIn:date,checkOut:date,adultCount:z.number().int().min(1).max(4),roomCount:z.literal(1),childCount:z.literal(0),size:z.number().int().min(1).max(20),searchRadiusMeters:z.number().int().min(500).max(50000).optional()}).strict();
const schema=z.object({version:z.literal(1),query,policy:policySchema,updatedAt:z.string().datetime()}).strict().refine(d=>(d.policy.idealBudgetCents??d.policy.budgetCents)<=d.policy.budgetCents);
export function readWorkflowDraft(raw:string|null){if(!raw)return null;try{const parsed=schema.safeParse(JSON.parse(raw));return parsed.success?parsed.data:null;}catch{return null;}}
export function serializeWorkflowDraft(query:unknown,policy:unknown){const parsed=schema.safeParse({version:1,query,policy,updatedAt:new Date().toISOString()});return parsed.success?JSON.stringify(parsed.data):null;}
