import { chromium, type Browser, type Page } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import type { Evaluation, Hotel, Platform, Quote, Review, State, TradeResult } from '../shared/types.ts';
import { PLATFORM_LABELS, money } from '../shared/types.ts';

const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:4173';
const executable=process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const scenario='baseline';
const intentHotels=['h01','h03','h05'];
const browserKinds=new Set(['browse','review','checkout','browser_booked','browser_blocked','browser_cancel']);
type Operation={sequence:number;kind:string;label:string;wallTimeOffsetMs:number};
type Observation={hotel:Hotel;quote:Quote;reviews:Review[]};
type RouteResult={route:string;label:string;operations:Operation[];operationCount:number;initialBookingMs:number;optimizationMs:number;activeExecutionMs:number;initialCostCents:number;finalCostCents:number;savingsCents:number;peakExposureCents:number;finalAvailableCents:number;simulationElapsedMinutes:number;orderIds:string[];auditEventCount:number;observedReviewCount:number};

class Session {
 cookie='';
 async api<T>(path:string,payload?:unknown):Promise<T> {
  const response=await fetch(origin+path,{method:payload===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(this.cookie?{Cookie:this.cookie}:{})},...(payload===undefined?{}:{body:JSON.stringify(payload)})});
  const setCookie=response.headers.get('set-cookie');if(setCookie)this.cookie=setCookie.split(';')[0];
  const data=await response.json();assert(response.ok,JSON.stringify(data));return data as T;
 }
 state(){return this.api<State>('/api/state');}
 async setup(){await this.state();await this.api('/api/reset',{scenario});return this.api<State>('/api/mandate',{patch:{},confirm:true});}
}
const elapsed=(start:number)=>Math.round(performance.now()-start);

function assess({hotel,quote,reviews}:Observation,mandate:State['mandate']) {
 const risk=Object.entries(mandate.issueWeights).reduce((sum,[issue,weight])=>sum+reviews.filter(review=>review.issues.includes(issue as Review['issues'][number])).length/Math.max(1,reviews.length)*weight,0);
 const valid=hotel.openingYear!==null&&hotel.openingYear>=mandate.openingMin&&hotel.walkMinutes<=mandate.walkMax&&quote.score/quote.scoreMax*5>=mandate.minScore
  &&quote.inventory>=quote.rooms&&quote.totalCents<=mandate.budgetCents&&(quote.cancellation!=='nonrefundable'||mandate.allowNonrefundable)
  &&!reviews.some(review=>review.issues.some(issue=>mandate.forbiddenIssues.includes(issue)));
 return {hotel,quote,reviews,risk,valid};
}

