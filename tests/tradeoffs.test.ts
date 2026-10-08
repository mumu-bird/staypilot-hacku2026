import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recordedCandidates,defaultWorkflowPolicy,roomInspectionCandidates} from '../server/live-workflow.ts';
import {buildTradeoffOptions,evaluateTradeoffs} from '../server/tradeoffs.ts';
function fixture(){const original=recordedCandidates();const c=original.candidates.find(c=>c.name==='北京新侨饭店')!;const room=c.rooms.find(r=>r.estimatedStayPrice===558)!;c.rooms=[{...room,ratePlanId:'one',estimatedStayPrice:550},{...room,ratePlanId:'two',estimatedStayPrice:580}];return {c,asOf:original.asOf,p:structuredClone(defaultWorkflowPolicy)};}
function choice(criteria:Record<string,string>,selected:string){return {type:'choice',choice:selected,confidence:.8,probabilities:Object.fromEntries(Object.keys(criteria).map(k=>[k,k===selected?1:0]))};}
test('two real-evidence shaped compromises trigger Jev and preserve the hard budget',async()=>{const {c,p,asOf}=fixture();let calls=0;const model=async(_path:any,body:any)=>{calls++;const answers:any={};for(const [name,q] of Object.entries(body.questions) as any){const selected=name==='tradeoff'?Object.keys(q.criteria).find(k=>k.startsWith('option_'))!:name==='basis'?'budget':'quote';answers[name]=choice(q.criteria,selected);}return {model:'test-model',answers,usage:{input_tokens:1,output_tokens:1}};};const a=await evaluateTradeoffs([c],p,asOf,2,model);assert.equal(calls,2);assert.equal(a.status,'jev_recommended');assert.equal(a.scope,'authorized');assert.equal(p.budgetCents,60000);assert(a.options.every(o=>o.gaps.length>0));});
test('over-budget suggestions require confirmation and hard review exclusions cannot be traded',()=>{const {c,p,asOf}=fixture();c.rooms.forEach(r=>r.estimatedStayPrice=650);assert(buildTradeoffOptions([c],p,asOf,2).every(o=>o.status==='requires_confirmation'));p.unacceptable=['noise'];assert(buildTradeoffOptions([c],p,asOf,2).every(o=>o.status==='blocked'));});
test('missing routes request evidence without calling Jev or claiming a budget increase',async()=>{const {c,p,asOf}=fixture();c.route=null;let calls=0;const a=await evaluateTradeoffs([c],p,asOf,2,async()=>{calls++;throw new Error();});assert.equal(calls,0);assert.equal(a.status,'needs_evidence');assert.equal(a.preferredOptionId,null);});
test('nonrefundable room stays blocked even if vendor supplies a cancellation date',()=>{const {c,p,asOf}=fixture();c.rooms.forEach(r=>{r.cancellationStatus='nonrefundable';r.cancelUntil='2099-01-01T00:00:00+08:00';});assert(buildTradeoffOptions([c],p,asOf,2).every(o=>o.status==='blocked'));});
test('model failure retains observed evidence without a fake Jev recommendation',async()=>{const {c,p,asOf}=fixture();const a=await evaluateTradeoffs([c],p,asOf,2,async()=>{throw new Error('failed');});assert.equal(a.status,'model_unavailable');assert.equal(a.preferredOptionId,null);assert(a.options.length===2);});

test('room inspection prioritizes verified routes over unknown-location cheap hotels',()=>{const {c,p,asOf}=fixture();const unknown={...structuredClone(c),key:'rollinggo:other',name:'unknown route',route:null,displayPrice:1,rooms:[]};c.rooms=[];const picked=roomInspectionCandidates([unknown,c],p,asOf,2);assert.equal(picked[0].candidate.key,c.key);});

test('unknown reviews or window evidence cannot be labelled an ideal match',()=>{const {c,p,asOf}=fixture();p.walkMinutes=180;c.reviews=null;c.rooms.forEach(r=>r.windowType='unknown');const options=buildTradeoffOptions([c],p,asOf,2);assert(options.every(o=>!o.idealMatch));assert(options.every(o=>o.gaps.some(g=>g.includes('review'))));});
test('missing required facility evidence prevents an ideal match and is not silently relaxed',()=>{
 const {c,p,asOf}=fixture();p.requiredAmenities=['电梯'];c.amenities=[];
 const options=buildTradeoffOptions([c],p,asOf,2);
 assert(options.every(o=>o.gaps.includes('Required facility lacks evidence: 电梯')));
 assert(options.every(o=>!o.idealMatch));
 c.amenities=['电梯'];c.amenityEvidence={source:c.source,hotelId:c.hotelId,observedAt:asOf};
 assert(buildTradeoffOptions([c],p,asOf,2).every(o=>!o.gaps.some(g=>g.includes('Required facility'))));
 assert(buildTradeoffOptions([c],p,asOf,2).every(o=>o.facts.some(f=>f.includes('Platform lists required facility 电梯')&&f.includes(asOf))));
});

