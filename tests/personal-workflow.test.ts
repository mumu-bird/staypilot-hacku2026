import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Engine} from '../server/engine.ts';
import {sanitizePreferencePatch,validatedReviewEvidence,preserveHardFloors} from '../server/model.ts';
import {shortlist,compareCandidates} from '../shared/workflow.ts';
import {mapRoutes,parseTransit} from '../server/amap.ts';

test('required amenities block actual payment and cannot be waived by downgrade or score',()=>{
 const e=new Engine(':memory:');try{
  e.updateMandate({requiredAmenities:['免费停车'],downgradeOrder:['distance','opening','rating','window']},true);
  const d=e.detail('a','h01'),c=e.evaluate(d.quote,d.reviews);
  assert.equal(c.eligible,false);assert.ok(c.conflicts.some(s=>s.includes('免费停车')));assert.ok(c.matchScore!.total>0);
  assert.equal(e.book({quoteId:d.quote.id,mandateVersion:e.getState().mandate.version,idempotencyKey:'parking-hard-floor'}).ok,false);
  e.setCandidates([c]);assert.deepEqual(e.publishAlternatives(),[]);assert.equal(e.getState().wallet.availableCents,100000);
  e.updateMandate({requiredAmenities:['自助洗衣']},true);assert.equal(e.evaluate(e.detail('a','h01').quote).eligible,true);
 }finally{e.close();}
});
test('opening, renovation and either are distinct explicitly authorized interpretations',()=>{
 const e=new Engine(':memory:');try{
  e.updateMandate({newnessBasis:'opening',openingMin:2023,minScore:4,floorScore:4,downgradeOrder:[]},true);
  assert.equal(e.evaluate(e.detail('a','h04').quote).eligible,false);
  e.updateMandate({newnessBasis:'renovation'},true);assert.equal(e.evaluate(e.detail('a','h04').quote).eligible,true);
  assert.equal(e.evaluate(e.detail('a','h01').quote).eligible,false);
  e.updateMandate({newnessBasis:'either'},true);assert.equal(e.evaluate(e.detail('a','h01').quote).eligible,true);
  assert.throws(()=>e.updateMandate({newnessBasis:'recent' as never},true));
 }finally{e.close();}
});
test('shortlist deduplicates platforms and excluded hotels never fill the three backups',()=>{
 const e=new Engine(':memory:');try{
  e.updateMandate({},true);
  const candidates=(['a','b','c'] as const).flatMap(p=>e.list(p).map(({quote})=>e.evaluate(quote)));
  const selected=shortlist(candidates);assert.ok(selected.length<=4);assert.equal(new Set(selected.map(c=>c.hotel.id)).size,selected.length);
  assert.ok(selected.every(c=>c.eligible));assert.deepEqual(selected[0],[...candidates].sort(compareCandidates).find(c=>c.eligible));
  assert.ok(shortlist(candidates,selected[0].hotel.id).every(c=>c.hotel.id!==selected[0].hotel.id));
  const inflated={...selected[0],eligible:false,matchScore:{total:100,components:[]}};
  assert.ok(shortlist([inflated]).length===0);
 }finally{e.close();}
});
test('early no-match suggestions preserve budget, floor, deadline and monitoring',()=>{
 const e=new Engine(':memory:');try{
  e.updateMandate({budgetCents:10000},true);e.setAgent({monitoring:true});
  const before=e.getState();const candidates=e.list('a').map(({quote})=>e.evaluate(quote));e.setCandidates(candidates);
  const alternatives=e.publishAlternatives();assert.equal(alternatives.length,3);
  assert.ok(alternatives.every(a=>a.changes.some(s=>s.includes('预算需增加'))&&!a.changes.some(s=>s.includes('截止需延后'))));
  const after=e.getState();assert.deepEqual(after.mandate,before.mandate);assert.equal(after.agent.monitoring,true);assert.equal(after.orders.length,0);assert.equal(after.wallet.availableCents,100000);
  e.tick(180);assert.equal(e.getState().agent.monitoring,false);assert.ok(e.getState().alternatives.every(a=>a.changes.some(c=>c.includes('截止需延后'))));
  e.reset('baseline');
  e.updateMandate({floorScore:4.9,minScore:4.9,walkMax:1,downgradeOrder:[]},true);e.setCandidates(candidates);assert.ok(e.publishAlternatives().every(a=>candidates.find(c=>c.hotel.id===a.hotelId)!.quote.score>=4.9));
 }finally{e.close();}
});
test('model fields and comments remain validated data rather than authorization',()=>{
 const {patch,ignored}=sanitizePreferencePatch({confirmed:true,revoked:false,peakCents:999999,windowPreference:'必须有窗',budgetCents:-1,requiredAmenities:['洗衣房','自助洗衣'],issueWeights:{noise:3},downgradeOrder:['rating','rating']});
 assert.deepEqual(patch,{requiredAmenities:['自助洗衣'],issueWeights:{noise:3}});assert.ok(ignored.includes('confirmed'));
 const floorEngine=new Engine(':memory:');try{floorEngine.updateMandate({requiredAmenities:['自助洗衣']},false);const current=floorEngine.getState().mandate;const preserved=preserveHardFloors({forbiddenIssues:['noise'],requiredAmenities:[]},current);assert.deepEqual(preserved.forbiddenIssues,current.forbiddenIssues);assert.deepEqual(preserved.requiredAmenities,['自助洗衣']);assert.equal(current.confirmed,false);assert.deepEqual(preserveHardFloors({},current).forbiddenIssues,current.forbiddenIssues);assert.deepEqual(preserveHardFloors({},current).requiredAmenities,current.requiredAmenities);}finally{floorEngine.close();}
 const e=new Engine(':memory:');try{const reviews=e.detail('a','h02').reviews;const r=reviews[0];assert.deepEqual(validatedReviewEvidence([null,{id:r.id,issue:'noise',span:''},{id:r.id,issue:'noise',span:'凭空制造证据'}],reviews),[]);assert.equal(validatedReviewEvidence([{id:r.id,issue:'noise',span:r.text}],reviews).length,1);}finally{e.close();}
});
test('public transit classification requires a single known subway line for direct metro',async()=>{
 const line=(type:string)=>({name:'示例线路',type,departure_stop:{name:'起点'},arrival_stop:{name:'终点'}});
 const transit=(lines:unknown[])=>({route:{transits:[{duration:'1800',distance:'5000',walking_distance:'500',segments:lines.map(l=>({bus:{buslines:[l]}}))}]}});
 assert.equal(parseTransit(transit([line('普通公交线路')]))[0].metroDirect,false);
 assert.equal(parseTransit(transit([line('地铁线路')]))[0].metroDirect,true);
 const changed=parseTransit(transit([line('地铁线路'),line('地铁线路')]))[0];assert.equal(changed.metroDirect,false);assert.equal(changed.transfers,1);
 assert.equal(parseTransit(transit([line('类型未知')]))[0].transfers,null);
 assert.deepEqual(parseTransit({route:{transits:[{duration:'oops',distance:4}]}}),[]);
 await assert.rejects(mapRoutes({origin:'120,30',destination:'121,31',city:'杭州',confirmed:false}),/先选择并确认/);
});