async function traditionalReplay():Promise<RouteResult> {
 const session=new Session();const initial=await session.setup();const start=performance.now();
 let browser:Browser|undefined;
 const operations:Operation[]=[];let observedReviewCount=0;
 const record=(kind:string,label:string)=>{operations.push({sequence:operations.length+1,kind,label,wallTimeOffsetMs:elapsed(start)});console.log(`传统路线 ${kind}: ${label}`);};
 try {
  browser=await chromium.launch({headless:true,...(existsSync(executable)?{executablePath:executable}:{}),args:['--disable-dev-shm-usage']});
  const context=await browser.newContext({viewport:{width:1440,height:960}});
  await context.addCookies([{name:'staypilot_session',value:session.cookie.split('=')[1],url:origin,httpOnly:true,sameSite:'Lax'}]);
  const page=await context.newPage();
  const survey=async()=>{
   const observations:Observation[]=[];
   for(const platform of ['a','b','c'] as Platform[]) {
    await page.goto(`${origin}/platform/${platform}`,{waitUntil:'networkidle'});
    await page.locator('[data-hotel-id]').first().waitFor();
    const score=String(initial.mandate.minScore*(platform==='b'?2:1));
    await page.getByLabel('最低评分',{exact:true}).fill(score);
    await Promise.all([page.waitForResponse(response=>{const u=new URL(response.url());return u.pathname===`/api/platform/${platform}/hotels`&&u.searchParams.get('minScore')===score&&response.ok();}),page.getByRole('button',{name:'搜索酒店',exact:true}).click()]);
    record('browse',`${PLATFORM_LABELS[platform]} 搜索高评分住宿`);
    for(const hotelId of intentHotels) {
     await page.goto(`${origin}/platform/${platform}/hotel/${hotelId}`,{waitUntil:'networkidle'});
     await page.locator('[data-visible-quote]').waitFor();
     const visible=await page.locator('[data-visible-quote]').evaluate(el=>({hotel:JSON.parse(el.getAttribute('data-visible-hotel')!),quote:JSON.parse(el.getAttribute('data-visible-quote')!)})) as {hotel:Hotel;quote:Quote};
     const reviews=await page.locator('[data-review]').evaluateAll(nodes=>nodes.map(node=>JSON.parse(node.getAttribute('data-review')!))) as Review[];
     observedReviewCount+=reviews.length;observations.push({...visible,reviews});record('review',`${PLATFORM_LABELS[platform]} 查看 ${visible.hotel.name} 及 ${reviews.length} 条评论`);
    }
   }
   return observations.map(observation=>assess(observation,initial.mandate)).filter(item=>item.valid).sort((a,b)=>a.risk-b.risk||a.quote.totalCents-b.quote.totalCents||a.hotel.walkMinutes-b.hotel.walkMinutes);
  };
  const pay=async(candidate:ReturnType<typeof assess>,replacementFor?:string)=>{
   await page.goto(`${origin}/platform/${candidate.quote.platform}/checkout/${candidate.hotel.id}${replacementFor?`?replacementFor=${replacementFor}`:''}`,{waitUntil:'networkidle'});
   await page.locator('[data-checkout-quote]').waitFor();record('checkout',`核验 ${candidate.hotel.name} 当前结算条款与含税价格`);
   await page.getByRole('button',{name:'确认支付并预订',exact:true}).click();await page.locator('[data-trade-result]').waitFor();
   const result=JSON.parse((await page.locator('[data-trade-result]').getAttribute('data-trade-result'))!) as TradeResult;
   record(result.ok?'browser_booked':'browser_blocked',`提交 ${candidate.hotel.name} 付款：${result.ok?'成功':result.reason}`);assert.equal(result.ok,true,result.reason);return result.order!;
  };
  const first=(await survey())[0];assert.equal(first.hotel.id,'h01');assert.equal(first.quote.platform,'a');
  const firstOrder=await pay(first);const initialBookingMs=elapsed(start);assert.equal(firstOrder.paidCents,45500);
  await session.api('/api/clock',{minutes:30});const optimizationStart=performance.now();
  const options=(await survey()).filter(candidate=>candidate.risk<=first.risk&&candidate.quote.cancellation==='free_until'&&candidate.quote.cancelUntil!==null&&candidate.quote.cancelUntil-(initial.clock.now+30*60000)>=3600000&&firstOrder.paidCents-candidate.quote.totalCents>=initial.mandate.minSavingsCents&&(firstOrder.paidCents-candidate.quote.totalCents)/firstOrder.paidCents*100>=initial.mandate.minSavingsPercent);
  assert.equal(options[0].hotel.id,'h03');assert.equal(options[0].quote.platform,'b');
  const newOrder=await pay(options[0],firstOrder.id);
  const peak=(await session.state()).wallet.exposureCents;assert.equal(peak,77000);
  await page.goto(`${origin}/platform/${firstOrder.platform}/orders`,{waitUntil:'networkidle'});
  await page.locator(`[data-order-id="${firstOrder.id}"]`).getByRole('button',{name:'取消订单',exact:true}).click();
  await page.locator('[data-trade-result]').waitFor();const cancellation=JSON.parse((await page.locator('[data-trade-result]').getAttribute('data-trade-result'))!) as TradeResult;assert.equal(cancellation.ok,true,cancellation.reason);record('browser_cancel',`取消原酒店 ${firstOrder.hotelName}，申请全额退款`);
  const optimizationMs=elapsed(optimizationStart);
  await session.api('/api/clock',{minutes:15});const final=await session.state();assert.equal(final.wallet.availableCents,68500);assert.equal(final.orders[0].status,'refunded');
  return {route:'traditional_replay',label:'传统人工操作路径的浏览器自动化回放',operations,operationCount:operations.length,initialBookingMs,optimizationMs,activeExecutionMs:initialBookingMs+optimizationMs,initialCostCents:firstOrder.paidCents,finalCostCents:newOrder.paidCents,savingsCents:firstOrder.paidCents-newOrder.paidCents,peakExposureCents:peak,finalAvailableCents:final.wallet.availableCents,simulationElapsedMinutes:45,orderIds:final.orders.map(order=>order.id),auditEventCount:final.events.length,observedReviewCount};
 } finally {await browser?.close();}
}

