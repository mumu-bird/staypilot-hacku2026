import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync,readFileSync,rmdirSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import type {WorkflowResult} from '../shared/live-workflow.ts';
import type {State} from '../shared/types.ts';
import {defaultWorkflowPolicy} from '../server/live-workflow.ts';
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:4173';let cookie='';
async function call(path:string,payload?:unknown,expected=200){const r=await fetch(origin+path,{method:payload===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(payload===undefined?{}:{body:JSON.stringify(payload)})});const set=r.headers.get('set-cookie');if(set)cookie=set.split(';')[0];const value=await r.json();assert.equal(r.status,expected,JSON.stringify(value));return value;}
const query={destination:'北京',poi:'雍和宫',checkIn:'2026-10-09',checkOut:'2026-10-10',adultCount:2,roomCount:1,childCount:0,size:10};
const checks:{name:string;result:string;detail?:unknown}[]=[];function pass(name:string,detail?:unknown){checks.push({name,result:'passed',detail});console.log('PASS '+name);}
mkdirSync('docs/cases',{recursive:true});
const before=await call('/api/state') as State;
const probe='core-io-'+randomUUID()+'.json';mkdirSync('dist/'+probe);try{await call('/'+probe,undefined,400);await call('/api/state');pass('静态文件读取失败返回错误而不崩溃，后续会话接口仍可用');}finally{rmdirSync('dist/'+probe);}

const reuse=process.argv.includes('--reuse-observations');
const recorded:WorkflowResult=reuse?JSON.parse(readFileSync('docs/cases/yonghegong-iteration-recorded.json','utf8')):await call('/api/live/workflow/run',{mode:'recorded',query,policy:defaultWorkflowPolicy,queryOnly:true,useJev:true}) as WorkflowResult;
assert.equal(recorded.candidates.length,3);assert.equal(recorded.transactionEnabled,false);assert.equal(recorded.recommendation,null);assert.equal(recorded.alternatives.length,3);
assert(recorded.jev,'Merged real Jev request must succeed');assert.equal(recorded.jev.evidenceHash,recorded.evidenceHash);
let previous='0'.repeat(64);for(const t of recorded.trace){const {hash,...record}=t;assert.equal(record.previousHash,previous);assert.equal(createHash('sha256').update(JSON.stringify(record)).digest('hex'),hash);previous=hash;}
writeFileSync('docs/cases/yonghegong-iteration-recorded.json',JSON.stringify(recorded,null,2));pass('历史真实证据自动汇总、规则评估、条件组合、Jev真实调用与独立哈希核验',{model:recorded.jev.model,candidates:3,alternatives:3});
const live:WorkflowResult=reuse?JSON.parse(readFileSync('docs/cases/yonghegong-iteration-live.json','utf8')):await call('/api/live/workflow/run',{mode:'live',query,policy:defaultWorkflowPolicy,queryOnly:true,useJev:false}) as WorkflowResult;
assert(live.candidates.length>0);assert(live.candidates.some(d=>d.candidate.source==='RollingGo MCP'));assert(live.candidates.some(d=>d.candidate.source==='飞猪 FlyAI'));assert(live.candidates.some(d=>d.candidate.rooms.length>0));assert(live.candidates.some(d=>d.candidate.route));assert(live.candidates.every(d=>!d.bookable));
writeFileSync('docs/cases/yonghegong-iteration-live.json',JSON.stringify(live,null,2));pass('实时双源查询、地图核验、房型检查与自动规则评估',{candidates:live.candidates.length,maps:live.candidates.filter(d=>d.candidate.route).length,roomHotels:live.candidates.filter(d=>d.candidate.rooms.length).length,errors:live.errors,elapsedMs:Date.parse(live.completedAt)-Date.parse(live.startedAt)});
for(const provider of ['fliggy','rollinggo']){const blocked=await call('/api/live/'+provider+'/book',{},403);assert.equal(blocked.orderCreated,false);}
const after=await call('/api/state') as State;assert.deepEqual(after.wallet,before.wallet);assert.equal(after.orders.length,before.orders.length);pass('两个真实购买入口实际阻断，钱包与订单未变');
await call('/api/reset',{scenario:'baseline'});await call('/api/mandate',{patch:{},confirm:true});
async function runAgent(){await call('/api/agent/run',{});const start=Date.now();while(Date.now()-start<180000){const s=await call('/api/state') as State;if(!s.agent.running){assert.equal(s.agent.error,null);return s;}await new Promise(r=>setTimeout(r,500));}throw new Error('Simulation browser timeout');}
const first=await runAgent();assert.equal(first.orders.length,1);assert.equal(first.orders[0].paidCents,45500);assert(first.events.some(e=>e.screenshot));pass('仿真网页自主初筛、评论、跨平台比较、结算与确认订单',{totalCents:first.orders[0].paidCents,platform:first.orders[0].platform});
await call('/api/clock',{minutes:30});const swap=await runAgent();assert.equal(swap.orders.length,2);assert.equal(swap.orders[1].paidCents,31500);assert.equal(swap.wallet.refundPendingCents,45500);assert.equal(swap.wallet.availableCents,23000);pass('先订新后退旧，退款未到账期间保留真实测试占款',{exposureCents:swap.wallet.exposureCents,availableCents:swap.wallet.availableCents});
await call('/api/clock',{minutes:15});const refund=await call('/api/state') as State;assert.equal(refund.wallet.refundPendingCents,0);assert.equal(refund.wallet.availableCents,68500);pass('退款到账释放余额，最终住宿成本315元',{realizedCostCents:refund.wallet.realizedCostCents,exposureCents:refund.wallet.exposureCents});
const audit=await call('/api/audit/export');assert.equal(audit.hashChainVerified,true);pass('交易审计哈希链核验');
await call('/api/reset',{scenario:'tax_spike'});await call('/api/mandate',{patch:{},confirm:true});await call('/api/clock',{minutes:30});const taxBefore=await call('/api/state') as State;const detail=await call('/api/platform/a/hotel/h01');assert.equal(detail.quote.totalCents,155500);const denied=await call('/api/book',{quoteId:detail.quote.id,idempotencyKey:'core-tax-block',mandateVersion:taxBefore.mandate.version});assert.equal(denied.ok,false);const tax=await call('/api/state') as State;assert.equal(tax.orders.length,0);assert.equal(tax.wallet.availableCents,100000);pass('仿真税费超额的1555元结算报价被服务端实际阻断，订单和钱包不变',{reason:denied.reason});
writeFileSync('docs/cases/core-flow-verification.json',JSON.stringify({executedAt:new Date().toISOString(),reusedObservations:reuse,realObservationCompletedAt:live.completedAt,jevObservationCompletedAt:recorded.completedAt,scope:'真实只读评估＋独立仿真酒店测试资金交易；没有真实付款',realCase:query,simulationScenario:'baseline/tax_spike 原仿真杭州目录，非北京真实酒店',checks},null,2));
console.log(checks.length+' core integration checks passed.');
