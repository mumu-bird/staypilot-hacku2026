import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {workflowRecovery} from '../shared/workflow-recovery.ts';
const actual=()=>JSON.parse(readFileSync('docs/cases/live-integrated-product-validation-20261009.json','utf8'));
test('real blocked cancellation case prioritizes observed missing-room evidence without increasing budget',()=>{
 const result=actual(),before=JSON.stringify(result);const recovery=workflowRecovery(result,Date.parse(result.completedAt));assert.equal(recovery.cancellationBlocksShownOffers,true);assert(recovery.targets.length<=3);assert(recovery.targets.length>0);assert.equal(recovery.targets[0].name,'北京新侨饭店');assert.equal(recovery.targets[0].roomToolAvailable,true);assert(recovery.targets.every(t=>result.candidates.some((d:any)=>d.candidate.key===t.key&&d.reasons.length===0)));assert.equal(JSON.stringify(result),before);
});
test('mixed violations and absent offers do not masquerade as a common cancellation cause',()=>{
 const result=actual();result.tradeoffs.options[0].hardViolations=['Unacceptable hygiene'];assert.equal(workflowRecovery(result).cancellationBlocksShownOffers,false);result.tradeoffs.options=[];assert.equal(workflowRecovery(result).cancellationBlocksShownOffers,false);
});

test('existing stale quotes and routes are inspection gaps rather than current evidence',()=>{
 const result=actual(),now=Date.parse(result.completedAt)+16*60_000;
 const original=result.candidates.find((d:any)=>d.candidate.rooms.length>0);original.reasons=[];result.candidates=[original];
 const target=workflowRecovery(result,now).targets[0];assert.equal(target.staleRooms,true);assert.equal(target.staleRoute,true);assert.equal(target.missingRooms,false);assert.equal(target.missingRoute,false);
 original.candidate.route.observedAt=new Date(now+60_000).toISOString();original.candidate.rooms[0].sourceObservedAt='2026-10-09T00:00:00';assert.equal(workflowRecovery(result,now).targets[0].staleRoute,true);assert.equal(workflowRecovery(result,now).targets[0].staleRooms,true);
});

test('all unknown cancellation terms remain a targeted evidence gap without changing policy or inventing free cancellation',()=>{
 const result=actual(),now=Date.parse(result.completedAt);
 const original=result.candidates.find((d:any)=>d.candidate.rooms.length>0);original.reasons=[];result.candidates=[original];
 for(const room of original.candidate.rooms){room.cancellationStatus='unknown';room.sourceObservedAt=result.completedAt;}
 original.candidate.route.observedAt=result.completedAt;original.candidate.reviews={reviews:[]};
 const before=JSON.stringify(result),target=workflowRecovery(result,now).targets[0];
 assert(target);assert.equal(target.cancellationUnverified,true);assert.equal(target.staleRooms,false);assert.equal(target.missingRooms,false);assert.equal(JSON.stringify(result),before);
 result.policy.requireCancelable=false;assert.equal(workflowRecovery(result,now).targets.length,0);
});