async function autonomousRoute():Promise<RouteResult> {
 const session=new Session();const initial=await session.setup();
 const run=async()=>{const begin=performance.now();await session.api('/api/agent/run',{});while(performance.now()-begin<180000){const state=await session.state();if(!state.agent.running){assert.equal(state.agent.error,null,state.agent.error||'');return {state,ms:elapsed(begin)};}await new Promise(resolve=>setTimeout(resolve,250));}throw new Error('智能体轮次超时');};
 console.log('智能体路线：第一轮实际浏览与初订');const first=await run();assert.equal(first.state.orders[0].hotelId,'h01');assert.equal(first.state.orders[0].paidCents,45500);
 await session.api('/api/clock',{minutes:30});console.log('智能体路线：第二轮浏览、换订与取消');const second=await run();assert.equal(second.state.orders[1].hotelId,'h03');assert.equal(second.state.orders[1].paidCents,31500);assert.equal(second.state.orders[0].status,'refund_pending');const peak=second.state.wallet.exposureCents;assert.equal(peak,77000);
 await session.api('/api/clock',{minutes:15});const final=await session.state();assert.equal(final.wallet.availableCents,68500);
 const browserEvents=final.events.filter(event=>browserKinds.has(event.type));
 const startTime=Date.parse(browserEvents[0]?.realTime||new Date().toISOString());
 const operations=browserEvents.map((event,index)=>({sequence:index+1,kind:event.type,label:event.title,wallTimeOffsetMs:Date.parse(event.realTime)-startTime}));
 const observedReviewCount=final.events.filter(event=>event.type==='review').reduce((sum,event)=>sum+((event.data as {reviewIds?:string[]}).reviewIds?.length??0),0);
 return {route:'autonomous_agent',label:'智能体实际 Playwright 执行',operations,operationCount:operations.length,initialBookingMs:first.ms,optimizationMs:second.ms,activeExecutionMs:first.ms+second.ms,initialCostCents:45500,finalCostCents:31500,savingsCents:14000,peakExposureCents:peak,finalAvailableCents:final.wallet.availableCents,simulationElapsedMinutes:(final.clock.now-initial.clock.now)/60000,orderIds:final.orders.map(order=>order.id),auditEventCount:final.events.length,observedReviewCount};
}

