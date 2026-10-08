import {serializeWorkflowDraft,workflowDraftKey} from '../shared/workflow-draft.ts';
import {seedSavedWorkflowFixtures} from './seed-workflow-fixtures.ts';
import {attachXinqiaoAdditionalAnalysis} from '../server/additional-review-source.ts';
import {attachReviewAnalysis} from '../server/review-analysis-binding.ts';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync,existsSync,readFileSync,readdirSync } from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import { resolve } from 'node:path';
import {pathToFileURL} from 'node:url';
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
if(process.env.TEST_SEED_SAVED_CASES==='1')console.log('Test-only saved observation sessions seeded: '+seedSavedWorkflowFixtures());
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
// Live workflow usability checks use the running page and local draft only; no external booking/query is submitted.
await page.goto(`${origin}/live/workflow?lang=en`,{waitUntil:'networkidle'});
await page.getByLabel('City',{exact:true}).fill('杭州');
await page.reload({waitUntil:'networkidle'});
assert.equal(await page.getByLabel('City',{exact:true}).inputValue(),'杭州');
await page.locator('.journey-steps button').nth(1).click();
assert.equal(await page.getByLabel('Allow hotels opened before the preferred year',{exact:true}).isChecked(),false);
await page.getByLabel('Preferred rating (out of 5; optional)',{exact:true}).fill('4.5');
await page.getByLabel('Hard minimum rating (out of 5; optional)',{exact:true}).fill('4.8');
await page.getByText('The hard minimum rating cannot exceed the preferred rating.',{exact:true}).waitFor();
assert.equal(await page.locator('section').filter({has:page.locator('.readonly-consent')}).getByRole('button').last().isDisabled(),true);
await page.getByLabel('Hard minimum rating (out of 5; optional)',{exact:true}).fill('4');
await page.getByLabel('Preferred opening year, no earlier than (optional)',{exact:true}).fill('2020');
await page.getByLabel('Allow hotels opened before the preferred year',{exact:true}).check();
await page.getByLabel('Security problems',{exact:true}).check();
await page.getByRole('button',{name:'Add required facility',exact:true}).click();
await page.getByText('Complete or remove empty facility entries; up to 10 items, 80 characters each.',{exact:true}).waitFor();
await page.getByLabel('Required facility 1',{exact:true}).fill('电梯');
await page.getByLabel('Security importance (0–5)',{exact:true}).fill('5');
await page.reload({waitUntil:'networkidle'});
await page.locator('.journey-steps button').nth(1).click();
assert.equal(await page.getByLabel('Preferred rating (out of 5; optional)',{exact:true}).inputValue(),'4.5');
assert.equal(await page.getByLabel('Hard minimum rating (out of 5; optional)',{exact:true}).inputValue(),'4');
assert.equal(await page.getByLabel('Allow hotels opened before the preferred year',{exact:true}).isChecked(),true);
assert.equal(await page.getByLabel('Security problems',{exact:true}).isChecked(),true);
assert.equal(await page.getByLabel('Required facility 1',{exact:true}).inputValue(),'电梯');
assert.equal(await page.getByLabel('Security importance (0–5)',{exact:true}).inputValue(),'5');
pass('理想评分、硬底线和明确放宽选项可设置并恢复，默认不自动放宽');
assert.equal(await page.locator('.readonly-consent input').isChecked(),false);
await page.locator('.readonly-consent input').check();
await page.locator('section').filter({has:page.locator('.readonly-consent')}).getByRole('button').last().click();
await page.route('**/api/live/workflow/run',route=>route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'证据版本已变化'})}));
await page.getByRole('button',{name:'Run live read-only verification',exact:true}).click();
await page.getByRole('alert').filter({hasText:'The evidence or preference version is no longer valid.'}).first().waitFor();
await page.unroute('**/api/live/workflow/run');
pass('真实流程请求失败显示可操作英文提示，不发送外部请求或自动重试');
await page.locator('.journey-steps button').nth(1).click();
const withdrawalResponse=page.waitForResponse(r=>r.url().endsWith('/api/live/workflow/revoke')&&r.request().method()==='POST');
await page.locator('.readonly-consent input').uncheck();
const withdrawn=await withdrawalResponse;
assert.equal(withdrawn.status(),200);
const withdrawnState=await withdrawn.json();
assert.equal(withdrawnState.monitor.enabled,false);
assert.equal(withdrawnState.monitor.nextCheckAt,null);
assert.equal(withdrawnState.monitor.stopReason,'consent_revoked');
await page.locator('.journey-steps button').nth(2).click();
assert.equal(await page.getByRole('button',{name:'Run live read-only verification',exact:true}).isDisabled(),true);
pass('撤销查询授权实际通知后台停止后续监控并禁用新查询；不调用外部平台');

