import {displayEnglish} from '../shared/display-english.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recordedCandidates,defaultWorkflowPolicy,rankCandidates,conditionAlternatives} from '../server/live-workflow.ts';
function fixture(){const saved=recordedCandidates(),candidate=saved.candidates.find(c=>c.name==='北京新侨饭店')!;candidate.rooms=[{...candidate.rooms[0],estimatedStayPrice:650,currency:'CNY',maxOccupancy:2,sourceObservedAt:saved.asOf,cancellationStatus:'free_until',cancelUntil:new Date(Date.parse(saved.asOf)+3600000).toISOString()}];candidate.route!.observedAt=saved.asOf;return {candidate,asOf:saved.asOf,policy:{...structuredClone(defaultWorkflowPolicy),window:'any' as const,unacceptable:[],walkMinutes:200}};}
test('actual over-ceiling room estimates create explicit confirmation-only budget suggestions without changing policy',()=>{
 const {candidate,asOf,policy}=fixture(),before=JSON.stringify(policy);const proposals=conditionAlternatives(rankCandidates([candidate],policy,asOf),policy,asOf,2);assert.equal(proposals.length,1);assert(proposals[0].change.includes('650.00'));assert(proposals[0].change.includes('50.00'));assert(proposals[0].change.includes('待重新确认'));assert(proposals[0].remaining.length>0);assert.equal(JSON.stringify(policy),before);assert.match(displayEnglish(proposals[0].change)!,/requiring confirmation/);assert.match(displayEnglish(proposals[0].change)!,/original budget is unchanged/);
});
test('budget proposals cannot compensate for cancellation floors, stale evidence, unknown prices or insufficient occupancy',()=>{
 for(const variant of ['cancel','stale','unknown_price','occupancy']){const {candidate,asOf,policy}=fixture();if(variant==='cancel')candidate.rooms[0].cancellationStatus='nonrefundable';if(variant==='stale')candidate.rooms[0].sourceObservedAt=new Date(Date.parse(asOf)-16*60000).toISOString();if(variant==='unknown_price')candidate.rooms[0].estimatedStayPrice=null;const adults=variant==='occupancy'?3:2;assert.deepEqual(conditionAlternatives(rankCandidates([candidate],policy,asOf,adults),policy,asOf,adults),[]);}
});
