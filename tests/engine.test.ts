import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Engine } from '../server/engine.ts';
import { BASE_TIME, HOUR } from '../server/seed.ts';
import type { BookingRequest } from '../shared/types.ts';

function ready(scenario='baseline'):Engine {const e=new Engine(':memory:');if(scenario!=='baseline')e.reset(scenario);e.updateMandate({},true);return e;}
function buy(e:Engine,platform:'a'|'b'|'c'='a',hotel='h01',key='initial',replacementFor?:string){const quote=e.detail(platform,hotel).quote;return e.book({quoteId:quote.id,idempotencyKey:key,mandateVersion:e.getState().mandate.version,...(replacementFor?{replacementFor}:{})});}

 test('authorization and wallet are distinct; transaction defaults to blocked',()=>{
  const e=new Engine(':memory:');const q=e.detail('a','h01').quote;
  assert.equal(e.book({quoteId:q.id,idempotencyKey:'noauth',mandateVersion:1}).code,'authorization_required');
  e.updateMandate({budgetCents:200000,peakCents:300000},true);
  assert.equal(e.getState().wallet.availableCents,100000);e.addFunds(20000);assert.equal(e.getState().wallet.availableCents,120000);
  e.close();
 });
 test('baseline buys best cancellable hotel, replaces it and releases funds only on refund arrival',()=>{
  const e=ready();const first=buy(e);assert.equal(first.ok,true);assert.equal(e.getState().wallet.availableCents,54500);
  e.tick(30);const next=buy(e,'b','h03','replace',first.order!.id);assert.equal(next.ok,true);
  assert.equal(e.getState().wallet.exposureCents,77000);
  const cancelled=e.cancel({orderId:first.order!.id,idempotencyKey:'cancel-old'});assert.equal(cancelled.ok,true);
  assert.equal(e.getState().wallet.availableCents,23000);assert.equal(e.getState().wallet.refundPendingCents,45500);
  e.tick(15);assert.equal(e.getState().wallet.availableCents,68500);assert.equal(e.getState().wallet.exposureCents,31500);
  assert.equal(e.lastOrder()!.id,next.order!.id);e.close();
 });
 test('nonrefundable low-price offer requires separate explicit authority and prevents replacing',()=>{
  const e=ready();assert.equal(buy(e,'c','h01').code,'conditions');
  e.updateMandate({allowNonrefundable:true},true);const order=buy(e,'c','h01','nonref');assert.equal(order.ok,true);
  e.tick(30);assert.equal(buy(e,'b','h03','replace',order.order!.id).code,'nonrefundable');
  assert.equal(e.cancel({orderId:order.order!.id,idempotencyKey:'cancel'}).code,'cancellation_expired');e.close();
 });
 test('a comment matters differently for different users and prompt-injection text cannot change permissions',()=>{
  const e=ready('prompt_injection');const {quote,reviews}=e.detail('a','h02');assert.equal(e.evaluate(quote,reviews).eligible,false);
  e.updateMandate({forbiddenIssues:['hygiene','smell'],issueWeights:{hygiene:5,noise:0,smell:4,maintenance:3,service:2,breakfast:0}},true);
  const permissive=e.evaluate(e.detail('a','h02').quote);assert.equal(permissive.eligible,true);assert.equal(permissive.risk,0);
  const injection=e.evaluate(e.detail('a','h01').quote);assert.equal(injection.eligible,true);assert.ok(injection.reasons.some(s=>s.includes('未执行其中任何指令')));
  assert.equal(e.getState().mandate.allowNonrefundable,false);assert.equal(e.getState().mandate.budgetCents,100000);e.close();
 });
 test('stale quote, stale authorization and deadline boundary are blocked without deductions',()=>{
  const e=ready();let q=e.detail('a','h01').quote;let version=e.getState().mandate.version;e.tick(1);
  assert.equal(e.book({quoteId:q.id,idempotencyKey:'stalequote',mandateVersion:version}).code,'quote_changed');
  e.updateMandate({},true);q=e.detail('a','h01').quote;
  assert.equal(e.book({quoteId:q.id,idempotencyKey:'staleauth',mandateVersion:version}).code,'authorization_version');
  e.tick(179);q=e.detail('a','h01').quote;version=e.getState().mandate.version;
  assert.equal(e.book({quoteId:q.id,idempotencyKey:'deadline',mandateVersion:version}).code,'deadline');
  assert.equal(e.getState().wallet.availableCents,100000);e.close();
 });
 test('tax spike and sold out stock are enforced using current checkout quote',()=>{
  const e=ready('tax_spike');e.tick(30);const quote=e.detail('a','h01').quote;assert.equal(quote.totalCents,155500);
  assert.equal(buy(e).code,'conditions');assert.equal(e.getState().wallet.availableCents,100000);e.close();
  const sold=ready('sold_out');sold.tick(30);assert.equal(buy(sold,'b','h03').code,'conditions');sold.close();
 });
 test('idempotency prevents repeated charges and rejects key reuse for a different request',()=>{
  const e=ready();const quote=e.detail('a','h01').quote;const request:BookingRequest={quoteId:quote.id,idempotencyKey:'same',mandateVersion:e.getState().mandate.version};
  const first=e.book(request);assert.deepEqual(e.book(request),first);assert.equal(e.getState().orders.length,1);assert.equal(e.getState().wallet.availableCents,54500);
  assert.equal(e.book({...request,quoteId:'other'}).code,'idempotency_conflict');e.close();
 });
 test('temporary exposure, savings, risk and refund-pending protection are backend rules',()=>{
  const e=ready();const first=buy(e);e.tick(30);e.updateMandate({peakCents:70000},true);
  assert.equal(buy(e,'b','h03','peak',first.order!.id).code,'peak_limit');
  e.updateMandate({peakCents:120000,minSavingsCents:20000},true);
  assert.equal(buy(e,'b','h03','savings',first.order!.id).code,'savings_threshold');
  e.updateMandate({minSavingsCents:5000},true);const next=buy(e,'b','h03','good',first.order!.id);assert.equal(next.ok,true);
  e.cancel({orderId:first.order!.id,idempotencyKey:'cancel'});
  assert.equal(buy(e,'a','h03','pending',next.order!.id).code,'refund_pending');e.addFunds(50000);
  assert.equal(buy(e,'a','h03','pending2',next.order!.id).code,'refund_pending');e.close();
 });
 test('cancel failure preserves original lodging and permits compensation after revocation',()=>{
  const e=ready('cancel_failure');const first=buy(e);e.tick(30);const next=buy(e,'b','h03','replace',first.order!.id);
  assert.equal(e.cancel({orderId:first.order!.id,idempotencyKey:'cancel'}).code,'merchant_cancel_failure');
  e.revoke();assert.equal(buy(e,'a','h03','forbidden').code,'authorization_required');
  assert.equal(e.cancel({orderId:next.order!.id,idempotencyKey:'compensate',compensation:true}).ok,true);
  assert.equal(e.lastOrder()!.id,first.order!.id);e.tick(15);assert.equal(e.getState().wallet.availableCents,54500);e.close();
 });
 test('refund failure and refund delay retain exposure instead of inventing available funds',()=>{
  for(const scenario of ['refund_delay','refund_failure']) {
    const e=ready(scenario);const first=buy(e);e.tick(30);buy(e,'b','h03','replacement',first.order!.id);e.cancel({orderId:first.order!.id,idempotencyKey:'cancel'});e.tick(15);
    assert.equal(e.getState().wallet.refundPendingCents,45500);assert.equal(e.getState().wallet.availableCents,23000);
    if(scenario==='refund_failure')assert.ok(e.getState().agent.error?.includes('退款失败'));else {e.tick(105);assert.equal(e.getState().wallet.availableCents,68500);}
    e.close();
  }
 });
 test('cancellation boundary and missing opening information cannot be treated as compliant',()=>{
  const e=ready();assert.equal(e.evaluate(e.detail('a','h19').quote).eligible,false);const first=buy(e);e.tick(30);buy(e,'b','h03','replace',first.order!.id);
  e.tick(690);assert.equal(e.getState().clock.now,BASE_TIME+12*HOUR);
  assert.equal(e.cancel({orderId:first.order!.id,idempotencyKey:'late'}).code,'cancellation_expired');e.close();
 });
 test('no-solution deadline provides at most three condition sets without spending',()=>{
  const e=ready('no_solution');assert.equal(e.evaluate(e.detail('a','h01').quote).eligible,false);e.setCandidates(e.list('a').map(({hotel})=>{const detail=e.detail('a',hotel.id);return e.evaluate(detail.quote,detail.reviews);}));e.tick(180);
  assert.equal(e.getState().alternatives.length,3);assert.ok(e.getState().alternatives.every(a=>a.changes.some(s=>s.includes('重新确认'))));
  assert.equal(e.getState().orders.length,0);assert.equal(e.getState().wallet.availableCents,100000);e.close();
 });
 test('SQLite restart keeps wallet, order, idempotency and verifiable audit hash chain',()=>{
  const directory=mkdtempSync(join(tmpdir(),'staypilot-test-'));const path=join(directory,'state.sqlite');let e=new Engine(path);e.updateMandate({},true);
  const quote=e.detail('a','h01').quote;const req={quoteId:quote.id,idempotencyKey:'persistent',mandateVersion:e.getState().mandate.version};const result=e.book(req);e.close();
  e=new Engine(path);assert.equal(e.getState().wallet.availableCents,54500);assert.equal(e.book(req).order!.id,result.order!.id);
  let previousHash='0'.repeat(64);for(const event of e.getState().events) {const {hash,...payload}=event;assert.equal(payload.previousHash,previousHash);assert.equal(createHash('sha256').update(JSON.stringify(payload)).digest('hex'),hash);previousHash=hash;}
  e.close();rmSync(directory,{recursive:true,force:true});
 });

 test('cancellation rechecks authority while compensation remains possible',()=>{
  const e=ready();const first=buy(e);e.tick(30);const next=buy(e,'b','h03','replace',first.order!.id);e.revoke();
  assert.equal(e.cancel({orderId:first.order!.id,idempotencyKey:'revoked-cancel'}).code,'authorization_required');
  assert.equal(e.cancel({orderId:next.order!.id,idempotencyKey:'compensate',compensation:true}).ok,true);e.close();
 });
 test('deadline without observed details gives no invented candidate suggestions',()=>{
  const e=ready('no_solution');e.tick(180);assert.equal(e.getState().alternatives.length,0);assert.ok(e.getState().agent.phase.includes('观察不足'));e.close();
 });
 test('reserved rooms remain sold out after clock advances',()=>{
  const e=ready();assert.equal(e.detail('a','h01').quote.inventory,1);buy(e);e.tick(5);assert.equal(e.detail('a','h01').quote.inventory,0);e.close();
 });

 test('invalid calendar dates cannot create an authorization or change funds',()=>{
  const e=ready();const version=e.getState().mandate.version;
  assert.throws(()=>e.updateMandate({checkOut:'2026-99-99'},true),/有效日期/);
  assert.throws(()=>e.updateMandate({checkIn:'2026-02-30'},true),/有效日期/);
  assert.equal(e.getState().mandate.version,version);assert.equal(e.getState().wallet.availableCents,100000);e.close();
 });

 test('unresolved two-order ledger independently freezes third payment after clearing UI error',()=>{
  const e=ready();const first=buy(e);e.tick(30);const next=buy(e,'b','h03','replace',first.order!.id);assert.equal(next.ok,true);
  e.addFunds(100000);e.updateMandate({peakCents:300000},true);e.setAgent({error:null});assert.equal(e.hasLedgerFreeze(),true);
  assert.equal(buy(e,'a','h03','third',next.order!.id).code,'transaction_frozen');assert.equal(e.getState().orders.length,2);e.close();
 });
 test('all new spending stops during a pending refund even if UI error is cleared and wallet topped up',()=>{
  const e=ready();const first=buy(e);e.tick(30);const next=buy(e,'b','h03','replace',first.order!.id);e.cancel({orderId:first.order!.id,idempotencyKey:'cancel'});
  e.addFunds(100000);e.updateMandate({peakCents:300000},true);e.setAgent({error:null});assert.equal(e.hasLedgerFreeze(),false);
  assert.equal(buy(e,'a','h05','unrelated').code,'refund_pending');assert.equal(buy(e,'a','h03','third',next.order!.id).code,'refund_pending');e.close();
 });
 test('failed refund retains ledger freeze after clearing agent error',()=>{
  const e=ready('refund_failure');const first=buy(e);e.tick(30);const next=buy(e,'b','h03','replace',first.order!.id);e.cancel({orderId:first.order!.id,idempotencyKey:'cancel'});e.tick(15);
  e.setAgent({error:null});assert.equal(e.hasLedgerFreeze(),true);assert.equal(buy(e,'a','h03','attempt',next.order!.id).code,'transaction_frozen');e.close();
 });
 test('public deadline alternatives refresh only observed evidence and exclude forbidden smell',()=>{
  const e=ready('no_solution');e.tick(180);assert.deepEqual(e.publishAlternatives(),[]);
  const observed=['h01','h03','h05','h15'].map(id=>{const d=e.detail('a',id);return e.evaluate(d.quote,d.reviews);});e.setCandidates(observed);
  const alternatives=e.publishAlternatives();assert.equal(alternatives.length,3);assert.ok(alternatives.every(a=>a.hotelId!=='h15'));assert.ok(alternatives.every(a=>a.changes.some(s=>s.includes('重新确认'))));e.close();
 });

 test('audit snapshots remain immutable and hash-valid after rebooking, cancellation and refund mutations',()=>{
  const e=ready();const first=buy(e);e.tick(30);buy(e,'b','h03','replacement',first.order!.id);e.cancel({orderId:first.order!.id,idempotencyKey:'cancel'});e.tick(15);
  const events=e.getState().events;
  const originalBooking=events.find(event=>event.type==='trade'&&(event.data as {order?:{id:string}})?.order?.id===first.order!.id)!;
  assert.equal((originalBooking.data as {order:{status:string}}).order.status,'confirmed');
  assert.equal(e.getState().orders[0].status,'refunded');
  let previousHash='0'.repeat(64);
  for(const event of events){const {hash,...payload}=event;assert.equal(payload.previousHash,previousHash);assert.equal(createHash('sha256').update(JSON.stringify(payload)).digest('hex'),hash);previousHash=hash;}
  e.close();
 });