await page.reload({waitUntil:'networkidle'});
await page.locator('.journey-steps button').nth(1).click();
assert.equal(await page.locator('.readonly-consent input').isChecked(),false);
await page.getByRole('button',{name:'中文',exact:true}).click();
await page.locator('.journey-steps button').nth(0).click();
assert.equal(await page.getByLabel('城市',{exact:true}).inputValue(),'杭州');
const liveDimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert(liveDimensions.scroll<=liveDimensions.width+1,JSON.stringify(liveDimensions));
await page.screenshot({path:'docs/screenshots/live-draft-restoration-mobile.png',fullPage:false});
pass('真实流程页面恢复行程、刷新后重新授权、中英切换保留输入，手机无横向溢出');
// Read the agent-owned saved live assessment; this check does not query external platforms.
const liveArtifact='docs/cases/live-targeted-hotel-refresh-20261008.json';
if(existsSync(liveArtifact)){
 const saved=JSON.parse(readFileSync(liveArtifact,'utf8'));let liveSid:string|undefined;
 for(const filename of readdirSync('data/workflows').filter(name=>name.endsWith('.sqlite'))){const db=new DatabaseSync(resolve('data/workflows',filename),{readOnly:true});try{if(db.prepare("SELECT 1 FROM runs WHERE json_extract(payload,'$.id')=?").get(saved.id)){liveSid=filename.replace('.sqlite','');break;}}finally{db.close();}}
 assert(liveSid,'The saved live assessment must remain available in its originating session');
 await context.addCookies([{name:'staypilot_session',value:liveSid,domain:new URL(origin).hostname,path:'/',httpOnly:true,sameSite:'Lax'}]);
 await page.goto(`${origin}/live/workflow?lang=en`,{waitUntil:'networkidle'});
 await page.locator('.journey-steps button').nth(3).click();
 const savedRuns=page.locator('section').filter({has:page.getByRole('heading',{name:'Previous assessments',exact:true})});
 await savedRuns.getByRole('button',{name:'Show recent records',exact:true}).click();
 const savedDetail=savedRuns.locator(`details[data-run-id="${saved.id}"]`);await savedDetail.waitFor();
 if(await savedDetail.getAttribute('open')===null)await savedDetail.locator('summary').click();
 assert((await savedDetail.innerText()).includes(saved.candidates[0].candidate.name));
 await savedRuns.scrollIntoViewIfNeeded();await page.screenshot({path:'docs/screenshots/live-refresh-history-mobile.png',fullPage:false});
 pass('当前会话的真实API历史记录可在页面读取，单酒店刷新与原记录分别保留');
}
const reviewArtifact='docs/cases/live-review-hard-floor-20261008.json';
if(existsSync(reviewArtifact)){
 const saved=JSON.parse(readFileSync(reviewArtifact,'utf8'));let sid:string|undefined;
 for(const file of readdirSync('data/workflows').filter(name=>name.endsWith('.sqlite'))){const db=new DatabaseSync(resolve('data/workflows',file),{readOnly:true});try{if(db.prepare("SELECT 1 FROM runs WHERE json_extract(payload,'$.id')=?").get(saved.id)){sid=file.replace('.sqlite','');break;}}finally{db.close();}}
 assert(sid);await context.addCookies([{name:'staypilot_session',value:sid,domain:new URL(origin).hostname,path:'/',httpOnly:true,sameSite:'Lax'}]);
 await page.goto(`${origin}/live/workflow?lang=en`,{waitUntil:'networkidle'});await page.locator('.journey-steps button').nth(3).click();
 const hotel=page.locator('article').filter({has:page.getByRole('heading',{name:/[0-9]+\. 时光漫步酒店\(北京雍和宫店\)/})}).filter({has:page.locator('a[href*="trip.com"]')}).first();
 await hotel.locator('details').first().locator('summary').click();
 await hotel.getByText('Issue mentions (including highly rated reviews):',{exact:true}).waitFor();
 assert((await hotel.innerText()).includes('9.4/10'));
 assert((await hotel.innerText()).includes('partial visible page'));
assert((await hotel.innerText()).includes('A guest reported weak door/wall insulation, but a quiet stay and good service.'));
assert((await hotel.innerText()).includes('not a live review API'));
assert((await hotel.innerText()).includes('Explicitly unacceptable issues: Noise'));
 const source=hotel.locator('a[href*="trip.com"]').first();assert((await source.getAttribute('href'))?.includes('1181544'));
 await hotel.scrollIntoViewIfNeeded();await page.screenshot({path:'docs/screenshots/live-review-evidence-mobile.png',fullPage:false});
 pass('真实评论记录页面展示原评分尺度、摘要标签、部分样本局限及对应平台来源');
}
// Rendering fixture combines saved real observations locally; it is not a live query or persisted assessment.
const analysisArtifact='docs/cases/live-review-model-analysis-20261008.json';
if(existsSync(analysisArtifact)&&existsSync(reviewArtifact)){
 const fixture=JSON.parse(readFileSync(reviewArtifact,'utf8'));
 const analysis=JSON.parse(readFileSync(analysisArtifact,'utf8'));
 const review=JSON.parse(readFileSync('docs/cases/timewalk-review-evidence-20261008.json','utf8'));
 assert(attachReviewAnalysis(review,analysis));
 const candidate=fixture.candidates.find((d:any)=>d.candidate.key==='rollinggo:41962');assert(candidate);candidate.candidate.reviews=review;
 const secondary=fixture.candidates.find((d:any)=>d.candidate.key==='rollinggo:43565');assert(secondary);const primarySource=secondary.candidate.reviews.sourceUrl;assert(attachXinqiaoAdditionalAnalysis(secondary.candidate,JSON.parse(readFileSync('docs/cases/xinqiao-public-review-analysis-20261008.json','utf8')).analysis));
 await page.route('**/api/live/workflow/state',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({running:false,stage:'render verification',latest:fixture,monitor:{enabled:false,deadline:null,nextCheckAt:null,lastError:null,checks:0}})}));
 await page.goto(`${origin}/live/workflow?lang=en`,{waitUntil:'networkidle'});await page.locator('.journey-steps button').nth(3).click();
 const card=page.locator('article').filter({has:page.getByRole('heading',{name:/[0-9]+\. 时光漫步酒店\(北京雍和宫店\)/})}).filter({has:page.locator('a[href*="trip.com"]')}).first();
 await card.locator('details').first().locator('summary').click();
 await card.getByText(/Jev review analysis \(saved observation\)/).waitFor();
 const text=await card.innerText();assert(text.includes('jev-1.13.0'));assert(text.includes('15 visible samples'));assert(text.includes('Source observed:'));assert(text.includes('Analysis completed:'));assert(text.includes('#1875711837'));assert(text.includes('Needs verification; absence is not established'));assert(text.includes('9.4/10'));
 await card.scrollIntoViewIfNeeded();await page.screenshot({path:'docs/screenshots/live-review-analysis-mobile.png',fullPage:false});
 const secondaryCard=page.locator('article').filter({has:page.getByRole('heading',{name:/[0-9]+\. 北京新侨饭店/})}).first();
 const extra=secondaryCard.locator('details').filter({has:page.getByText('Additional platform review analysis (saved observation)',{exact:true})});await extra.locator('summary').click();
 const extraText=await extra.innerText();assert(extraText.includes('9.1/10'));assert(extraText.includes('15 visible samples'));assert(extraText.includes('ratings and issue proportions are not combined'));assert(extraText.includes('#2127627773'));assert(extraText.includes('Model-detected mention; verify source wording'));assert(extraText.includes('Needs verification'));
 assert((await extra.getByRole('link',{name:'Open corresponding review source'}).getAttribute('href'))?.includes('374787'));assert(await secondaryCard.locator(`a[href="${primarySource}"]`).count()>0);
 await extra.scrollIntoViewIfNeeded();await page.screenshot({path:'docs/screenshots/live-additional-reviews-mobile.png',fullPage:false});
 pass('第二平台真实保存评论独立显示评分、模型提及、待核验项和来源，原平台链接保留');
 await page.unroute('**/api/live/workflow/state');
 pass('保存的真实Jev分析在英文页面显示独立来源时间、模型版本与待核验评论；本地渲染组合，不是新查询');
}
// Actual saved not-found result first; other statuses below are explicit synthetic rendering fixtures.
const watch=JSON.parse(readFileSync('docs/cases/live-selected-quote-watch-20261008.json','utf8'));
await page.route('**/api/live/workflow/state',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(watch)}));
await page.goto(`${origin}/live/workflow?lang=en`,{waitUntil:'networkidle'});await page.locator('.journey-steps button').nth(5).click();
const missing=page.locator('article').filter({has:page.getByText('Original quote not found in this response',{exact:true})});await missing.waitFor();assert((await missing.innerText()).includes('does not establish that the hotel is sold out'));assert(!(await missing.innerText()).includes('Display estimate change'));await missing.scrollIntoViewIfNeeded();await page.screenshot({path:'docs/screenshots/live-quote-not-found-mobile.png',fullPage:false});
await page.unroute('**/api/live/workflow/state');
const synthetic=structuredClone(watch),base=watch.rechecks[0];
synthetic.rechecks=['unchanged','price_changed','terms_changed','failed'].map((status,i)=>({...base,id:'synthetic-'+i,status,checkedAt:status==='terms_changed'?'2026-02-30T00:00:00Z':base.checkedAt,baseline:{kind:'recheck',recheckId:'synthetic-baseline',skippedAttempts:2},beforeObservedAt:status==='price_changed'?'2026-10-09T00:31:32':base.beforeObservedAt,after:status==='failed'?null:{...base.before,estimatedStayPrice:status==='price_changed'?base.before.estimatedStayPrice-50:base.before.estimatedStayPrice},afterObservedAt:status==='failed'?null:base.checkedAt,deltaCents:status==='unchanged'?0:status==='price_changed'?-5000:null}));
await page.route('**/api/live/workflow/state',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(synthetic)}));
await page.reload({waitUntil:'networkidle'});await page.locator('.journey-steps button').nth(5).click();
const price=page.locator('article').filter({has:page.getByText('Displayed price changed',{exact:true})});await price.waitFor();assert((await price.innerText()).includes('-50.00 CNY'));assert((await price.innerText()).includes('not a final booking price or realized saving'));assert((await price.innerText()).includes('Comparison baseline observation'));assert((await price.innerText()).includes('Intervening checks without a usable price: 2'));assert((await price.innerText()).includes('The difference is not a change against those empty results.'));assert((await price.innerText()).includes('Time unverified · Source value: 2026-10-09T00:31:32'));assert.equal(await price.locator('time[datetime="2026-10-09T00:31:32"]').count(),0);
const unchanged=page.locator('article').filter({has:page.getByText('Displayed price unchanged',{exact:true})});assert((await unchanged.innerText()).includes('0.00 CNY'));
for(const label of ['Room or plan terms changed or incomparable; savings cannot be calculated','Recheck failed or comparable price unavailable']){const card=page.locator('article').filter({has:page.getByText(label,{exact:true})});assert(!(await card.innerText()).includes('Display estimate change'));assert((await card.innerText()).includes('Checked at (Shanghai)'));if(label.startsWith('Room or plan'))assert((await card.innerText()).includes('Time unverified · Source value: 2026-02-30T00:00:00Z'));}
await page.unroute('**/api/live/workflow/state');pass('真实保存报价未找到与四种合成状态的监控展示区分价格、时间、失败及不可计算节省；不提交外部请求');
const historyFixture=structuredClone(watch);historyFixture.latest={...historyFixture.latest,id:'render-only-refreshed-run',kind:'candidate_refresh',parentRunId:watch.latest.id};historyFixture.monitor={...historyFixture.monitor,target:undefined,enabled:false};
await page.route('**/api/live/workflow/state',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(historyFixture)}));
await page.reload({waitUntil:'networkidle'});await page.locator('.journey-steps button').nth(5).click();
const previous=page.locator('details').filter({has:page.getByText('View rechecks from the previous assessment',{exact:true})});await previous.locator('summary').click();assert((await previous.innerText()).includes('do not establish this run’s price'));assert((await previous.innerText()).includes('Original quote not found in this response'));await page.unroute('**/api/live/workflow/state');
pass('刷新方案后，原复核记录独立展示并明确不能作为本轮报价；仅本地渲染关系测试');

