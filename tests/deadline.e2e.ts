import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AuditEvent, State, TradeResult } from '../shared/types.ts';

const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:4173';
const checks: {name:string; result:'passed'|'failed'; detail?:unknown}[] = [];
let cookie = '';
const startedAt = new Date().toISOString();
const output = resolve('docs/deadline-verification.json');

async function api<T>(path:string, payload?:unknown):Promise<T> {
  const response = await fetch(origin + path, {
    method: payload === undefined ? 'GET' : 'POST',
    headers: {'Content-Type':'application/json', ...(cookie ? {Cookie:cookie} : {})},
    ...(payload === undefined ? {} : {body:JSON.stringify(payload)}),
  });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const body = await response.json();
  assert(response.ok, `${path}: ${JSON.stringify(body)}`);
  return body as T;
}
const getState = () => api<State>('/api/state');
function pass(name:string, detail?:unknown) {
  checks.push({name,result:'passed',detail});
  console.log(`PASS ${name}`);
}
async function awaitRunAt(time:number):Promise<State> {
  const start = Date.now();
  while (Date.now() - start < 180000) {
    const current = await getState();
    if (!current.agent.running && current.agent.lastRunAt === time) {
      assert.equal(current.agent.error, null, current.agent.error || '');
      return current;
    }
    await new Promise(r => setTimeout(r,500));
  }
  throw new Error(`最终网页观察未在180秒内完成；目标仿真时间 ${new Date(time).toISOString()}`);
}
function verifyChain(events:AuditEvent[]) {
  let previous = '0'.repeat(64);
  for (const event of events) {
    const {hash,...record} = event;
    assert.equal(record.previousHash,previous,`事件 #${event.sequence} 前序哈希不匹配`);
    assert.equal(createHash('sha256').update(JSON.stringify(record)).digest('hex'),hash,`事件 #${event.sequence} 内容哈希不匹配`);
    previous = hash;
  }
  return previous;
}