test('facility evidence must match the hotel and retain fresh observation time; parking does not prove free parking',()=>{
 const {c,p,asOf}=fixture();p.requiredAmenities=['电梯'];c.amenities=['电梯','停车场'];
 c.amenityEvidence={source:c.source,hotelId:'another-hotel',observedAt:asOf};
 assert(buildTradeoffOptions([c],p,asOf,2).every(o=>o.gaps.some(g=>g.includes('identity-bound'))));
 c.amenityEvidence.hotelId=c.hotelId;c.amenityEvidence.observedAt=new Date(Date.parse(asOf)-16*60000).toISOString();
 assert(buildTradeoffOptions([c],p,asOf,2).every(o=>o.gaps.some(g=>g.includes('identity-bound'))));
 c.amenityEvidence.observedAt=asOf;p.requiredAmenities=['免费停车'];
 assert(buildTradeoffOptions([c],p,asOf,2).every(o=>o.gaps.includes('Required facility lacks evidence: 免费停车')));
 assert(buildTradeoffOptions([c],p,asOf,2).every(o=>o.evidence.some(e=>e.kind==='facilities'&&e.observedAt===asOf)));
});

test('partial review coverage stays an evidence gap even when an issue-bearing sample exists',()=>{
 const {c,p,asOf}=fixture();c.reviews!.sampleLimitations=['Recent-stay coverage is unverified.'];
 const options=buildTradeoffOptions([c],p,asOf,2);assert(options.every(o=>o.gaps.includes('Recent-stay coverage is unverified.')));assert(options.every(o=>!o.idealMatch));
});

test('a high platform score cannot compensate for an explicitly unacceptable review issue',()=>{
 const {c,p,asOf}=fixture();c.reviews!.score='9.4';c.reviews!.scoreMax=10;c.reviews!.negative=[{date:'2026-03-14',summary:'High-rated review mentions weak door insulation but a quiet stay.',issues:['noise']}];
 p.unacceptable=['noise'];const options=buildTradeoffOptions([c],p,asOf,2);
 assert(options.every(o=>o.status==='blocked'&&o.hardViolations.includes('Explicitly unacceptable review issue: noise.')));
 p.unacceptable=[];assert(buildTradeoffOptions([c],p,asOf,2).every(o=>o.status!=='blocked'));
});

test('room inspection never spends its bounded slots on a hotel with a known non-commute hard exclusion',()=>{
 const {c,p,asOf}=fixture();p.unacceptable=['noise'];c.rooms=[];
 assert.deepEqual(roomInspectionCandidates([c],p,asOf,2),[]);
 const unknown=structuredClone(c);unknown.key='rollinggo:unreviewed';unknown.reviews=null;
 assert.equal(roomInspectionCandidates([c,unknown],p,asOf,2)[0].candidate.key,unknown.key);
});

test('expired or ambiguous room and route observations remain visible but cannot trigger Jev or single-option recommendations',async()=>{
 for(const field of ['room','route'] as const)for(const variant of ['stale','future','unzoned','invalid']){
 const {c,p,asOf}=fixture();const instant=Date.parse(asOf),time=variant==='stale'?new Date(instant-16*60000).toISOString():variant==='future'?new Date(instant+60000).toISOString():variant==='unzoned'?asOf.replace(/Z$/,''):'2026-02-30T00:00:00Z';
 c.rooms.forEach(r=>r.sourceObservedAt=asOf);c.route!.observedAt=asOf;
 if(field==='room')c.rooms.forEach(r=>r.sourceObservedAt=time);else c.route!.observedAt=time;
 let calls=0;const result=await evaluateTradeoffs([c],p,asOf,2,async()=>{calls++;throw Error('Must not compare expired evidence');});
 assert.equal(calls,0);assert.equal(result.status,'needs_evidence');assert.equal(result.scope,'none');assert.equal(result.preferredOptionId,null);assert.equal(result.options.length,2);assert(result.options.every(o=>o.gaps.some(g=>g.startsWith(field==='room'?'Room observation':'Route observation'))));assert.equal(p.budgetCents,60000);
 c.rooms=c.rooms.slice(0,1);const single=await evaluateTradeoffs([c],p,asOf,2,async()=>{throw Error('unused');});assert.equal(single.status,'needs_evidence');assert.equal(single.preferredOptionId,null);
 }
});

