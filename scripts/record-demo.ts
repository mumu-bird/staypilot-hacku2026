import { chromium } from 'playwright';
import { mkdirSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir, platform } from 'node:os';
import { resolve } from 'node:path';
import type { State } from '../shared/types.ts';
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:4173';
mkdirSync('docs/recordings',{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:'docs/recordings',size:{width:1440,height:900}}});
const page=await context.newPage();page.on('dialog',dialog=>void dialog.accept());
const begin=Date.now();
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function caption(text:string,seconds=6){console.log(text);await page.evaluate(text=>{let el=document.getElementById('demo-caption');if(!el){el=document.createElement('div');el.id='demo-caption';el.style.cssText='position:fixed;bottom:18px;left:250px;right:24px;z-index:9999;background:rgba(15,30,55,.94);color:white;padding:16px 22px;font:500 20px/1.6 -apple-system,PingFang SC,sans-serif;border-radius:10px;box-shadow:0 5px 20px #0003;pointer-events:none';document.body.appendChild(el);}el.textContent=text;},text);await pause(seconds*1000);}
async function tab(name:string){await page.goto(origin,{waitUntil:'networkidle'});await page.getByRole('button',{name:new RegExp('^'+name)}).click();}
async function settle(){const started=Date.now();while(Date.now()-started<120000){const r=await context.request.get(origin+'/api/state');const state=await r.json() as State;if(!state.agent.running){if(state.agent.error)throw new Error(state.agent.error);return state;}await pause(500);}throw new Error('浏览任务超时');}
try{
 await page.goto(origin,{waitUntil:'networkidle'});
 await context.request.post(origin+'/api/reset',{data:{scenario:'baseline'}});await page.reload({waitUntil:'networkidle'});
 await caption('StayPilot：交付一笔预算，让酒店选择在你的授权范围内自主完成。全部房源、评论和交易均为仿真。',6);
 await page.getByRole('button',{name:'保存行程，下一步',exact:true}).click();await page.getByLabel('期望开业年份',{exact:false}).fill('2025');
 await page.locator('.journey-summary').scrollIntoViewIfNeeded();
 await caption('预算1,000元；偏好近年开业、步行可达、高评分。卫生、隔音与气味为底线，先授权可调整的条件。',6);
 await page.locator('.downgrade-list').scrollIntoViewIfNeeded();await page.getByRole('button',{name:'上移开业 · 近年开业 → 不限年份',exact:true}).click();await caption('本次用户选择先放宽开业年份，再放宽距离；评论中的不可接受问题始终不能放宽。',5);
 await page.locator('.consent input').check();await page.getByRole('button',{name:/确认授权并保存/}).click();await pause(800);
 await caption('用户明确确认授权。不可取消房默认禁止自动购买；换订至少净省50元且5%。',5);
 for(const [platform,text] of [['a','平台A：先查高评分酒店，形成意向名单。'],['b','平台B：同一酒店的价格和评分尺度不同，需核验相同入住条件。'],['c','平台C：报价更低，但不可取消。取消权也是价格比较的一部分。']]){await page.goto(`${origin}/platform/${platform}`,{waitUntil:'networkidle'});await page.locator('[data-hotel-id]').first().waitFor();await caption(text,5);}
 await tab('选酒店流程');await page.getByRole('button',{name:'开始自动选酒店',exact:true}).click();await caption('智能体正在真实浏览三个网页、读取评论和报价。最高偏好无解时，按已授权顺序降级。',3);const first=await settle();
 if(first.orders.length!==1||first.orders[0].hotelId!=='h01'||first.orders[0].tier===0)throw new Error('降级预订场景未按预期执行');
 await tab('选酒店流程');await page.getByRole('button',{name:/^04 三平台比价/}).click();await caption('湖畔时光酒店符合住宿底线。开业年份按授权放宽，平台A可取消总价455元；平台C低价因未授权不可取消而排除。',7);
 await page.locator('.evidence-details').first().locator('summary').click();await page.locator('.evidence-details').first().scrollIntoViewIfNeeded();await caption('评论原文可核验：早餐一般对本用户权重为0；噪声、卫生与气味投诉会直接排除。',6);
 await tab('任务总览');await page.getByRole('button',{name:'+30 分钟',exact:true}).click();await pause(800);await page.getByRole('button',{name:/启动一次决策/}).click();await caption('推进30仿真分钟：竞品在平台B降价。智能体重新浏览，必须保持偏好匹配不下降。',3);const changed=await settle();
 if(changed.orders.length!==2||changed.orders[1].hotelId!=='h03'||changed.wallet.refundPendingCents!==45500)throw new Error('换订或退款状态未按预期执行');
 await tab('选酒店流程');await page.getByRole('button',{name:/^06 订后监控/}).click();await caption('新酒店315元，净省140元。先订新房，再退旧房；退款未到账时占款770元，可用余额230元。',9);
 await tab('任务总览');await page.getByRole('button',{name:'+30 分钟',exact:true}).click();await pause(800);await caption('退款实际到账后才释放资金：可用余额685元。当前住宿成本315元，历史交易和规则依据保持可核验。',7);
 await page.getByLabel('演示场景').selectOption('tax_spike');await page.getByRole('button',{name:'重置场景',exact:true}).click();await pause(800);
 await tab('偏好与授权');await page.locator('.consent input').check();await page.getByRole('button',{name:/确认授权并保存/}).click();await pause(800);
 await page.goto(`${origin}/platform/a/hotel/h01`,{waitUntil:'networkidle'});await caption('异常场景：最初看到455元的报价。结算前市场税费发生变化。',5);
 await context.request.post(origin+'/api/clock',{data:{minutes:30}});await page.goto(`${origin}/platform/a/checkout/h01`,{waitUntil:'networkidle'});await page.getByRole('button',{name:'确认支付并预订',exact:true}).click();await page.locator('[data-trade-result]').waitFor();await caption('结算总价超过预算，服务端实际阻止扣款。智能体没有权限因为价格变化而自行增加预算。',8);
 await tab('订单与决策');await caption('授权、页面证据、命中规则与执行结果可核验；日志保留两种时间，支持导出。',5);
 await page.goto(origin+'/live/fliggy',{waitUntil:'networkidle'});await page.getByRole('button',{name:'查询真实酒店',exact:true}).click();await page.locator('.live-hotel').first().waitFor({timeout:60000});await page.locator('.live-hotels').scrollIntoViewIfNeeded();await caption('飞猪官方接口已返回真实搜索价。含税成交报价与订单权限未核验，真实下单仍阻断；前面的交易闭环使用测试资金。',7);
 const remaining=180000-(Date.now()-begin);if(remaining>0){await caption('六步选择流程 · 三平台测试交易 · 评论与降级 · 换订与阻断。飞猪真实查询已验证，真实订单与支付尚未启用。',0);await pause(Math.min(remaining,55000));const rest=180000-(Date.now()-begin);if(rest>0)await pause(rest);}
 const video=page.video()!;await context.close();const path=await video.path();
 const cache=process.env.PLAYWRIGHT_BROWSERS_PATH||resolve(homedir(),platform()==='darwin'?'Library/Caches/ms-playwright':platform()==='win32'?'AppData/Local/ms-playwright':'.cache/ms-playwright');
 const executable=platform()==='darwin'?'ffmpeg-mac':platform()==='win32'?'ffmpeg-win64.exe':'ffmpeg-linux';
 const ffmpeg=process.env.FFMPEG_PATH||(existsSync(cache)?readdirSync(cache).filter(x=>x.startsWith('ffmpeg-')).sort().reverse().map(x=>resolve(cache,x,executable)).find(existsSync):undefined);
 if(!ffmpeg)throw new Error('请执行 npx playwright install ffmpeg，或设置 FFMPEG_PATH 后重录。');
 execFileSync(ffmpeg,['-loglevel','error','-i',path,'-t','180','-c','copy','-y','docs/demo-3min.webm']);
 writeFileSync('docs/recording-summary.json',JSON.stringify({recordedAt:new Date().toISOString(),executionDurationSeconds:(Date.now()-begin)/1000,videoDurationSeconds:180,editing:'在结尾静止字幕画面处无重编码裁至180秒，实际交互段保留。',source:'实际Chrome网页录制，字幕说明；虚构酒店和测试资金',demonstrated:['授权与降级','三平台网页浏览','评论证据','455元预订','315元跨平台换订','未到账退款占款','退款释放余额','税费超预算阻断','决策与交易记录','六步独立界面','真实飞猪只读查询']},null,2));console.log('Saved docs/demo-3min.webm');
}finally{await context.close().catch(()=>{});await browser.close();}
