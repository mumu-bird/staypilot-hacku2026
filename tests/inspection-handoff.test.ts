import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {inspectionHandoffOption} from '../shared/inspection-handoff.ts';import type {WorkflowResult} from '../shared/live-workflow.ts';import type {InspectionSelection} from '../shared/tradeoffs.ts';
const result=JSON.parse(readFileSync('docs/cases/live-two-review-workflow-20261008.json','utf8')) as WorkflowResult;
const option=result.tradeoffs!.options.find(o=>o.status==='within_bounds')!;
const selection:InspectionSelection={id:'test',runId:result.id,optionId:option.id,evidenceHash:result.tradeoffs!.evidenceHash,policyVersion:result.tradeoffs!.policyVersion,hotelName:option.hotelName,roomName:option.roomName,selectedAt:result.completedAt,purpose:'inspection_only',transactionEnabled:false};
const context={authorized:true,conditionsMatched:true,busy:false,now:Date.parse(result.completedAt)};
test('real saved selection is usable for inspection only while consent, conditions and quote remain current',()=>{
 assert.equal(inspectionHandoffOption(result,selection,context)?.id,option.id);
 for(const patch of [{authorized:false},{conditionsMatched:false},{busy:true},{now:context.now+16*60000},{now:Date.parse(result.evidenceAsOf)-1}])assert.equal(inspectionHandoffOption(result,selection,{...context,...patch}),null);
 for(const patch of [{runId:'other'},{evidenceHash:'other'},{policyVersion:'other'}])assert.equal(inspectionHandoffOption(result,{...selection,...patch},context),null);
});
test('expired cancellation and stale individual quote invalidate handoff even when aggregate run is current',()=>{
 for(const mutate of [(r:WorkflowResult)=>{r.candidates.find(d=>d.candidate.key===option.candidateKey)!.candidate.rooms.find(r=>r.ratePlanId===option.ratePlanId)!.cancelUntil=new Date(context.now).toISOString();},(r:WorkflowResult)=>{r.candidates.find(d=>d.candidate.key===option.candidateKey)!.candidate.rooms.find(r=>r.ratePlanId===option.ratePlanId)!.sourceObservedAt=new Date(context.now-16*60000).toISOString();}]){const r=structuredClone(result);mutate(r);assert.equal(inspectionHandoffOption(r,selection,context),null);}
});
test('unzoned evidence, quote and cancellation timestamps cannot authorize inspection handoff',()=>{
 for(const field of ['evidence','quote','cancellation']){
  const copy=structuredClone(result);
  const room=copy.candidates.find(d=>d.candidate.key===option.candidateKey)!.candidate.rooms.find(r=>r.ratePlanId===option.ratePlanId)!;
  const withoutZone=(value:string)=>value.replace(/(?:Z|[+-]\d{2}:\d{2})$/,'');
  if(field==='evidence')copy.evidenceAsOf=withoutZone(copy.evidenceAsOf);
  if(field==='quote')room.sourceObservedAt=withoutZone(room.sourceObservedAt);
  if(field==='cancellation')room.cancelUntil=withoutZone(room.cancelUntil!);
  assert.equal(inspectionHandoffOption(copy,selection,context),null,field);
 }
});
test('stale, future, missing or unzoned route evidence cannot be renewed by a fresh quote',()=>{
 for(const time of [new Date(context.now-16*60000).toISOString(),new Date(context.now+1).toISOString(),result.completedAt.replace(/Z$/,''),null]){
  const copy=structuredClone(result),candidate=copy.candidates.find(d=>d.candidate.key===option.candidateKey)!.candidate;
  if(time===null)candidate.route=null;else candidate.route!.observedAt=time;
  assert.equal(inspectionHandoffOption(copy,selection,context),null);
 }
});
test('inspection handoff requires a valid CNY room price equal to the chosen option amount',()=>{
 for(const value of [-10,NaN,Infinity,Number.MAX_VALUE,option.priceCents!/100+1]){const copy=structuredClone(result),room=copy.candidates.find(d=>d.candidate.key===option.candidateKey)!.candidate.rooms.find(r=>r.ratePlanId===option.ratePlanId)!;room.estimatedStayPrice=value;assert.equal(inspectionHandoffOption(copy,selection,context),null);}
 const copy=structuredClone(result);copy.candidates.find(d=>d.candidate.key===option.candidateKey)!.candidate.rooms.find(r=>r.ratePlanId===option.ratePlanId)!.currency='USD';assert.equal(inspectionHandoffOption(copy,selection,context),null);
});