mkdirSync('docs',{recursive:true});
try {
  // Every request stays within a newly created isolated demonstration session.
  await getState();
  await api('/api/reset',{scenario:'no_solution'});
  const authorized = await api<State>('/api/mandate',{patch:{},confirm:true});
  assert(authorized.mandate.confirmed);
  assert(!authorized.mandate.revoked);
  assert.equal(authorized.orders.length,0);
  const deadline = authorized.mandate.firstDeadline;
  const finalObservationAt = deadline - 60000;
  const initialTime = authorized.clock.now;
  const initialWallet = structuredClone(authorized.wallet);
  assert(initialTime < finalObservationAt);
  await api('/api/agent/monitor',{enabled:true});
  const initialObserved = await awaitRunAt(initialTime);
  assert.equal(initialObserved.orders.length,0);
  assert.equal(initialObserved.agent.monitoring,true);
  assert(initialObserved.candidates.length > 0);
  assert(initialObserved.candidates.every(c=>!c.eligible));
  pass('独立截止无解会话完成初轮真实网页浏览，无越权订单',{
    scenario:initialObserved.scenario,
    candidateQuotes:initialObserved.candidates.length,
    observedPages:initialObserved.events.filter(e=>e.type==='browse').length,
    budgetCents:initialObserved.mandate.budgetCents,
  });

  const crossingMinutes = (deadline-initialTime)/60000 + 30;
  const clamped = await api<State>('/api/clock',{minutes:crossingMinutes});
  assert.equal(clamped.clock.now,finalObservationAt,'跨过截止的推进必须先钳到截止前1分钟');
  assert.equal(clamped.orders.length,0);
  assert(clamped.events.some(e=>e.type==='deadline_guard'&&e.time===finalObservationAt));
  pass('manual advance跨过截止时先钳到截止前1分钟，并生成deadline_guard',{
    requestedMinutes:crossingMinutes,
    clampedAt:new Date(clamped.clock.now).toISOString(),
    deadline:new Date(deadline).toISOString(),
  });

  const finalObserved = await awaitRunAt(finalObservationAt);
  const finalEvents = finalObserved.events.filter(e=>e.time===finalObservationAt);
  const finalBrowse = finalEvents.filter(e=>e.type==='browse');
  const finalReviews = finalEvents.filter(e=>e.type==='review');
  assert.equal(finalBrowse.length,3,'最后核验必须实际浏览三个商户网页');
  assert(finalReviews.length>=15,'最后核验必须实际读取至少15家平台酒店详情与评论');
  assert(finalBrowse.every(e=>Boolean(e.screenshot)),'每个平台观察应具备真实浏览截图');
  assert(finalObserved.candidates.every(c=>c.quote.observedAt===finalObservationAt));
  assert.equal(finalObserved.orders.length,0);
  assert.equal(finalObserved.agent.monitoring,true);
  assert.equal(finalObserved.agent.lastRunAt,finalObservationAt);
  pass('最后一轮BrowserAgent观察完成，三平台截图与评论证据均来自截止前1分钟',{
    pages:finalBrowse.length,
    hotelReviewReads:finalReviews.length,
    observedAt:new Date(finalObservationAt).toISOString(),
    screenshots:finalBrowse.map(e=>e.screenshot?.replace(/^\/evidence\/[^/]+\//,'/evidence/<isolated-test-session>/')),
  });

  const atDeadline = await api<State>('/api/clock',{minutes:1});
  assert.equal(atDeadline.clock.now,deadline);
  assert.equal(atDeadline.orders.length,0);
  assert.equal(atDeadline.agent.monitoring,false);
  assert.equal(atDeadline.agent.running,false);
  assert(atDeadline.events.some(e=>e.type==='deadline'));
  assert(atDeadline.alternatives.length>0&&atDeadline.alternatives.length<=3);
  const alternativeEvidence = atDeadline.alternatives.map(alternative=>{
    const candidate = atDeadline.candidates.find(c=>c.hotel.id===alternative.hotelId&&c.quote.platform===alternative.platform);
    assert(candidate,`方案 ${alternative.hotelName} 没有已观察的网页候选`);
    assert(candidate.evidence.length>0,`方案 ${alternative.hotelName} 没有评论原文`);
    assert.equal(candidate.quote.observedAt,finalObservationAt);
    assert.equal(candidate.quote.totalCents,alternative.totalCents);
    assert(alternative.changes.length>0);
    assert(alternative.changes.some(change=>change.includes('重新确认授权')));
    assert(alternative.reasons.some(reason=>reason.includes('已读取网页')));
    const reviewEvent = finalReviews.find(event=>{
      const data = event.data as {hotelId?:string;platform?:string;reviewIds?:string[]}|undefined;
      return data?.hotelId===alternative.hotelId&&data.platform===alternative.platform;
    });
    assert(reviewEvent,`方案 ${alternative.hotelName} 没有最终网页读取日志`);
    const reviewIds = (reviewEvent.data as {reviewIds:string[]}).reviewIds;
    assert(candidate.evidence.every(review=>reviewIds.includes(review.id)));
    return {hotelId:alternative.hotelId,hotelName:alternative.hotelName,platform:alternative.platform,totalCents:alternative.totalCents,changes:alternative.changes,reviewIds,reviewEventSequence:reviewEvent.sequence};
  });
  pass('抵达截止立即停止购买，并输出最多三套有最终网页评论依据的条件组合',{
    alternatives:alternativeEvidence,
    wallet:atDeadline.wallet,
    monitoring:atDeadline.agent.monitoring,
  });

  const beforeExtra = atDeadline.events.length;
  const later = await api<State>('/api/clock',{minutes:30});
  assert.equal(later.clock.now,deadline+30*60000);
  assert.equal(later.orders.length,0);
  assert.equal(later.agent.monitoring,false);
  assert.equal(later.agent.running,false);
  assert.deepEqual(later.wallet,initialWallet);
  assert.equal(later.events.slice(beforeExtra).filter(e=>e.type==='browse').length,0);
  const visible = await api<{hotel:unknown;quote:{id:string}}>(`/api/platform/a/hotel/${alternativeEvidence[0].hotelId}`);
  const rejected = await api<TradeResult>('/api/book',{
    quoteId:visible.quote.id,
    idempotencyKey:`deadline-test-${createHash('sha256').update(cookie).digest('hex').slice(0,12)}`,
    mandateVersion:later.mandate.version,
  });
  assert.equal(rejected.ok,false);
  assert.equal(rejected.code,'deadline');
  const blocked = await getState();
  assert.equal(blocked.orders.length,0);
  assert.deepEqual(blocked.wallet,initialWallet);
  pass('截止后继续推进不重启观察；直接下单也被服务端deadline规则阻止',{
    clock:new Date(later.clock.now).toISOString(),
    code:rejected.code,
    reason:rejected.reason,
    walletUnchanged:true,
  });

  const exported = await api<State&{hashChainVerified:boolean}>('/api/audit/export');
  assert.equal(exported.hashChainVerified,true);
  const finalHash = verifyChain(exported.events);
  pass('完整审计哈希链由导出接口与测试独立重算双重验证',{
    eventCount:exported.events.length,
    hashChainVerified:exported.hashChainVerified,
    finalHash,
    deadlineGuardEvents:exported.events.filter(e=>e.type==='deadline_guard').map(e=>({sequence:e.sequence,time:e.time,title:e.title})),
  });
  writeFileSync(output,JSON.stringify({
    startedAt,executedAt:new Date().toISOString(),origin,
    environment:'独立测试会话；BrowserAgent实际操作Chrome网页；酒店、评论与资金均为仿真数据',
    sessionFingerprint:createHash('sha256').update(cookie).digest('hex').slice(0,12),
    passed:true,checks,
  },null,2));
  console.log(`${checks.length} deadline boundary integration checks passed. ${output}`);
} catch(error) {
  checks.push({name:'截止边界核验执行',result:'failed',detail:error instanceof Error?error.stack:String(error)});
  writeFileSync(output,JSON.stringify({startedAt,executedAt:new Date().toISOString(),origin,passed:false,checks},null,2));
  throw error;
}
