import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Engine} from '../server/engine.ts';
import {journeyProgress} from '../shared/journey.ts';

test('a listing observation does not claim review, comparison or booking completion',()=>{
 const e=new Engine(':memory:');
 try{e.list('a');const p=journeyProgress(e.getState());assert.equal(p.badges[2],'待观察');assert.equal(p.badges[3],'待比较');assert.equal(p.badges[4],'待成交');assert.equal(p.badges[5],'未开始');}finally{e.close();}
});
test('unwindowed rooms need explicit downgrade and a hard window floor remains enforced',()=>{
 const e=new Engine(':memory:');
 try{
  e.updateMandate({windowPreference:'required',downgradeOrder:['distance','opening','rating','window']},true);
  let q=e.detail('a','h07').quote;assert.equal(q.hasWindow,false);
  let result=e.book({quoteId:q.id,idempotencyKey:'hard-floor',mandateVersion:e.getState().mandate.version});
  assert.equal(result.ok,false);assert.equal(e.getState().wallet.availableCents,100000);
  e.updateMandate({windowPreference:'preferred',downgradeOrder:['distance','opening','rating']},true);
  q=e.detail('a','h07').quote;assert.equal(e.evaluate(q).eligible,false);
  e.updateMandate({downgradeOrder:['distance','opening','rating','window']},true);
  q=e.detail('a','h07').quote;assert.equal(e.evaluate(q).tier,4);assert.equal(e.evaluate(q).eligible,true);
  assert.equal(e.evaluate({...q,hasWindow:null}).eligible,false);
  result=e.book({quoteId:q.id,idempotencyKey:'authorized-window-downgrade',mandateVersion:e.getState().mandate.version});assert.equal(result.ok,true);
 }finally{e.close();}
});
test('order existence and refund uncertainty determine progress even when the error banner is cleared',()=>{
 const e=new Engine(':memory:');
 try{
  e.updateMandate({allowNonrefundable:true},true);const q=e.detail('c','h01').quote;
  assert.equal(e.book({quoteId:q.id,idempotencyKey:'locked',mandateVersion:e.getState().mandate.version}).ok,true);
  const p=journeyProgress(e.getState());assert.equal(p.badges[4],'已有确认订单');assert.equal(p.badges[5],'不可取消，已锁定');
  e.revoke();assert.equal(journeyProgress(e.getState()).badges[1],'已撤销');assert.equal(e.getState().orders[0].status,'confirmed');
 }finally{e.close();}
});

test('deadline suggestions preserve the hard window floor',()=>{
 const e=new Engine(':memory:');
 try{e.updateMandate({},true);const d=e.detail('a','h07');e.setCandidates([e.evaluate(d.quote,d.reviews)]);e.tick(180);assert.deepEqual(e.getState().alternatives,[]);assert.equal(e.getState().orders.length,0);assert.equal(e.getState().wallet.availableCents,100000);}finally{e.close();}
});