test('live comparison rechecks evidence and cancellation after each model response without changing replay time',async()=>{
 for(const change of ['rooms','route','cancel'] as const)for(const phase of [1,2]){
 const {c,p,asOf}=fixture();let instant=Date.parse(asOf),calls=0;c.rooms.forEach(r=>{r.sourceObservedAt=asOf;r.cancellationStatus='free_until';r.cancelUntil=new Date(instant+60000).toISOString();});c.route!.observedAt=asOf;
 const call=async(_path:any,body:any)=>{calls++;if(calls===phase){if(change==='cancel')instant+=60000;else{instant+=16*60000;if(change==='rooms')c.route!.observedAt=new Date(instant).toISOString();else c.rooms.forEach(r=>{r.sourceObservedAt=new Date(instant).toISOString();r.cancelUntil=new Date(instant+60000).toISOString();});}}const answers:any={};for(const [key,q] of Object.entries(body.questions) as any)answers[key]=choice(q.criteria,key==='tradeoff'?Object.keys(q.criteria).find(k=>k.startsWith('option_'))!:key==='basis'?'budget':'quote');return {model:'controlled-model',answers,usage:{input_tokens:1,output_tokens:1}};};
 const result=await evaluateTradeoffs([c],p,asOf,2,call,()=>instant);assert.equal(result.status,'needs_evidence');assert.equal(result.preferredOptionId,null);assert.equal(result.nextAction,null);assert.equal(calls,phase);assert.equal(result.model,'controlled-model');assert.match(result.reason,/during comparison/);assert.equal(p.budgetCents,60000);
 if(change==='cancel')assert(result.options.every(o=>o.hardViolations.some(v=>v.includes('expired'))));
 }
});

test('unknown cancellation times stay evidence gaps and are not misreported as expiry during comparison',async()=>{
 for(const deadline of [null,'2026-10-09T09:00:00','2026-02-30T00:00:00Z']){
 const {c,p,asOf}=fixture();c.rooms=c.rooms.slice(0,1);c.rooms[0].sourceObservedAt=asOf;c.route!.observedAt=asOf;c.rooms[0].cancelUntil=deadline;c.rooms[0].cancellationStatus='unknown';
 let calls=0;const result=await evaluateTradeoffs([c],p,asOf,2,async()=>{calls++;throw Error('single provisional option needs no model');},()=>Date.parse(asOf));
 assert.equal(result.status,'single_option');assert.equal(calls,0);assert(result.options[0].gaps.includes('Cancellation deadline unknown.'));assert(!result.options[0].hardViolations.some(v=>v.includes('expired')));assert(!result.reason.includes('became invalid'));assert.equal(result.options[0].idealMatch,false);
 }
});

test('cross-platform aligned quotes need fresh observations on both sides before a display difference is calculated',async()=>{
 const {comparePlatforms}=await import('../server/tradeoffs.ts');const {c,asOf}=fixture();c.rooms=c.rooms.slice(0,1);c.rooms[0].sourceObservedAt=asOf;c.rooms[0].cancellationStatus='free_until';c.rooms[0].maxOccupancy=2;c.rooms[0].mealAmount=0;c.rooms[0].mealType='None';c.rooms[0].bedType='Double';
 const other=structuredClone(c);other.key='other:hotel';other.source='other-platform' as any;other.rooms[0].estimatedStayPrice=c.rooms[0].estimatedStayPrice!-10;
 const aligned=comparePlatforms([c,other],asOf)[0];assert.equal(aligned.status,'comparable_display');assert.equal(aligned.priceDifferenceCents,1000);
 for(const time of [new Date(Date.parse(asOf)-16*60000).toISOString(),new Date(Date.parse(asOf)+60000).toISOString(),asOf.replace(/Z$/,''),'2026-02-30T00:00:00Z']){other.rooms[0].sourceObservedAt=time;const result=comparePlatforms([c,other],asOf)[0];assert.equal(result.status,'evidence_stale');assert.equal(result.priceDifferenceCents,null);assert.match(result.warning,/Refresh both platforms/);}
 other.rooms[0].sourceObservedAt=asOf;other.rooms[0].mealType='Breakfast';const mismatch=comparePlatforms([c,other],asOf)[0];assert.equal(mismatch.status,'conditions_mismatch');assert.equal(mismatch.priceDifferenceCents,null);
});
