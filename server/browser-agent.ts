import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Engine } from './engine.ts';
import type { Evaluation, Hotel, Platform, Quote, Review, TradeResult } from '../shared/types.ts';
import { money, PLATFORM_LABELS } from '../shared/types.ts';
import { reviewEvidence } from './model.ts';
import {compareCandidates,newnessYear,shortlist} from '../shared/workflow.ts';

export class BrowserAgent {
  private browser:Browser|null=null;
  private context:BrowserContext|null=null;
  private stopped=false;
  public busy=false;
  private engine:Engine; private origin:string; private session:string;
  constructor(engine:Engine,origin:string,session:string){this.engine=engine;this.origin=origin;this.session=session;}
  async stop(){this.stopped=true; this.engine.setAgent({monitoring:false});}
  private async snapshot(page:Page,type:string,title:string,detail:string,data?:unknown){
    const dir=resolve('public/evidence',this.session); mkdirSync(dir,{recursive:true});
    const name=`${Date.now()}-${randomUUID().slice(0,8)}.jpg`;
    await page.screenshot({path:resolve(dir,name),type:'jpeg',quality:65,fullPage:false});
    this.engine.log(type,title,detail,data,`/evidence/${this.session}/${name}`);
  }
  private check(){if(this.stopped || this.engine.getState().mandate.revoked) throw new Error('授权已撤销或监控已停止，停止新增交易。');}
  private async readDetail(page:Page,p:Platform,id:string):Promise<Evaluation>{
    await page.goto(`${this.origin}/platform/${p}/hotel/${id}`,{waitUntil:'networkidle'});
    await page.locator('[data-visible-quote]').waitFor();
    const visible=await page.locator('[data-visible-quote]').evaluate(el=>({quote:JSON.parse(el.getAttribute('data-visible-quote')!),hotel:JSON.parse(el.getAttribute('data-visible-hotel')!)})) as {quote:Quote;hotel:Hotel};
    const reviews=await page.locator('[data-review]').evaluateAll(nodes=>nodes.map(el=>JSON.parse(el.getAttribute('data-review')!))) as Review[];
    let observedReviews=reviews;
    if(this.engine.getState().agent.mode==='model'){
      const analysis=await reviewEvidence(reviews);observedReviews=analysis.reviews;
      this.engine.log('model_evidence','模型评论提取与原文校验',analysis.provider,analysis);
    }
    const evaluation=this.engine.evaluate(visible.quote,observedReviews);
    this.engine.log('review','读取酒店与评论',`${PLATFORM_LABELS[p]} · ${visible.hotel.name}：阅读${reviews.length}条评论，${evaluation.conflicts.length?evaluation.conflicts.join('；'):evaluation.reasons.join('；')}`,{hotelId:id,platform:p,reviewIds:reviews.map(r=>r.id),quote:visible.quote,eligible:evaluation.eligible});
    return evaluation;
  }
  private async checkout(page:Page,c:Evaluation,replacementFor?:string):Promise<TradeResult>{
    this.check();this.engine.setAgent({phase:'booking'});
    const link=`${this.origin}/platform/${c.quote.platform}/checkout/${c.hotel.id}${replacementFor?`?replacementFor=${replacementFor}`:''}`;
    await page.goto(link,{waitUntil:'networkidle'});
    await page.locator('[data-checkout-quote]').waitFor();
    await this.snapshot(page,'checkout','复核结算价格与取消条款',`${c.hotel.name} · 当前网页结算价格，服务端将重新核验授权。`,{replacementFor});
    this.check();
    await page.getByRole('button',{name:'确认支付并预订',exact:true}).click();
    await page.locator('[data-trade-result]').waitFor();
    const result=await page.locator('[data-trade-result]').evaluate(el=>JSON.parse(el.getAttribute('data-trade-result')!)) as TradeResult;
    await this.snapshot(page,result.ok?'browser_booked':'browser_blocked',result.ok?'网页预订已确认':'网页交易被阻止',result.ok?`${c.hotel.name} · ${money(result.order!.paidCents)}，订单${result.order!.id}`:result.reason||'交易未成功',result);
    return result;
  }
  private async cancelThroughPage(page:Page,platform:Platform,orderId:string,compensation=false):Promise<TradeResult>{
    await page.goto(`${this.origin}/platform/${platform}/orders${compensation?'?compensation=true':''}`,{waitUntil:'networkidle'});
    const order=page.locator(`[data-order-id="${orderId}"]`); await order.waitFor();
    await order.getByRole('button',{name:'取消订单',exact:true}).click();
    await page.locator('[data-trade-result]').waitFor();
    const result=await page.locator('[data-trade-result]').evaluate(el=>JSON.parse(el.getAttribute('data-trade-result')!)) as TradeResult;
    await this.snapshot(page,'browser_cancel',compensation?'补偿取消新订单':'取消原订单并申请退款',result.ok?'取消成功；退款实际到账前仍计入占款。':result.reason||'取消未成功',result);
    return result;
  }
  private alternatives(candidates:Evaluation[]){
    this.engine.setCandidates(candidates);
    this.engine.publishAlternatives();
  }
  async run(){
    if(this.busy)return;
    this.busy=true; this.stopped=false;
    const state=this.engine.getState();
    if(!state.mandate.confirmed||state.mandate.revoked||state.clock.now>=state.mandate.expiresAt){this.busy=false;this.engine.setAgent({monitoring:false});this.engine.log('blocked','无法启动','请先确认有效授权单。');return;}
    const ledgerFrozen=this.engine.hasLedgerFreeze();
    if(ledgerFrozen){this.busy=false;this.engine.setAgent({monitoring:false});this.engine.log('blocked','交易冻结，需先核对订单','存在未解决的取消、退款或多订单状态，不能用重启任务清除。');return;}
    if(!this.engine.lastOrder()&&state.clock.now>=state.mandate.firstDeadline){this.engine.publishAlternatives();this.busy=false;return;}
    this.engine.setAgent({running:true,phase:'screening',...(state.wallet.refundPendingCents===0?{error:null}:{})});
    if(state.clock.running)this.engine.log('clock_guard','浏览期间暂缓仿真时钟','网页交易执行期间暂缓自动推进，结束后恢复设置的速度；避免加速回放越过最后核验窗口。');
    let page:Page|undefined;
    let pendingReplacement:{newOrderId:string;newPlatform:Platform;oldOrderId:string}|null=null;
    try {
      const executable=process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      this.browser=await chromium.launch({headless:true,...(existsSync(executable)?{executablePath:executable}:{}),args:['--disable-dev-shm-usage']});
      const video=process.env.RECORD_VIDEO==='1';
      this.context=await this.browser.newContext({viewport:{width:1440,height:960},...(video?{recordVideo:{dir:resolve('docs/recordings'),size:{width:1440,height:960}}}:{})});
      await this.context.addCookies([{name:'staypilot_session',value:this.session,url:this.origin,httpOnly:true,sameSite:'Lax'}]);
      page=await this.context.newPage();
      const candidates:Evaluation[]=[];
      for(const platform of ['a','b','c'] as Platform[]){
        this.engine.setAgent({phase:platform==='a'?'screening':'comparing'});
        this.check();
        await page.goto(`${this.origin}/platform/${platform}`,{waitUntil:'networkidle'});
        await page.locator('[data-hotel-id]').first().waitFor();
        await page.getByLabel('最低评分',{exact:true}).fill(String(platform==='b'?state.mandate.floorScore*2:state.mandate.floorScore));
        await Promise.all([page.waitForResponse(r=>r.url().includes(`/api/platform/${platform}/hotels`)&&r.request().method()==='GET'),page.getByRole('button',{name:'搜索酒店',exact:true}).click()]);
        await page.waitForTimeout(100);
        const cards=await page.locator('[data-hotel-id][data-quote]').evaluateAll(nodes=>nodes.map(el=>({hotel:JSON.parse(el.getAttribute('data-hotel')!),quote:JSON.parse(el.getAttribute('data-quote')!)}))) as {hotel:Hotel;quote:Quote}[];
        await this.snapshot(page,'browse',`浏览${PLATFORM_LABELS[platform]}`,`已从当前网页筛选并观察${cards.length}个报价，评分保留平台原始尺度。`,{platform,hotelIds:cards.map(c=>c.hotel.id)});
        // Evaluate every visible listing, then read the strongest five and the current hotel in depth.
        const feasible=(c:Evaluation)=>c.quote.inventory>0&&newnessYear(c.hotel,state.mandate)!==null&&state.mandate.requiredAmenities.every(a=>c.hotel.amenities.includes(a))&&(c.quote.cancellation!=='nonrefundable'||state.mandate.allowNonrefundable)&&c.quote.totalCents<=state.mandate.budgetCents;
        const initial=cards.map(c=>this.engine.evaluate(c.quote,[])).sort((a,b)=>Number(feasible(b))-Number(feasible(a))||a.tier-b.tier||a.quote.totalCents-b.quote.totalCents);
        const active=this.engine.lastOrder();
        const picks=[...initial.slice(0,5),...initial.filter(c=>c.hotel.id===active?.hotelId)].filter((c,i,a)=>a.findIndex(v=>v.hotel.id===c.hotel.id)===i);
        if(platform==='a')this.engine.log('intent','平台 A 初步意向清单','按首选档位与已见含税价格初筛；评论尚未读完，不能凭列表直接购买。',{hotelIds:picks.map(c=>c.hotel.id),mandateVersion:state.mandate.version});
        const local:Evaluation[]=[];
        for(const c of picks){this.check();local.push(await this.readDetail(page,platform,c.hotel.id));}
        if(local.filter(c=>c.eligible).length<4){
          for(const c of initial.filter(c=>feasible(c)&&!picks.some(p=>p.hotel.id===c.hotel.id))){
            this.check();local.push(await this.readDetail(page,platform,c.hotel.id));
            if(local.filter(c=>c.eligible).length>=4)break;
          }
        }
        candidates.push(...local);this.engine.setCandidates(candidates);
      }
      this.engine.setAgent({phase:'evaluating'});
      const sorted=candidates.sort(compareCandidates);
      this.engine.setCandidates(sorted);
      this.engine.log('decision','跨平台候选排序','先核验住宿底线，再按降级档位、个人差评风险、含税总价和通勤排序；不合格报价保留淘汰依据。',{shortlist:shortlist(sorted).map(c=>({hotelId:c.hotel.id,platform:c.quote.platform,role:c.hotel.id===shortlist(sorted)[0]?.hotel.id?'首选':'备选',matchScore:c.matchScore})),candidates:sorted.map(c=>({hotel:c.hotel.name,platform:c.quote.platform,totalCents:c.quote.totalCents,tier:c.tier,risk:c.risk,eligible:c.eligible,reasons:c.reasons,conflicts:c.conflicts}))});
      const current=this.engine.getState(), active=this.engine.lastOrder();
      if(current.mandate.revoked||!current.mandate.confirmed||current.clock.now>=current.mandate.expiresAt){this.engine.log('blocked','授权失效','停止新增购买，保留已有住宿。');return;}
      if(!active){
        if(current.clock.now>=current.mandate.firstDeadline){this.alternatives(sorted);return;}
        let booked=false;
        for(const candidate of sorted.filter(c=>c.eligible).slice(0,3)){
          const result=await this.checkout(page,candidate); if(result.ok){booked=true;break;}
          if(['authorization_required','authorization_expired','authorization_version'].includes(result.code||''))break;
        }
        if(!booked){this.engine.log('waiting','暂无可自动预订方案','继续监控；预算与硬底线保持原授权范围。');if(!sorted.some(c=>c.eligible))this.engine.publishAlternatives();}
      }else{
        if(active.quote.cancellation==='nonrefundable'||!active.quote.cancelUntil||current.clock.now>=active.quote.cancelUntil-3600000||current.clock.now>=current.mandate.optimizeUntil){
          this.engine.setAgent({monitoring:false});this.engine.log('locked','住宿已锁定','不可取消、取消窗口不足或优化期限已到，停止换订。');return;
        }
        if(current.wallet.refundPendingCents>0||current.orders.some(o=>o.status==='cancel_failed')){this.engine.log('blocked','等待退款或人工处理','退款未到账或订单取消异常，冻结继续换订。');return;}
        const alternatives=sorted.filter(c=>c.eligible&&c.tier<=active.tier&&c.risk<=active.risk&&c.quote.cancellation==='free_until'&&c.quote.cancelUntil!==null&&c.quote.cancelUntil>current.clock.now+3600000&&active.paidCents-c.quote.totalCents>=current.mandate.minSavingsCents&&(active.paidCents-c.quote.totalCents)/active.paidCents*100>=current.mandate.minSavingsPercent);
        const best=alternatives[0];
        if(best){
          this.engine.log('rebook_decision','发现值得换订的方案',`${active.hotelName} → ${best.hotel.name}，预计净省${money(active.paidCents-best.quote.totalCents)}；先订新，再退旧。`,{oldOrder:active.id,newQuote:best.quote});
          const newResult=await this.checkout(page,best,active.id);
          if(newResult.ok){
            pendingReplacement={newOrderId:newResult.order!.id,newPlatform:newResult.order!.platform,oldOrderId:active.id};
            if(this.engine.getState().mandate.revoked){await this.cancelThroughPage(page,newResult.order!.platform,newResult.order!.id,true);return;}
            const oldResult=await this.cancelThroughPage(page,active.platform,active.id);
            if(!oldResult.ok){
              const rollback=await this.cancelThroughPage(page,newResult.order!.platform,newResult.order!.id,true);
              this.engine.setAgent({monitoring:false,phase:rollback.ok?'原订单保留，等待补偿退款':'持有两单，需要人工处理',error:oldResult.reason||'取消原订单失败'});
              this.engine.log('compensation','换订补偿结果',rollback.ok?'原订单保留，新订单已申请退款。':'两笔订单仍需核对，已冻结进一步购买。',{oldResult,rollback});
            }
            pendingReplacement=null;
          }
        }else this.engine.log('waiting','保留当前酒店','尚无偏好匹配不下降、净节省同时满足金额与比例门槛的报价。');
      }
    }catch(e){
      // A lost UI response can still have committed. Reconcile the merchant ledger before retrying.
      const held=this.engine.getState().orders;
      if(!pendingReplacement){const pair=held.find(o=>o.status==='confirmed'&&o.replacementFor&&held.some(p=>p.id===o.replacementFor&&(p.status==='confirmed'||p.status==='cancel_failed')));if(pair)pendingReplacement={newOrderId:pair.id,newPlatform:pair.platform,oldOrderId:pair.replacementFor!};}
      if(pendingReplacement&&page){
        try{const currentOrders=this.engine.getState().orders;const parent=currentOrders.find(o=>o.id===pendingReplacement!.oldOrderId);if(parent&&(parent.status==='confirmed'||parent.status==='cancel_failed')){const compensation=await this.cancelThroughPage(page,pendingReplacement.newPlatform,pendingReplacement.newOrderId,true);this.engine.log('compensation','浏览异常后核对与补偿',compensation.ok?'保留原住宿，新单退款处理中。':'补偿不确定，冻结继续交易。',compensation);}}catch{this.engine.log('reconciliation','交易结果不确定','新旧订单与退款需人工核对；未自动再下单。',pendingReplacement);}
        this.engine.setAgent({monitoring:false});
      }
      const message=e instanceof Error?e.message:String(e); this.engine.setAgent({error:message});this.engine.log('error','浏览任务未完成',message);
      if(page)try{await this.snapshot(page,'error_page','异常页面证据',message);}catch{}
    }finally{
      await this.context?.close().catch(()=>{}); await this.browser?.close().catch(()=>{});this.context=null;this.browser=null;this.busy=false;
      const current=this.engine.getState();this.engine.setAgent({running:false,phase:current.agent.error?'frozen':current.agent.monitoring?'monitoring':'complete',lastRunAt:current.clock.now,nextRunAt:current.clock.now+30*60000});
    }
  }
}