const traditional=await traditionalReplay();const autonomous=await autonomousRoute();
const report={executedAt:new Date().toISOString(),scenario,origin,source:'同一确定性种子市场；虚构酒店、种子评论和测试资金',comparisonMethod:'两个隔离访客会话，相同授权、初始资金¥1000、住宿预算¥1000、占款上限¥1000、仿真时刻09:00→09:30→09:45。传统路线固定3家意向酒店跨3平台检查；智能体自行筛选并阅读至少5家/平台。',operationDefinition:'一次平台搜索、一次酒店详情与评论读取、一次结算核验、一次付款提交、一次取消提交分别计为一个操作。传统路线脚本在执行时记录；智能体取对应真实浏览审计事件。操作数不等于鼠标点击数或人的认知步骤数。',timingLimitations:'实际耗时为Chrome浏览器自动化执行墙钟耗时，包括页面加载、脚本调度及浏览器流程；不是实际人类受试者耗时。传统回放复用一个浏览器，智能体每轮隔离启动浏览器。30/15仿真分钟通过时钟单步推进，不包含真实等待。禁止据此宣称节省了多少真实用户时间。',routes:[traditional,autonomous]};
mkdirSync(resolve('docs'),{recursive:true});writeFileSync(resolve('docs/benchmark.json'),JSON.stringify(report,null,2));
const seconds=(ms:number)=>(ms/1000).toFixed(2);
const md=`# 同市场两条操作路线对照\n\n执行于 ${report.executedAt}。${report.source}。\n\n这是一项**浏览器自动化回放对照，不是真实人工受试者实验**。传统路线按预先写好的购物流程查看湖畔时光、云栖湖滨、柳岸精品三家意向酒店；智能体自主浏览和筛选。两个访客会话独立，使用完全相同的 baseline 市场、授权、预算、测试资金和仿真时刻。\n\n| 记录 | 传统操作路径回放 | 智能体实际执行 |\n| --- | ---: | ---: |\n| 可比浏览操作数 | ${traditional.operationCount} | ${autonomous.operationCount} |\n| 实际读取评论条数（含跨轮重复读取） | ${traditional.observedReviewCount} | ${autonomous.observedReviewCount} |\n| 初订执行耗时 | ${seconds(traditional.initialBookingMs)} 秒 | ${seconds(autonomous.initialBookingMs)} 秒 |\n| 换订执行耗时 | ${seconds(traditional.optimizationMs)} 秒 | ${seconds(autonomous.optimizationMs)} 秒 |\n| 自动化实际执行总耗时 | ${seconds(traditional.activeExecutionMs)} 秒 | ${seconds(autonomous.activeExecutionMs)} 秒 |\n| 初订含税成本 | ${money(traditional.initialCostCents)} | ${money(autonomous.initialCostCents)} |\n| 换订后含税成本 | ${money(traditional.finalCostCents)} | ${money(autonomous.finalCostCents)} |\n| 净节省 | ${money(traditional.savingsCents)} | ${money(autonomous.savingsCents)} |\n| 新旧订单最大占款 | ${money(traditional.peakExposureCents)} | ${money(autonomous.peakExposureCents)} |\n| 退款到账后钱包余额 | ${money(traditional.finalAvailableCents)} | ${money(autonomous.finalAvailableCents)} |\n\n两条路线都完成了：09:00 在栖途旅行购买湖畔时光 ¥455；09:30 在住好 Staywell 新订云栖湖滨 ¥315，随后在原平台取消旧单；09:45 退款实际到账。交易均通过商户网页的付款／取消按钮提交，没有绕过服务端交易守卫。\n\n“操作”指一次平台搜索、一次酒店详情与评论读取、一次结算核验、一次付款提交或一次取消提交。它不是鼠标点击数，也不代表人类认知成本。智能体检查更多酒店和评论，操作数可以更多；该对照没有宣称操作数量必然下降。\n\n耗时仅表示此机器上 Chrome 自动化回放的墙钟时间，包含页面加载、脚本调度和浏览器启动等开销。传统回放复用浏览器，智能体每轮使用隔离浏览器。仿真市场等待时间通过单步推进。**这些秒数不能用来证明真实用户节省了多少时间。**\n\n完整逐步记录见 [benchmark.json](./benchmark.json)。服务运行时可用 \`node --experimental-strip-types scripts/benchmark.ts\` 重现；可通过 TEST_ORIGIN 和 CHROME_PATH 修改服务地址及 Chrome 路径。\n`;
writeFileSync(resolve('docs/benchmark.md'),md);
console.log(JSON.stringify({traditional:{operations:traditional.operationCount,ms:traditional.activeExecutionMs},agent:{operations:autonomous.operationCount,ms:autonomous.activeExecutionMs},finalCostCents:31500,savingsCents:14000},null,2));