const offerFile='docs/cases/live-offer-terms-refresh-20261008.json';
if(existsSync(offerFile)){
 const actual=JSON.parse(readFileSync(offerFile,'utf8'));let sid:string|undefined;
 for(const filename of readdirSync('data/workflows').filter(n=>n.endsWith('.sqlite'))){const db=new DatabaseSync(resolve('data/workflows',filename),{readOnly:true});try{if(db.prepare("SELECT 1 FROM runs WHERE json_extract(payload,'$.id')=?").get(actual.id)){sid=filename.replace('.sqlite','');break;}}finally{db.close();}}
 assert(sid);await context.addCookies([{name:'staypilot_session',value:sid,domain:new URL(origin).hostname,path:'/',httpOnly:true,sameSite:'Lax'}]);
 await page.goto(`${origin}/live/workflow?lang=en`,{waitUntil:'networkidle'});await page.locator('.journey-steps button').nth(3).click();
 const tradeoffs=page.locator('section').filter({has:page.getByRole('heading',{name:'Your tradeoffs',exact:true})});const offer=tradeoffs.locator('article').first();await offer.waitFor();const text=await offer.innerText();
 assert(text.includes('Bed:'));assert(text.includes('Meals: No meals'));assert(text.includes('Maximum guests: 2'));assert(text.includes('Rate plan name (source wording)'));assert(text.includes('Not marked on-request; checkout verification still required'));
 assert(text.includes('Cancellation policy unverified'));assert(text.includes('cannot be locked yet'));assert(await offer.getByRole('button',{name:'Select for further verification'}).isDisabled());
 if(Date.now()-Date.parse(actual.evidenceAsOf)>15*60000){await tradeoffs.getByText('These quotes have expired or their observation time is invalid. Search again before selecting an option.',{exact:true}).waitFor();const buttons=tradeoffs.getByRole('button',{name:'Select for further verification'});for(let i=0;i<await buttons.count();i++)assert(await buttons.nth(i).isDisabled());}
 await offer.scrollIntoViewIfNeeded();await page.screenshot({path:'docs/screenshots/live-offer-terms-mobile.png',fullPage:false});pass('本次真实单酒店刷新结果展示具体方案条件，未知取消政策明确提示且不能锁定');
}
if(existsSync('docs/cases/live-map-identity-differences-20261008.json')){
 const actual=JSON.parse(readFileSync('docs/cases/live-after-cancellation-window-20261008.json','utf8'));
 const observations=JSON.parse(readFileSync('docs/cases/live-map-identity-differences-20261008.json','utf8'));
 for(const entry of observations.results){const candidate=actual.candidates.find((d:any)=>d.candidate.name===entry.hotel)?.candidate;if(candidate)candidate.mapIdentityEvidence={status:'unverified',observations:entry.observations};}
 await page.route('**/api/live/workflow/state',route=>route.fulfill({json:{running:false,stage:'Saved evidence rendering',latest:actual,monitor:{enabled:false,checks:0},selection:null,selectionValid:false,rechecks:[]}}));
 await page.goto(`${origin}/live/workflow?lang=en`,{waitUntil:'networkidle'});await page.locator('.journey-steps button').nth(3).click();
 const evidence=page.locator('details').filter({has:page.getByText('Hotel location needs verification',{exact:true})}).first();await evidence.locator('summary').click();
 await evidence.getByText(/not confirmed matches for this hotel/).waitFor();assert((await evidence.innerText()).includes('甲29号'));assert((await evidence.getByRole('link',{name:'Open map place to verify'}).first().getAttribute('href'))?.startsWith('https://www.amap.com/place/'));
 assert((await evidence.innerText()).includes('Address geocoding results were not accepted'));
 pass('真实保存地图差异可展开核验，明确未确认身份且地理编码不作为酒店依据；本地渲染组合');await page.unroute('**/api/live/workflow/state');
}
if(existsSync('docs/cases/live-independent-hotel-discovery-20261008.json')){
 const actual=JSON.parse(readFileSync('docs/cases/live-independent-hotel-discovery-20261008.json','utf8'));let sid:string|undefined;
 for(const filename of readdirSync('data/workflows').filter(n=>n.endsWith('.sqlite'))){const db=new DatabaseSync(resolve('data/workflows',filename),{readOnly:true});try{if(db.prepare("SELECT 1 FROM runs WHERE json_extract(payload,'$.id')=?").get(actual.id)){sid=filename.replace('.sqlite','');break;}}finally{db.close();}}
 assert(sid);await context.addCookies([{name:'staypilot_session',value:sid,domain:new URL(origin).hostname,path:'/',httpOnly:true,sameSite:'Lax'}]);
 await page.goto(`${origin}/live/workflow?lang=en`,{waitUntil:'networkidle'});await page.locator('.journey-steps button').nth(3).click();
 await page.getByText(/Every verified room option shown here violates/).waitFor();
 const actualCandidate=actual.candidates.find((d:any)=>d.candidate.key==='rollinggo:2209795');assert.equal(actualCandidate.candidate.rooms.length,71);assert.equal(actualCandidate.candidate.route.walking.minutes,15);
 assert((await page.locator('body').innerText()).includes('华侨夜泊君亭酒店'));assert.equal(await page.getByRole('button',{name:'Select for further verification'}).count()>0,true);
 pass('最新真实独立候选记录可读取，全部已展示房型失败时明确限定结论范围；不证明全市无解');
}
if(existsSync('docs/cases/live-projected-inspection-model-check-20261008.json')){
 const actual=JSON.parse(readFileSync('docs/cases/live-independent-hotel-discovery-20261008.json','utf8')),model=JSON.parse(readFileSync('docs/cases/live-projected-inspection-model-check-20261008.json','utf8'));
 const fixed=actual.candidates.find((d:any)=>d.candidate.key!==model.answers.candidate.choice).candidate;
 actual.jev={model:model.model,observedAt:model.completedAt,answers:model.answers,evidenceHash:actual.evidenceHash,selectedForAction:fixed.key};
 await page.route('**/api/live/workflow/state',route=>route.fulfill({json:{running:false,stage:'Synthetic task-binding rendering fixture over actual evidence',latest:actual,monitor:{enabled:false,checks:0},selection:null,selectionValid:false,rechecks:[]}}));
 await page.goto(`${origin}/live/workflow?lang=en`,{waitUntil:'networkidle'});await page.locator('.journey-steps button').nth(3).click();
 const advice=page.locator('section').filter({has:page.getByRole('heading',{name:'Jev: next inspection advice',exact:true})});await advice.getByText(/candidate choice is uncertain/).waitFor();assert((await advice.innerText()).includes('This task applies specifically to: '+fixed.name));assert((await advice.innerText()).includes('Model option probability'));
 delete actual.jev.selectedForAction;await page.reload({waitUntil:'networkidle'});await page.locator('.journey-steps button').nth(3).click();await page.getByText(/task’s hotel is unconfirmed in this record/).waitFor();
 pass('低置信度核验建议保留备选；独立任务明确对应酒店，旧记录缺少目标时不猜测；绑定关系为渲染仿真');await page.unroute('**/api/live/workflow/state');
}
if(existsSync('docs/cases/live-integrated-batched-workflow-20261008.json')){
 const actual=JSON.parse(readFileSync('docs/cases/live-integrated-batched-workflow-20261008.json','utf8'));let sid:string|undefined;
 for(const filename of readdirSync('data/workflows').filter(n=>n.endsWith('.sqlite'))){const db=new DatabaseSync(resolve('data/workflows',filename),{readOnly:true});try{if(db.prepare("SELECT 1 FROM runs WHERE json_extract(payload,'$.id')=?").get(actual.id)){sid=filename.replace('.sqlite','');break;}}finally{db.close();}}
 assert(sid);await context.addCookies([{name:'staypilot_session',value:sid,domain:new URL(origin).hostname,path:'/',httpOnly:true,sameSite:'Lax'}]);
 await page.goto(`${origin}/live/workflow?lang=en`,{waitUntil:'networkidle'});await page.locator('.journey-steps button').nth(3).click();
 const advice=page.locator('section').filter({has:page.getByRole('heading',{name:'Jev: next inspection advice',exact:true})});await advice.getByText(/candidate choice is uncertain/).waitFor();
 const fixed=actual.candidates.find((d:any)=>d.candidate.key===actual.jev.selectedForAction).candidate;assert((await advice.innerText()).includes('This task applies specifically to: '+fixed.name));
 assert((await advice.innerText()).includes('Verify final price, inventory and cancellation'));
 assert.equal(await advice.getByRole('link',{name:'Open the corresponding platform to verify',exact:true}).getAttribute('href'),fixed.detailUrl);assert((await advice.innerText()).includes(actual.query.checkIn));assert((await advice.innerText()).includes('Total budget ceiling'));assert((await advice.innerText()).includes('cannot obtain a final checkout quote'));
 const choices=page.getByRole('button',{name:'Select for further verification'});assert((await choices.count())>0);for(let i=0;i<await choices.count();i++)assert(await choices.nth(i).isDisabled());
 await page.getByText('Route evidence is stale or its time is unverified. Refresh this hotel before selecting it.',{exact:true}).first().waitFor();
 const analyses=actual.candidates.flatMap((d:any)=>[d.candidate.reviews?.modelAnalysis,...d.candidate.additionalReviewAnalyses??[]]).filter(Boolean);assert.equal(analyses.length,2);assert(analyses.every((a:any)=>Date.parse(a.sourceObservedAt)>=Date.parse(actual.startedAt)&&a.sampleCount===15&&a.model==='jev-1.13.0'));
 await page.getByText('Hotel official identity source',{exact:true}).first().waitFor();
 const readableDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Export readable report',exact:true}).click();const readable=await readableDownload;mkdirSync('docs/reports',{recursive:true});await readable.saveAs('docs/reports/real-hotel-assessment-integrated-20261008.html');
 const readableHtml=readFileSync('docs/reports/real-hotel-assessment-integrated-20261008.html','utf8');assert(readableHtml.includes(actual.id));assert(readableHtml.includes(actual.evidenceAsOf));assert(readableHtml.includes('No real order was created'));assert(readableHtml.includes('Budget ceiling'));
 const reportPage=await context.newPage();const externalReportRequests:string[]=[];reportPage.on('request',request=>{if(/^https?:/.test(request.url()))externalReportRequests.push(request.url());});
 await reportPage.setViewportSize({width:1280,height:900});await reportPage.goto(pathToFileURL(resolve('docs/reports/real-hotel-assessment-integrated-20261008.html')).href);
 await reportPage.getByRole('heading',{level:1,name:'StayPilot · Hotel assessment report',exact:true}).waitFor();assert.equal(await reportPage.locator('article').count(),actual.candidates.length);
 await reportPage.screenshot({path:'docs/screenshots/readable-report-desktop.png',fullPage:false});
 await reportPage.setViewportSize({width:390,height:844});assert(await reportPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await reportPage.screenshot({path:'docs/screenshots/readable-report-mobile.png',fullPage:false});
 await reportPage.emulateMedia({media:'print'});assert.equal(await reportPage.locator('h1').isVisible(),true);assert.equal(await reportPage.locator('article').count(),actual.candidates.length);assert.deepEqual(externalReportRequests,[]);await reportPage.close();
 pass('导出报告可离线打开，保留全部候选，手机无横向溢出并通过打印样式检查；不请求外部服务');
 const outcome=page.getByRole('region',{name:'Assessment outcome'});
 await outcome.getByText(/Check hotels without room quotes/).waitFor();
 assert((await outcome.innerText()).includes('Observed hotels: 14'));
 assert((await outcome.innerText()).includes('Missing evidence is not a failed requirement'));
 assert(await outcome.getByRole('button',{name:'Search more nearby hotels',exact:true}).isDisabled());
 await outcome.locator('summary').filter({hasText:'Hotels without room quotes'}).click();
 const missingRooms=actual.candidates.filter((d:any)=>d.candidate.rooms.length===0);
 for(const d of missingRooms){assert((await outcome.innerText()).includes(d.candidate.name));if(d.candidate.detailUrl)assert(await outcome.locator('a').filter({hasText:'Open this hotel on its platform'}).evaluateAll((links,href)=>links.some(link=>link.getAttribute('href')===href),d.candidate.detailUrl));}
 const roomButtons=outcome.getByRole('button',{name:'Fetch rooms for this hotel',exact:true});
 assert.equal(await roomButtons.count(),missingRooms.filter((d:any)=>d.candidate.key.startsWith('rollinggo:')).length);
 for(let i=0;i<await roomButtons.count();i++)assert(await roomButtons.nth(i).isDisabled());
 assert((await outcome.innerText()).includes('An empty room response does not prove the hotel is sold out'));
 assert((await outcome.innerText()).includes('No room-query record is available'));
 await outcome.getByRole('button',{name:'Open room refresh and rechecks',exact:true}).click();
 await page.getByRole('heading',{name:'Recheck an exact quote',exact:true}).waitFor();
 await page.locator('.journey-steps button').nth(3).click();
 await page.screenshot({path:'docs/screenshots/live-integrated-workflow-mobile.png',fullPage:false});
 pass('本轮完整真实查询记录呈现低置信度、固定任务酒店和官网依据，不合格房型全部禁选；两份评论保留本轮来源时间');
}
const refreshedChild=JSON.parse(readFileSync('docs/cases/live-targeted-hotel-refresh-20261008.json','utf8'));let parentSession:string|undefined,parentRecord:any;
for(const filename of readdirSync('data/workflows').filter(n=>n.endsWith('.sqlite'))){const db=new DatabaseSync(resolve('data/workflows',filename),{readOnly:true});try{if(db.prepare("SELECT 1 FROM runs WHERE json_extract(payload,'$.id')=?").get(refreshedChild.id)){const row=db.prepare("SELECT payload FROM runs WHERE json_extract(payload,'$.id')=?").get(refreshedChild.parentRunId) as {payload:string}|undefined;if(row){parentSession=filename.replace('.sqlite','');parentRecord=JSON.parse(row.payload);break;}}}finally{db.close();}}
assert(parentSession);await context.addCookies([{name:'staypilot_session',value:parentSession,domain:new URL(origin).hostname,path:'/',httpOnly:true,sameSite:'Lax'}]);
await page.route('**/api/live/workflow/state',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({running:false,stage:'Saved refresh display',latest:refreshedChild,monitor:{enabled:false,deadline:null,nextCheckAt:null,lastError:null,checks:0}})}));
await page.goto(`${origin}/live/workflow?lang=en`,{waitUntil:'networkidle'});await page.locator('.journey-steps button').nth(3).click();
const originalAssessment=page.locator(`details[data-parent-run="${refreshedChild.parentRunId}"]`);await originalAssessment.waitFor();assert.equal(await originalAssessment.getAttribute('open'),'');
for(const d of parentRecord.candidates)assert((await originalAssessment.innerText()).includes(d.candidate.name));
assert((await originalAssessment.innerText()).includes('API observations from that time'));
pass('单酒店补查页面自动读取同会话真实原方案并展开其他候选；当前展示为保存记录，不是新查询');
await page.unroute('**/api/live/workflow/state');
const filteredRoom=JSON.parse(readFileSync('docs/cases/live-xinqiao-free-cancel-recheck-20261008.json','utf8')).result;
const roomDisplay=JSON.parse(readFileSync('docs/cases/live-integrated-batched-workflow-20261008.json','utf8'));
const roomHotel=roomDisplay.candidates.find((d:any)=>d.candidate.key==='rollinggo:'+filteredRoom.hotelId).candidate;
assert.equal(roomHotel.name,filteredRoom.name);roomHotel.roomQuery={status:'empty',count:0,filter:filteredRoom.filter,observedAt:filteredRoom.observedAt,filterDiagnostics:{received:2,excluded:2,unknownCancellationExcluded:1}};
await page.route('**/api/live/workflow/state',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({running:false,stage:'Display verification',latest:roomDisplay,monitor:{enabled:false,deadline:null,nextCheckAt:null,lastError:null,checks:0}})}));
await page.goto(`${origin}/live/workflow?lang=en`,{waitUntil:'networkidle'});await page.locator('.journey-steps button').nth(3).click();
const roomOutcome=page.getByRole('region',{name:'Assessment outcome'});await roomOutcome.locator('summary').filter({hasText:'Hotels without room quotes'}).click();
await roomOutcome.getByText(/No rooms returned for this filter/).waitFor();assert((await roomOutcome.innerText()).includes('Filter: cancelable'));assert((await roomOutcome.innerText()).includes('A filter label does not verify free cancellation'));
assert((await roomOutcome.innerText()).includes('Room plans in this platform response: 2'));assert((await roomOutcome.innerText()).includes('Including plans with unverified cancellation terms: 1'));
pass('实际可取消空返回记录显示筛选条件与局限；新增排除数量为本地合成展示验证，不是新实时查询');
await page.unroute('**/api/live/workflow/state');
await page.route('**/api/live/workflow/state',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({running:false,stage:'Stopped after failures',latest:null,monitor:{enabled:false,deadline:null,nextCheckAt:null,lastError:'Query failed; previous observations are not current inventory.',checks:3,consecutiveFailures:3,stopReason:'repeated_failure'}})}));
await page.goto(`${origin}/live/workflow?lang=en`,{waitUntil:'networkidle'});await page.locator('.journey-steps button').nth(5).click();
await page.getByText(/Three consecutive failed checks; check the service before restarting/).waitFor();
await page.getByText('Consecutive failed checks: 3/3',{exact:true}).waitFor();
assert(await page.getByRole('button',{name:'Start monitoring',exact:true}).isDisabled());
pass('连续失败停止原因与计数明确展示，重新开启仍需授权；合成失败状态，不是外部故障实测');
await page.unroute('**/api/live/workflow/state');
await page.route('**/api/live/workflow/state',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({running:false,stage:'Interrupted',latest:null,monitor:{enabled:false,deadline:null,nextCheckAt:null,lastError:'服务中断，监控未自动恢复；请核验当前行程后重新开启。',checks:1,stopReason:'interrupted'}})}));
await page.goto(`${origin}/live/workflow?lang=en`,{waitUntil:'networkidle'});await page.locator('.journey-steps button').nth(5).click();
await page.getByText(/Monitoring stopped after a service interruption/).waitFor();
assert(!(await page.locator('.lw-error').innerText()).includes('服务中断'));
assert(await page.getByRole('button',{name:'Start monitoring',exact:true}).isDisabled());
pass('重启中断以英文显示恢复步骤，未重新授权时不能开启；控制界面状态，不是外部故障');
await page.unroute('**/api/live/workflow/state');
await page.route('**/api/live/workflow/state',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({running:false,stage:'Conditions reconfirmed',latest:null,monitor:{enabled:false,deadline:null,nextCheckAt:null,lastError:null,checks:1,stopReason:'conditions_changed'}})}));
await page.goto(`${origin}/live/workflow?lang=en`,{waitUntil:'networkidle'});await page.locator('.journey-steps button').nth(5).click();
await page.getByText(/New trip or preferences confirmed; the previous monitor stopped/).waitFor();assert(await page.getByRole('button',{name:'Start monitoring',exact:true}).isDisabled());
pass('新条件确认后的旧监控停止原因在英文页面明确展示；状态为本地合成，无外部查询');await page.unroute('**/api/live/workflow/state');
if(existsSync('docs/cases/live-filtered-nearby-expansion-20261008.json')){
 const actual=JSON.parse(readFileSync(existsSync('docs/cases/live-fresh-map-expansion-20261009.json')?'docs/cases/live-fresh-map-expansion-20261009.json':'docs/cases/live-filtered-nearby-expansion-20261008.json','utf8'));let sid:string|undefined;
 for(const filename of readdirSync('data/workflows').filter(n=>n.endsWith('.sqlite'))){const db=new DatabaseSync(resolve('data/workflows',filename),{readOnly:true});try{if(db.prepare("SELECT 1 FROM runs WHERE json_extract(payload,'$.id')=?").get(actual.id)){sid=filename.replace('.sqlite','');break;}}finally{db.close();}}
 assert(sid);await context.addCookies([{name:'staypilot_session',value:sid,domain:new URL(origin).hostname,path:'/',httpOnly:true,sameSite:'Lax'}]);
 await page.goto(`${origin}/live/workflow?lang=en`,{waitUntil:'networkidle'});await page.locator('.journey-steps button').nth(3).click();
 const outcome=page.getByRole('region',{name:'Assessment outcome'});await outcome.getByText(/Nearby leads checked this run: 3/).waitFor();await outcome.locator('summary').filter({hasText:'Hotels without room quotes'}).click();
 for(const d of actual.candidates){assert.equal(d.candidate.roomQuery.filter.cancelPolicy,'CANCELABLE');await outcome.getByRole('heading',{name:d.candidate.name,exact:true}).waitFor();}
 assert((await outcome.getByText(/No rooms returned for this filter/).count())>=actual.candidates.length);assert((await outcome.innerText()).includes('Filter: cancelable'));
 assert(await outcome.getByRole('button',{name:'Search more nearby hotels',exact:true}).isDisabled());
 await page.screenshot({path:'docs/screenshots/live-nearby-filtered-workflow.png',fullPage:false});
 pass('实际附近补查记录从同会话读取，独立路线与可取消空房型范围明确展示；浏览器读取保存观察，未发起新商户查询');
}
if(existsSync('docs/cases/live-integrated-product-validation-20261009.json')){
 const actual=JSON.parse(readFileSync('docs/cases/live-integrated-product-validation-20261009.json','utf8'));let sid:string|undefined;
 for(const filename of readdirSync('data/workflows').filter(n=>n.endsWith('.sqlite'))){const db=new DatabaseSync(resolve('data/workflows',filename),{readOnly:true});try{if(db.prepare("SELECT 1 FROM runs WHERE json_extract(payload,'$.id')=?").get(actual.id)){sid=filename.replace('.sqlite','');break;}}finally{db.close();}}
 assert(sid);await context.addCookies([{name:'staypilot_session',value:sid,domain:new URL(origin).hostname,path:'/',httpOnly:true,sameSite:'Lax'}]);
 const serverState=await context.request.get(origin+'/api/live/workflow/state');assert.equal((await serverState.json()).latest.id,actual.id);
 await page.goto(`${origin}/live/workflow?lang=en`,{waitUntil:'networkidle'});await page.locator('.journey-steps button').nth(3).click();
 const outcome=page.getByRole('region',{name:'Assessment outcome'});assert((await outcome.innerText()).includes('Observed hotels: '+actual.candidates.length));
 await outcome.getByText(/The displayed options share a free-cancellation conflict/).waitFor();await outcome.locator('summary').filter({hasText:'Priority hotels to inspect'}).click();await outcome.getByRole('heading',{name:'北京新侨饭店',exact:true}).waitFor();assert((await outcome.innerText()).includes('Room quotes missing'));assert(await outcome.getByRole('button',{name:/Fetch rooms for this hotel|Refresh rooms and route/}).first().isDisabled());
 assert(await outcome.getByRole('button',{name:'Search more nearby hotels',exact:true}).isDisabled());assert.equal(actual.transactionEnabled,false);assert.equal(actual.policy.budgetCents,60000);
 const selections=page.getByRole('button',{name:'Select for further verification'});for(let i=0;i<await selections.count();i++)assert(await selections.nth(i).isDisabled());
 if(existsSync('docs/cases/live-same-plan-two-rechecks-20261009.json')){
 const realChecks=JSON.parse(readFileSync('docs/cases/live-same-plan-two-rechecks-20261009.json','utf8'));
 await page.locator('.journey-steps button').nth(5).click();const history=page.locator('details').filter({has:page.getByText('View history for this rate plan',{exact:true})}).first();await history.locator('summary').click();
 await history.getByText('Original quote not found in this response',{exact:true}).waitFor();await history.getByText('Displayed price changed',{exact:true}).waitFor();assert((await history.innerText()).includes('303'));assert((await history.innerText()).includes('257'));assert((await history.innerText()).includes('No merchant query occurs'));
 const exportedEvent=page.waitForEvent('download');await history.getByRole('button',{name:'Export this quote history',exact:true}).click();const exportedHistory=await exportedEvent;await exportedHistory.saveAs('docs/cases/quote-history-browser-export-20261009.json');const exportData=JSON.parse(readFileSync('docs/cases/quote-history-browser-export-20261009.json','utf8'));assert.equal(exportData.source,'saved_observations');assert.equal(exportData.transactionEnabled,false);assert.equal(exportData.scope.runId,realChecks.runId);assert.equal(exportData.scope.ratePlanId,realChecks.ratePlanId);assert.equal(exportData.records.length,2);assert.deepEqual(exportData.records.map((r:any)=>r.id).sort(),realChecks.results.map((r:any)=>r.id).sort());for(const row of exportData.records)assert.deepEqual(row,realChecks.results.find((r:any)=>r.id===row.id));
 const requestUrl='/api/live/workflow/rechecks?'+new URLSearchParams({runId:realChecks.runId,candidateKey:realChecks.results[0].candidateKey,ratePlanId:realChecks.ratePlanId});const savedChecks=await context.request.get(origin+requestUrl);assert.equal((await savedChecks.json()).length,2);
 await page.route('**/api/live/workflow/rechecks?*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{...realChecks.results[0],runId:'foreign-run',hotelName:'Foreign history marker'}])}));await history.getByRole('button',{name:'Reload saved records',exact:true}).click();await history.getByRole('alert').waitFor();assert(!(await history.innerText()).includes('Foreign history marker'));await page.unroute('**/api/live/workflow/rechecks?*');await history.getByRole('button',{name:'Reload saved records',exact:true}).click();await history.getByRole('alert').waitFor({state:'hidden'});
 pass('真实同一报价的两轮保存复核在页面定向历史中可读取，未找到与涨价分别展示；仅读取本地历史，不重新查询商户');
}
await page.screenshot({path:'docs/screenshots/live-integrated-product-validation-20261009.png',fullPage:false});
 pass('10月9日完整真实查询保存记录可在英文六步页面读取，预算与候选数量一致；前端未重新确认时禁止后续查询，未提交外部订单');
}
// Controlled live-result rendering: never calls Jev or a merchant.
if(existsSync('docs/cases/live-integrated-product-validation-20261009.json')){
 const saved=JSON.parse(readFileSync('docs/cases/live-integrated-product-validation-20261009.json','utf8'));
 for(const variant of ['current','room_expired','route_expired','cancel_expired','cancel_unknown']){
 const now=Date.now(),fresh=new Date(now).toISOString(),old=new Date(now-16*60000).toISOString(),result=structuredClone(saved),option=structuredClone(result.tradeoffs.options[0]);
 result.evidenceAsOf=fresh;option.status='within_bounds';option.hardViolations=[];option.observedAt=fresh;option.evidence=[{id:'controlled-room',kind:'room',observedAt:variant==='room_expired'?old:fresh,method:'api',sourceUrl:null,hotelKey:option.candidateKey},{id:'controlled-route',kind:'route',observedAt:variant==='route_expired'?old:fresh,method:'api',sourceUrl:null,hotelKey:option.candidateKey}];option.offer={...option.offer,cancellationStatus:'free_until',cancelUntil:variant==='cancel_expired'?new Date(now-1000).toISOString():variant==='cancel_unknown'?'2026-10-09T09:00:00':new Date(now+3600000).toISOString()};
 result.tradeoffs={...result.tradeoffs,status:'jev_recommended',model:'controlled-render-model',preferredOptionId:option.id,options:[option]};
 await page.route('**/api/live/workflow/state',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({running:false,stage:'Controlled advice display',latest:result,monitor:{enabled:false,checks:0},selectionValid:false})}));
 await page.goto(`${origin}/live/workflow?lang=en`,{waitUntil:'networkidle'});await page.locator('.journey-steps button').nth(3).click();
 const panel=page.locator('section').filter({has:page.getByRole('heading',{name:'Your tradeoffs',exact:true})}).last();
 const expires=variant.endsWith('_expired');assert.equal(await panel.getByText('Jev preferred inspection option',{exact:true}).count(),expires?0:1);
 assert.equal(await panel.getByText(/The previous preferred option is no longer current/).count(),expires?1:0);
 if(variant==='cancel_unknown')assert.equal(await panel.getByText(/This offer’s free-cancellation window has ended/).count(),0);
 await page.unroute('**/api/live/workflow/state');
 }
 pass('推荐展示随房型、路线和取消窗口失效撤下首选；未知取消日期不误称过期。全部为合成页面状态，无外部调用');
}
if(existsSync('docs/cases/live-integrated-product-validation-20261009.json')){
 const result=JSON.parse(readFileSync('docs/cases/live-integrated-product-validation-20261009.json','utf8'));
 result.crossPlatform=['hotel_only','conditions_mismatch','evidence_stale','comparable_display'].map((status,i)=>({names:['Controlled hotel '+i],sources:['Platform one','Platform two'],status,warning:'Controlled comparison evidence',unmatchedFields:['Final charges unverified'],priceDifferenceCents:1000}));
 await page.route('**/api/live/workflow/state',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({running:false,stage:'Controlled comparison rendering',latest:result,monitor:{enabled:false,checks:0}})}));
 await page.goto(`${origin}/live/workflow?lang=en`,{waitUntil:'networkidle'});await page.locator('.journey-steps button').nth(3).click();const comparison=page.getByRole('region',{name:'Cross-platform comparison',exact:true});
 for(const label of ['Hotel matched; comparable rooms missing','Room or offer terms do not match','Quote observations stale or unverified','Aligned display-estimate record'])await comparison.getByText(label,{exact:true}).waitFor();
 assert.equal(await comparison.getByText(/Recorded display-estimate difference/).count(),1);assert((await comparison.innerText()).includes('Not a current transaction price or confirmed savings'));
 await comparison.locator('summary').first().click();await comparison.getByText('Final charges unverified',{exact:true}).first().waitFor();await page.unroute('**/api/live/workflow/state');
 pass('跨平台比较区分身份、条款、过期证据和可比较展示记录；不在不合格组合展示差额。合成界面测试，无外部调用');
}
{
 const result=JSON.parse(readFileSync('docs/cases/live-integrated-product-validation-20261009.json','utf8'));result.errors=['飞猪查询未完成','目的地地图查询未完成'];result.candidates[0].candidate.roomQuery={status:'failed',observedAt:new Date().toISOString(),filter:{},count:null};result.tradeoffs.status='model_unavailable';
 await page.route('**/api/live/workflow/state',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({running:false,stage:'Controlled partial failures',latest:result,monitor:{enabled:false,checks:0}})}));
 let writes=0;const track=(request:any)=>{if(request.method()==='POST'&&request.url().includes('/api/live/workflow/'))writes++;};page.on('request',track);
 await page.goto(`${origin}/live/workflow?lang=en`,{waitUntil:'networkidle'});await page.locator('.journey-steps button').nth(3).click();const failures=page.getByRole('region',{name:'Incomplete operations',exact:true});
 await failures.getByText(/Fliggy search incomplete/).waitFor();await failures.getByText(/Room requests failed/).waitFor();await failures.getByText(/Complete Jev advice unavailable/).waitFor();await failures.getByRole('button',{name:'Open hotel refresh actions',exact:true}).click();await page.getByRole('heading',{name:'Recheck an exact quote',exact:true}).waitFor();assert.equal(writes,0);page.off('request',track);await page.unroute('**/api/live/workflow/state');
 pass('部分失败按操作范围提示并提供补查导航；点击不自动重试或写授权。合成错误状态，无商户请求');
}
{
 await page.route('**/api/live/integrations',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({fliggy:{configured:false},rollinggo:{configured:false},amap:{configured:false},jev:{configured:false},realBooking:false})}));
 await page.goto(`${origin}/live/workflow?lang=en`,{waitUntil:'networkidle'});await page.locator('.journey-steps button').nth(2).click();const setup=page.getByRole('region',{name:'Live service configuration',exact:true});await setup.getByText(/Neither hotel provider is configured/).waitFor();assert((await setup.innerText()).includes('does not establish successful login'));assert((await setup.innerText()).includes('Real booking, payment, cancellation and refunds are not enabled'));
 await page.unroute('**/api/live/integrations');await page.route('**/api/live/integrations',route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}));await setup.getByRole('button',{name:'Recheck configuration',exact:true}).click();await setup.getByRole('alert').waitFor();assert.equal(await setup.getByText(/Credentials not configured/).count(),0);
 await page.unroute('**/api/live/integrations');await setup.getByRole('button',{name:'Recheck configuration',exact:true}).click();await setup.getByRole('alert').waitFor({state:'hidden'});const actualSetup=await (await context.request.get(origin+'/api/live/integrations')).json();assert.equal(typeof actualSetup.fliggy.configured,'boolean');
 pass('查询前说明凭证配置和交易限制；配置请求失败不沿用旧状态，手动重试恢复。缺配置为合成响应，无商户查询');
}
{
 const result=JSON.parse(readFileSync('docs/cases/live-integrated-product-validation-20261009.json','utf8'));result.alternatives=[{hotel:result.candidates[0].candidate.name,change:'Controlled confirmation-only alternative',remaining:['Final charges unverified']}];
 await page.route('**/api/live/workflow/state',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({running:false,stage:'Controlled proposal navigation',latest:result,monitor:{enabled:false,checks:0}})}));
 await page.goto(`${origin}/live/workflow?lang=en`,{waitUntil:'networkidle'});await page.locator('.journey-steps button').nth(1).click();const originalBudget=await page.getByLabel('Total budget including tax (CNY)',{exact:true}).inputValue();await page.locator('.journey-steps button').nth(3).click();
 let writes=0;const track=(request:any)=>{if(request.method()==='POST'&&request.url().includes('/api/live/workflow/'))writes++;};page.on('request',track);
 await page.getByRole('button',{name:'Review limits before confirming changes',exact:true}).click();assert.equal(await page.getByLabel('Total budget including tax (CNY)',{exact:true}).inputValue(),originalBudget);assert.equal(writes,0);page.off('request',track);await page.unroute('**/api/live/workflow/state');
 pass('条件组合可直接返回偏好确认，预算不自动改变且不发送授权请求；合成导航案例，无商户调用');
}
{
 const fixture=JSON.parse(readFileSync('docs/cases/live-two-review-workflow-20261008.json','utf8')),fresh=new Date().toISOString();fixture.evidenceAsOf=fresh;
 const option=fixture.tradeoffs.options.find((o:any)=>o.status==='within_bounds');assert(option);const hotel=fixture.candidates.find((d:any)=>d.candidate.key===option.candidateKey).candidate,room=hotel.rooms.find((r:any)=>r.ratePlanId===option.ratePlanId);
 hotel.name=option.hotelName='Controlled browser fixture hotel';hotel.route.observedAt=fresh;room.sourceObservedAt=fresh;room.cancellationStatus='free_until';room.cancelUntil=new Date(Date.now()+3600000).toISOString();option.offer={...option.offer,cancellationStatus:'free_until',cancelUntil:room.cancelUntil};
 const selection={id:'controlled-brief-selection',runId:fixture.id,optionId:option.id,evidenceHash:fixture.tradeoffs.evidenceHash,policyVersion:fixture.tradeoffs.policyVersion,hotelName:option.hotelName,roomName:option.roomName,selectedAt:fresh,purpose:'inspection_only',transactionEnabled:false},view=()=>({running:false,stage:'Controlled handoff download',latest:fixture,selection,selectionValid:true,monitor:{enabled:false,checks:0}});
 const draft=serializeWorkflowDraft(fixture.query,fixture.policy);assert(draft);await page.evaluate(({key,value})=>localStorage.setItem(key,value),{key:workflowDraftKey,value:draft});
 await page.route('**/api/live/workflow/state',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(view())}));await page.route('**/api/live/workflow/authorize',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(view())}));
 await page.goto(`${origin}/live/workflow?lang=en`,{waitUntil:'networkidle'});await page.locator('.journey-steps button').nth(1).click();await page.getByLabel('Authorize API / MCP queries and rule checks only. No real purchase authorization.',{exact:true}).check();await page.getByRole('button',{name:'Confirm read-only consent & continue',exact:true}).click();await page.locator('.journey-steps button').nth(4).click();
 const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Save merchant verification brief',exact:true}).click();const downloaded=await downloadEvent;await downloaded.saveAs('docs/cases/merchant-brief-browser-fixture.txt');const brief=readFileSync('docs/cases/merchant-brief-browser-fixture.txt','utf8');assert(brief.includes('not an order'));assert(brief.includes('Controlled browser fixture hotel'));assert(brief.includes(option.ratePlanId));assert(brief.includes(room.sourceObservedAt));assert(brief.includes((fixture.policy.budgetCents/100).toFixed(2)));for(const gap of option.gaps)assert(brief.includes(gap));
 fixture.evidenceAsOf=new Date(Date.now()-16*60000).toISOString();await page.waitForTimeout(2200);assert.equal(await page.getByRole('button',{name:'Save merchant verification brief',exact:true}).count(),0);
 await page.unroute('**/api/live/workflow/state');await page.unroute('**/api/live/workflow/authorize');
 pass('选中方案核验清单实际下载包含房型、原观察和预算限制，过期后入口撤下；控制页面和模拟授权，无真实成交');
}
{
 const fixture=JSON.parse(readFileSync('docs/cases/live-product-regression-20261009.json','utf8'));
 const decision=fixture.candidates.find((d:any)=>d.candidate.key.startsWith('rollinggo:')&&d.candidate.rooms.length>0);assert(decision);
 fixture.candidates=[decision];decision.reasons=[];decision.candidate.route=null;
 for(const room of decision.candidate.rooms){room.cancellationStatus='unknown';room.sourceObservedAt=new Date().toISOString();}
 await page.route('**/api/live/workflow/state',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({running:false,stage:'Controlled evidence gaps',latest:fixture,monitor:{enabled:false,deadline:null,nextCheckAt:null,lastError:null,checks:0}})}));
 await page.goto(`${origin}/live/workflow?lang=en`,{waitUntil:'networkidle'});await page.locator('.journey-steps button').nth(3).click();
 const outcome=page.getByRole('region',{name:'Assessment outcome'});await outcome.locator('summary').filter({hasText:'Priority hotels to inspect'}).click();
 await outcome.getByText(/Cancellation terms unverified/).waitFor();await outcome.getByText(/Route unverified/).waitFor();
 assert(await outcome.getByRole('button',{name:'Refresh rooms and route',exact:true}).isDisabled());
 await page.unroute('**/api/live/workflow/state');
 pass('未知取消条款与缺失路线进入补查入口，未确认授权时刷新禁用；控制证据状态，无商户调用');
}
assert.deepEqual(errors,[]);await context.close();await browser.close();
writeFileSync(resolve('docs/browser-verification.json'),JSON.stringify({executedAt:new Date().toISOString(),environment:'真实Chrome网页操作；虚构酒店与测试资金',checks},null,2));
console.log(`${checks.length} browser integration checks passed.`);
