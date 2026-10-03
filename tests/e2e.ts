import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { State, TradeResult } from '../shared/types.ts';
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:4173';
let cookie=''; const checks:{name:string;result:string;detail?:unknown}[]=[];
async function api<T>(path:string,payload?:unknown):Promise<T>{
 const response=await fetch(origin+path,{method:payload===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(payload===undefined?{}:{body:JSON.stringify(payload)})});
 const setCookie=response.headers.get('set-cookie');if(setCookie)cookie=setCookie.split(';')[0];
 const body=await response.json();assert(response.ok,JSON.stringify(body));return body as T;
}
const state=()=>api<State>('/api/state');
const pass=(name:string,detail?:unknown)=>{checks.push({name,result:'passed',detail});console.log(`PASS ${name}`);};
async function agentRun(){await api('/api/agent/run',{});const started=Date.now();while(Date.now()-started<180000){const s=await state();if(!s.agent.running){assert.equal(s.agent.error,null,s.agent.error||'');return s;}await new Promise(r=>setTimeout(r,500));}throw new Error('Browser agent timeout');}
mkdirSync('docs/screenshots',{recursive:true});
await state();await api('/api/reset',{scenario:'baseline'});await api('/api/mandate',{patch:{},confirm:true});
const first=await agentRun();assert.equal(first.orders.length,1);assert.equal(first.orders[0].hotelId,'h01');assert.equal(first.orders[0].platform,'a');assert.equal(first.wallet.availableCents,54500);
assert(first.events.filter(e=>e.type==='browse').length===3);assert(first.events.filter(e=>e.type==='review').length>=15);assert(first.events.some(e=>e.screenshot));pass('实际浏览三平台、读取评论并自动订到可取消房',{hotel:first.orders[0].hotelName,totalCents:first.orders[0].paidCents,browsePages:3});
await api('/api/clock',{minutes:30});const swapped=await agentRun();assert.equal(swapped.orders.length,2);assert.equal(swapped.orders[1].hotelId,'h03');assert.equal(swapped.orders[1].platform,'b');assert.equal(swapped.orders[0].status,'refund_pending');assert.equal(swapped.wallet.exposureCents,77000);assert.equal(swapped.wallet.availableCents,23000);pass('浏览器先新订再取消旧单，退款期间真实占款',{paidCents:77000,availableCents:23000});
await api('/api/clock',{minutes:15});const settled=await state();assert.equal(settled.wallet.refundPendingCents,0);assert.equal(settled.wallet.availableCents,68500);assert.equal(settled.orders[0].status,'refunded');pass('退款实际到账才释放余额',{finalCostCents:31500,savingsCents:14000});
const audit=await api<{hashChainVerified:boolean}>('/api/audit/export');assert.equal(audit.hashChainVerified,true);pass('完整审计日志哈希链验证');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
await context.addCookies([{name:'staypilot_session',value:cookie.split('=')[1],url:origin,httpOnly:true,sameSite:'Lax'}]);
const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(origin,{waitUntil:'networkidle'});await page.getByRole('button',{name:'订单与决策',exact:true}).click();await page.screenshot({path:'docs/screenshots/decision-console.png',fullPage:false});
await page.getByRole('button',{name:/^酒店比较/}).click();await page.screenshot({path:'docs/screenshots/comparison.png',fullPage:false});
for(const p of ['a','b','c']){await page.goto(`${origin}/platform/${p}`,{waitUntil:'networkidle'});await page.locator('[data-hotel-id]').first().waitFor();assert.equal(await page.locator('[data-hotel-id]').count(),20);await page.screenshot({path:`docs/screenshots/platform-${p}.png`,fullPage:false});}
pass('三个独立平台页面均展示20家酒店，页面无运行异常');
// Exercise actual checkout UI for fee spike, revocation and irrevocable room authority.
await api('/api/reset',{scenario:'tax_spike'});await api('/api/mandate',{patch:{},confirm:true});
await page.goto(`${origin}/platform/a/hotel/h01`,{waitUntil:'networkidle'});await api('/api/clock',{minutes:30});await page.goto(`${origin}/platform/a/checkout/h01`,{waitUntil:'networkidle'});
await page.getByRole('button',{name:'确认支付并预订',exact:true}).click();await page.locator('[data-trade-result]').waitFor();let result=JSON.parse((await page.locator('[data-trade-result]').getAttribute('data-trade-result'))!) as TradeResult;assert.equal(result.ok,false);assert.equal((await state()).wallet.availableCents,100000);await page.screenshot({path:'docs/screenshots/budget-blocked.png',fullPage:false});pass('真实结算页税费超预算被阻止，钱包未扣款',result.reason);
await api('/api/reset',{scenario:'baseline'});await api('/api/mandate',{patch:{},confirm:true});await api('/api/revoke',{});await page.goto(`${origin}/platform/a/checkout/h01`,{waitUntil:'networkidle'});await page.getByRole('button',{name:'确认支付并预订',exact:true}).click();await page.locator('[data-trade-result]').waitFor();result=JSON.parse((await page.locator('[data-trade-result]').getAttribute('data-trade-result'))!);assert.equal(result.ok,false);pass('撤销授权后网页下单被阻止');
await api('/api/reset',{scenario:'baseline'});await api('/api/mandate',{patch:{allowNonrefundable:true},confirm:true});await page.goto(`${origin}/platform/c/checkout/h01`,{waitUntil:'networkidle'});await page.getByRole('button',{name:'确认支付并预订',exact:true}).click();await page.locator('[data-trade-result]').waitFor();result=JSON.parse((await page.locator('[data-trade-result]').getAttribute('data-trade-result'))!);assert.equal(result.ok,true);assert.equal(result.order?.quote.cancellation,'nonrefundable');assert.equal((await state()).agent.monitoring,false);pass('单独授权不可取消房后可支付，随后停止换订');
await page.setViewportSize({width:390,height:844});await page.goto(origin,{waitUntil:'networkidle'});const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert(dimensions.scroll<=dimensions.width+1,JSON.stringify(dimensions));await page.screenshot({path:'docs/screenshots/mobile.png',fullPage:false});pass('手机视口无横向溢出');
assert.deepEqual(errors,[]);await context.close();await browser.close();
writeFileSync(resolve('docs/browser-verification.json'),JSON.stringify({executedAt:new Date().toISOString(),environment:'真实Chrome网页操作；虚构酒店与测试资金',checks},null,2));
console.log(`${checks.length} browser integration checks passed.`);
