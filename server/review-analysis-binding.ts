import {z} from 'zod';
import type {ReviewEvidence} from '../shared/live-workflow.ts';
const issue=z.enum(['noise','hygiene','smell','maintenance','service','space','security']);
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const probabilities=z.object({noise:z.number().min(0).max(1),hygiene:z.number().min(0).max(1),smell:z.number().min(0).max(1),maintenance:z.number().min(0).max(1),service:z.number().min(0).max(1),space:z.number().min(0).max(1),security:z.number().min(0).max(1)}).strict();
const schema=z.object({sourceUrl:z.string().url(),sourceObservedAt:z.string().datetime(),analyzedAt:z.string().datetime(),hotel:z.object({id:z.string()}),evidenceHash:z.string().regex(/^[a-f0-9]{64}$/),model:z.string().min(1).max(100),coverage:z.literal('visible_page_only'),sourceRating:z.object({score:z.number().nonnegative(),scale:z.number().positive(),totalCount:z.number().int().nonnegative()}).refine(r=>r.score<=r.scale).optional(),thresholds:z.object({issue:z.literal(.8),absent:z.literal(.2)}),rows:z.array(z.object({id:z.string().regex(/^\d+$/),publishedAt:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),uncertain:z.array(issue),issues:z.array(issue),textHash:hash,probabilities})).min(1).max(30)});
export function attachReviewAnalysis(review:ReviewEvidence,value:unknown):boolean{
 const parsed=schema.safeParse(value);if(!parsed.success)return false;const v=parsed.data;
 if(review.binding?.platformIds.trip!==v.hotel.id||review.sourceUrl!==v.sourceUrl||Date.parse(v.analyzedAt)<Date.parse(v.sourceObservedAt))return false;
 const ids=new Set<string>();
 for(const row of v.rows){
  if(ids.has(row.id))return false;ids.add(row.id);
  const time=Date.parse(row.publishedAt+'T00:00:00Z');
  if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==row.publishedAt||time>Date.parse(v.sourceObservedAt))return false;
  const expectedIssues=Object.entries(row.probabilities).filter(([,p])=>p>=.8).map(([key])=>key).sort();
  const expectedUncertain=Object.entries(row.probabilities).filter(([,p])=>p>.2&&p<.8).map(([key])=>key).sort();
  if(JSON.stringify([...row.issues].sort())!==JSON.stringify(expectedIssues)||JSON.stringify([...row.uncertain].sort())!==JSON.stringify(expectedUncertain))return false;
 }
 review.modelAnalysis={model:v.model,sourceUrl:v.sourceUrl,sourceObservedAt:v.sourceObservedAt,analyzedAt:v.analyzedAt,evidenceHash:v.evidenceHash,sampleCount:v.rows.length,...(v.sourceRating?{sourceRating:v.sourceRating}:{}),coverage:v.coverage,mentions:v.rows.filter(r=>r.issues.length).map(r=>({id:r.id,date:r.publishedAt,issues:r.issues})),uncertain:v.rows.filter(r=>r.uncertain.length).map(r=>({id:r.id,date:r.publishedAt,issues:r.uncertain}))};return true;
}
