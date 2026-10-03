import { createHash, randomUUID } from 'node:crypto';
import type { Alternative, AuditEvent, BookingRequest, CancelRequest, Evaluation, Hotel, Mandate, Order, Platform, Quote, Review, State, TradeResult } from '../shared/types.ts';
import { ISSUE_LABELS, PLATFORM_LABELS, money } from '../shared/types.ts';
import { BASE_TIME, HOUR, MINUTE, SCENARIOS, defaultMandate, makeQuote, seedHotels, seedReviews } from './seed.ts';
import { SQLiteStore } from './store.ts';

interface Checkpoint {state: State; revision: number; quotes: Record<string,Quote>; outcomes: Record<string,{fingerprint:string; result:TradeResult}>; cancellationFailureUsed:boolean;}
const copy = <T>(value:T):T => structuredClone(value);
const platforms: Platform[] = ['a','b','c'];

export class Engine {
 store: SQLiteStore;
 private state: State;
 private revision = 1;
 private quotes: Record<string,Quote> = {};
 private outcomes: Checkpoint['outcomes'] = {};
 private cancellationFailureUsed = false;

 constructor(dbPath: string) {
   this.store = new SQLiteStore(dbPath);
   const saved = this.store.read<Checkpoint>();
   if (saved) {this.state=saved.state; this.revision=saved.revision; this.quotes=saved.quotes; this.outcomes=saved.outcomes; this.cancellationFailureUsed=saved.cancellationFailureUsed; this.state.agent.running=false; this.state.clock.running=false;this.state.mandate.windowPreference??='required';const catalog=seedHotels();for(const h of this.state.hotels)h.hasWindow??=catalog.find(s=>s.id===h.id)?.hasWindow??null;for(const q of Object.values(this.quotes))q.hasWindow??=this.state.hotels.find(h=>h.id===q.hotelId)?.hasWindow??null;}
   else {this.state=this.initial('baseline'); this.log('system','仿真市场已准备','20 家酒店、3 家独立平台、测试资金和订单已就绪。请确认授权后启动智能体。');}
 }

 private initial(scenario:string): State {
   return {clock:{now:BASE_TIME,running:false,speed:60,startedAt:BASE_TIME}, scenario,scenarioLabel:SCENARIOS[scenario],
     mandate:defaultMandate(),wallet:{initialCents:100000,availableCents:100000,exposureCents:0,realizedCostCents:0,refundPendingCents:0},
     orders:[],events:[],candidates:[],alternatives:[],hotels:seedHotels(),observationCount:0,
     agent:{running:false,monitoring:false,phase:'等待确认授权',error:null,lastRunAt:null,nextRunAt:null,mode:'deterministic'}};
 }

 getState(): State {return copy(this.state);}
 getHotels(): Hotel[] {return copy(this.state.hotels);}
 persist(): void {this.store.write({state:this.state,revision:this.revision,quotes:this.quotes,outcomes:this.outcomes,cancellationFailureUsed:this.cancellationFailureUsed} satisfies Checkpoint);}
 close(): void {this.store.close();}
 lastOrder(): Order|undefined {return copy(this.state.orders.filter(order=>order.status==='confirmed'||order.status==='cancel_failed').at(-1));}
 hasLedgerFreeze():boolean {
   const active=this.state.orders.filter(order=>order.status==='confirmed'||order.status==='cancel_failed');
   return active.length>1||active.some(order=>order.status==='cancel_failed')||this.state.orders.some(order=>order.status==='refund_pending'&&order.refundDueAt===null);
 }

 log(type:string,title:string,detail:string,data?:unknown,screenshot?:string): AuditEvent {
   const previousHash=this.state.events.at(-1)?.hash ?? '0'.repeat(64);
   const payload={id:randomUUID(),sequence:this.state.events.length+1,time:this.state.clock.now,realTime:new Date().toISOString(),type,title,detail,...(data === undefined?{}:{data:copy(data)}),...(screenshot?{screenshot}:{}),previousHash};
   const event:AuditEvent={...payload,hash:createHash('sha256').update(JSON.stringify(payload)).digest('hex')};
   this.state.events.push(event); this.persist(); return copy(event);
 }

 setAgent(patch:Partial<State['agent']>): void {this.state.agent={...this.state.agent,...patch};this.persist();}
 setCandidates(candidates:Evaluation[]): void {this.state.candidates=copy(candidates);this.persist();}
 setAlternatives(alternatives:Alternative[]): void {this.state.alternatives=copy(alternatives.slice(0,3));this.persist();}

 private quote(platform:Platform,hotel:Hotel):Quote {
   const id=`${platform}-${hotel.id}-v${this.revision}`;
   let result=this.quotes[id];
   if (!result || result.expiresAt <= this.state.clock.now) {
     result=makeQuote(platform,hotel,this.state.clock.now,this.state.scenario,this.revision,this.state.mandate);
     const reserved=this.state.orders.filter(order=>order.platform===platform&&order.hotelId===hotel.id&&(order.status==='confirmed'||order.status==='cancel_failed')).reduce((count,order)=>count+order.quote.rooms,0);
     result.inventory=Math.max(0,result.inventory-reserved);
     this.quotes[id]=result;
   }
   return result;
 }
 getQuote(id:string):Quote|undefined {const quote=this.quotes[id];return quote?copy(quote):undefined;}

 list(platform:Platform,filters:{minScore?:number;maxPrice?:number;query?:string}={}):{hotel:Hotel;quote:Quote}[] {
   if (!platforms.includes(platform)) throw new Error('未知平台');
   this.state.observationCount++;
   const query=filters.query?.trim().toLowerCase();
   const items=this.state.hotels.map(hotel=>({hotel,quote:this.quote(platform,hotel)})).filter(({hotel,quote})=>(!query||`${hotel.name} ${hotel.district} ${hotel.address}`.toLowerCase().includes(query))
     && (filters.minScore===undefined||quote.score>=filters.minScore) && (filters.maxPrice===undefined||quote.totalCents<=filters.maxPrice));
   items.sort((a,b)=>b.quote.score/b.quote.scoreMax-a.quote.score/a.quote.scoreMax || Number(a.hotel.openingYear===null)-Number(b.hotel.openingYear===null)||a.quote.totalCents-b.quote.totalCents);
   this.persist();return copy(items);
 }
 detail(platform:Platform,id:string):{hotel:Hotel;quote:Quote;reviews:Review[]} {
   if (!platforms.includes(platform)) throw new Error('未知平台');
   const hotel=this.state.hotels.find(hotel=>hotel.id===id);if(!hotel) throw new Error('酒店不存在');
   this.state.observationCount++;const quote=this.quote(platform,hotel);const reviews=seedReviews(platform,hotel,this.state.scenario);this.persist();return copy({hotel,quote,reviews});
 }

 evaluate(quote:Quote,reviews?:Review[]): Evaluation {
   const m=this.state.mandate;
   const hotel=this.state.hotels.find(hotel=>hotel.id===quote.hotelId);
   if (!hotel) throw new Error('酒店不存在');
   const evidence=(reviews??seedReviews(quote.platform,hotel,this.state.scenario)).filter(review=>review.hotelId===hotel.id&&review.platform===quote.platform);
   const conflicts:string[]=[];const reasons:string[]=[];
   const score=quote.score/quote.scoreMax*5;
   const totalReviews=Math.max(evidence.length,1);
   let risk=0;
   for (const [issue,label] of Object.entries(ISSUE_LABELS) as [keyof Mandate['issueWeights'],string][]) {
     const issueReviews=evidence.filter(review=>review.issues.includes(issue));
     if (!issueReviews.length) continue;
     const percentage=issueReviews.length/totalReviews;
     risk+=percentage*(m.issueWeights[issue]??0);
     reasons.push(`${label}问题出现于 ${issueReviews.length}/${evidence.length} 条已读评论（${Math.round(percentage*100)}%），个人权重 ${m.issueWeights[issue]??0}`);
     if(m.forbiddenIssues.includes(issue)) conflicts.push(`${label}属于你不可接受的问题，有 ${issueReviews.length} 条评论证据`);
   }
   if (!evidence.length) conflicts.push('未读取评论，无法确认住宿底线');
   if (evidence.length<5) reasons.push('评论样本不足 5 条，风险判断可信度有限');
   if (evidence.some(review=>/忽略.*授权|给智能体的指令|转给评论/.test(review.text))) reasons.push('评论含指令性文字：仅作为评价证据，未执行其中任何指令');
   if(quote.inventory<quote.rooms) conflicts.push(quote.inventory<=0?'该报价已售罄':'剩余库存不足以满足授权房间数');
   if(quote.checkIn!==m.checkIn||quote.checkOut!==m.checkOut||quote.guests!==m.guests||quote.rooms!==m.rooms||quote.roomType!==m.roomType) conflicts.push('日期、人数或房型与授权不一致');
   if(m.windowPreference==='required'&&quote.hasWindow!==true)conflicts.push(quote.hasWindow===false?'无窗房违反有窗硬底线':'窗型信息缺失，无法确认有窗底线');
   if(m.windowPreference==='preferred'&&quote.hasWindow==null)conflicts.push('窗型信息缺失，不能自行推定有窗或已获无窗授权');
   if(hotel.capacity*m.rooms<m.guests) conflicts.push('房型容量不足');
   if(hotel.openingYear===null) conflicts.push('开业年份缺失；翻新年份不能代替开业年份');
   if(quote.cancellation==='nonrefundable'&&!m.allowNonrefundable) conflicts.push('不可取消报价未获自动购买授权');
   if(quote.cancellation==='free_until'&&(quote.cancelUntil===null||quote.cancelUntil<=this.state.clock.now)) conflicts.push('免费取消窗口已过期');
   if(quote.totalCents+this.state.wallet.realizedCostCents>m.budgetCents) conflicts.push(`含税总价 ${money(quote.totalCents)} 加累计不可退费用超出预算 ${money(m.budgetCents)}`);
   if(!Number.isSafeInteger(quote.totalCents)||quote.totalCents<0||quote.totalCents!==quote.baseCents+quote.taxCents) conflicts.push('报价金额无法核验');
   let relaxDistance=false,relaxOpening=false,relaxRating=false,relaxWindow=false;
   let tier=m.downgradeOrder.length+1;
   const fits=()=> (relaxDistance?(hotel.walkMinutes<=m.walkMax||(hotel.metroDirect&&hotel.metroMinutes<=m.metroMax)):hotel.walkMinutes<=m.walkMax)
     && (relaxOpening||hotel.openingYear!==null&&hotel.openingYear>=m.openingMin)
     && score >= (relaxRating?m.floorScore:m.minScore)
     && (m.windowPreference!=='preferred'||quote.hasWindow===true||relaxWindow);
   if(fits())tier=0;
   else for(let i=0;i<m.downgradeOrder.length;i++) {const step=m.downgradeOrder[i];if(step==='distance')relaxDistance=true;if(step==='opening')relaxOpening=true;if(step==='rating')relaxRating=true;if(step==='window')relaxWindow=true;if(fits()){tier=i+1;break;}}
   if(tier>m.downgradeOrder.length) conflicts.push('已用尽授权降级顺序，距离、开业年份、评分或窗型仍不满足最低条件');
   reasons.unshift(`${PLATFORM_LABELS[quote.platform]}评分 ${quote.score}/${quote.scoreMax}，平台总计 ${quote.reviewCount} 条；本次实际读取 ${evidence.length} 条`,
     `含税 ${money(quote.totalCents)}（税费 ${money(quote.taxCents)}），步行 ${hotel.walkMinutes} 分钟 / 地铁 ${hotel.metroMinutes} 分钟${hotel.metroDirect?'直达':'需换乘'}`,
     `开业 ${hotel.openingYear??'未知'}${hotel.renovatedYear?`，翻新 ${hotel.renovatedYear}（分别核验）`:''}；${quote.hasWindow===true?'有窗':quote.hasWindow===false?'无窗':'窗型未知'}；${quote.cancellation==='nonrefundable'?'不可取消':'限时免费取消'}`);
   if(tier>0&&tier<=m.downgradeOrder.length)reasons.push(`使用第 ${tier} 档授权：${m.downgradeOrder.slice(0,tier).map(s=>({distance:'地铁直达',opening:'不限开业年份',rating:'允许低评分但问题可接受',window:'有窗优先 → 可接受无窗'})[s]).join(' → ')}`);
   if(tier===0)reasons.push('无需降级，符合全部首选条件');
   return copy({quote,hotel,eligible:conflicts.length===0,tier,risk:Number(risk.toFixed(6)),reasons,conflicts,evidence});
 }

 updateMandate(patch:Partial<Mandate>,confirm=false):State {
   const allowed={...patch};delete allowed.id;delete allowed.version;delete allowed.confirmed;delete allowed.revoked;
   const next={...this.state.mandate,...allowed,issueWeights:{...this.state.mandate.issueWeights,...allowed.issueWeights},version:this.state.mandate.version+1,confirmed:confirm,revoked:false};
   this.validateMandate(next);
   this.state.mandate=next;this.state.candidates=[];this.state.alternatives=[];this.revision++;this.quotes={};
   this.log('authorization',confirm?'授权单已确认':'授权草稿已更新',`授权版本 ${next.version}，住宿预算 ${money(next.budgetCents)}，临时占款上限 ${money(next.peakCents)}。${confirm?'智能体可在这些边界内自主执行。':'等待用户确认；禁止购买。'}`,{mandate:next});
   return this.getState();
 }
 private validateMandate(m:Mandate):void {
   const amounts=[m.budgetCents,m.peakCents,m.minSavingsCents];if(amounts.some(x=>!Number.isSafeInteger(x)||x<0))throw new Error('预算及金额必须是非负人民币分');
   if(!Number.isSafeInteger(m.guests)||!Number.isSafeInteger(m.rooms)||m.guests<1||m.rooms<1||m.guests>20||m.rooms>10)throw new Error('入住人数或房间数不合法');
   const validDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
   if(!validDate(m.checkIn)||!validDate(m.checkOut)||Date.parse(m.checkOut)<=Date.parse(m.checkIn))throw new Error('入住和离店必须是有效日期，入住日期必须早于离店日期');
   if([m.firstDeadline,m.optimizeUntil,m.expiresAt,m.walkMax,m.metroMax,m.minScore,m.floorScore,m.openingMin,m.minSavingsPercent].some(x=>!Number.isFinite(x)))throw new Error('授权条件须为有限数值');
   if(m.firstDeadline<=this.state.clock.now||m.expiresAt<=this.state.clock.now||m.optimizeUntil<m.firstDeadline)throw new Error('首次截止和授权期限必须在未来，优化期限不得早于首次截止');
   if(m.floorScore<0||m.minScore>5||m.floorScore>m.minScore||m.walkMax<0||m.metroMax<0||m.minSavingsPercent<0||m.minSavingsPercent>100)throw new Error('评分、距离或换订门槛不合法');
   if(m.downgradeOrder.length>4||new Set(m.downgradeOrder).size!==m.downgradeOrder.length||m.downgradeOrder.some(s=>!['distance','opening','rating','window'].includes(s)))throw new Error('降级顺序不能重复');
   if(m.forbiddenIssues.some(issue=>!(issue in ISSUE_LABELS))||Object.values(m.issueWeights).some(w=>!Number.isFinite(w)||w<0||w>10))throw new Error('评论底线或权重不合法');
   if(!['required','preferred','any'].includes(m.windowPreference))throw new Error('窗型授权无效');
   if(typeof m.destination!=='string'||!m.destination.trim()||typeof m.roomType!=='string'||!m.roomType.trim()||typeof m.allowNonrefundable!=='boolean')throw new Error('目的地、房型或不可取消权限不合法');
 }
 revoke():State {
   this.state.mandate.revoked=true;this.state.mandate.confirmed=false;this.state.mandate.version++;this.state.agent.monitoring=false;
   this.log('authorization','授权已撤销','立即停止新购买。已有住宿继续保留，已开始的退款和必要补偿仍可对账。');return this.getState();
 }
 addFunds(amountCents:number):State {
   if(!Number.isSafeInteger(amountCents)||amountCents<=0||amountCents>10000000)throw new Error('充值金额必须为 0 至 100000 元之间的人民币分');
   this.state.wallet.initialCents+=amountCents;this.refreshWallet();this.log('wallet','测试钱包已充值',`增加 ${money(amountCents)} 测试资金，授权预算未改变。`);return this.getState();
 }
 reset(scenario:string):State {
   if(!SCENARIOS[scenario])throw new Error('未知场景');this.state=this.initial(scenario);this.revision=1;this.quotes={};this.outcomes={};this.cancellationFailureUsed=false;
   this.log('system','仿真已重置',`${SCENARIOS[scenario]}场景已就绪。所有金额均为测试资金，所有酒店及订单均为仿真。`);return this.getState();
 }
 setClock(running:boolean,speed?:number):State {
   if(typeof running!=='boolean'||speed!==undefined&&(!Number.isFinite(speed)||speed<1||speed>3600))throw new Error('仿真倍率须在 1 至 3600 之间');
   this.state.clock.running=running;if(speed!==undefined)this.state.clock.speed=speed;this.persist();return this.getState();
 }
 tick(minutes:number):State {
   if(!Number.isFinite(minutes)||minutes<=0||minutes>10080)throw new Error('单次推进范围为 0 至 10080 分钟');
   const previous=this.state.clock.now;this.state.clock.now+=minutes*MINUTE;this.revision++;this.quotes={};
   for(const order of this.state.orders)if(order.status==='refund_pending'&&order.refundDueAt!==null&&order.refundDueAt<=this.state.clock.now){
     if(this.state.scenario==='refund_failure') {order.refundDueAt=null;this.state.agent.monitoring=false;this.state.agent.error='退款失败，已冻结继续交易';this.log('refund_failed','退款失败，交易已冻结',`${order.hotelName}的退款未到账，需要人工处理。`,{orderId:order.id});}
     else {order.status='refunded';order.refundCents=order.paidCents;order.refundDueAt=null;const parent=order.replacementFor&&this.state.orders.find(item=>item.id===order.replacementFor);if(parent&&parent.status==='cancel_failed'){parent.status='confirmed';this.state.agent.error=null;}this.refreshWallet();this.log('refund','退款实际到账',`${order.hotelName}的 ${money(order.refundCents)} 已退回测试钱包，占款已释放。`,{orderId:order.id});}
   }
   this.refreshWallet();
   if(previous<BASE_TIME+30*MINUTE&&this.state.clock.now>=BASE_TIME+30*MINUTE)this.log('market','仿真市场报价已变化','新一轮价格和库存现已呈现在三个平台网页中；智能体需重新浏览才能获得报价。');
   if(this.state.clock.now>=this.state.mandate.firstDeadline&&!this.lastOrder())this.deadlineAlternatives();
   const active=this.lastOrder();
   if(active&&this.state.clock.now>=Math.min(this.state.mandate.optimizeUntil,active.quote.cancelUntil===null?Infinity:active.quote.cancelUntil-HOUR)||this.state.clock.now>=this.state.mandate.expiresAt)this.state.agent.monitoring=false;
   this.persist();return this.getState();
 }

 private refreshWallet():void {
   const orders=this.state.orders;const paid=orders.reduce((sum,o)=>sum+o.paidCents,0);const refunded=orders.reduce((sum,o)=>sum+o.refundCents,0);
   this.state.wallet.availableCents=this.state.wallet.initialCents-paid+refunded;
   this.state.wallet.exposureCents=paid-refunded;
   this.state.wallet.refundPendingCents=orders.filter(o=>o.status==='refund_pending').reduce((sum,o)=>sum+o.paidCents-o.refundCents,0);
   this.state.wallet.realizedCostCents=orders.filter(o=>(o.status==='cancelled'&&o.refundCents<o.paidCents)||((o.status==='confirmed'||o.status==='cancel_failed')&&(o.quote.cancellation==='nonrefundable'||o.quote.cancelUntil!==null&&this.state.clock.now>=o.quote.cancelUntil))).reduce((sum,o)=>sum+o.paidCents-o.refundCents,0);
 }
 private outcome(key:string,fingerprint:string):TradeResult|undefined {
   const old=this.outcomes[key];if(!old)return undefined;
   if(old.fingerprint!==fingerprint)return {ok:false,code:'idempotency_conflict',reason:'幂等键已用于另一笔交易'};
   return copy(old.result);
 }
 private finish(key:string,fingerprint:string,result:TradeResult,title:string,detail:string,type='trade'):TradeResult {
   this.outcomes[key]={fingerprint,result:copy(result)};this.refreshWallet();this.log(type,title,detail,{...result,idempotencyKey:key});return copy(result);
 }
 private block(req:BookingRequest,code:string,reason:string):TradeResult {return this.finish(req.idempotencyKey,JSON.stringify(req),{ok:false,code,reason},'交易已阻止',reason,'blocked');}

 book(req:BookingRequest):TradeResult {
   if(!req||typeof req.idempotencyKey!=='string'||!req.idempotencyKey.trim()||req.idempotencyKey.length>200)return {ok:false,code:'invalid_request',reason:'交易缺少有效幂等键'};
   const fingerprint=JSON.stringify(req);const previous=this.outcome(req.idempotencyKey,fingerprint);if(previous)return previous;
   const m=this.state.mandate,now=this.state.clock.now;
   if(!m.confirmed||m.revoked)return this.block(req,'authorization_required','授权未确认或已撤销，禁止购买');
   if(req.mandateVersion!==m.version)return this.block(req,'authorization_version','授权版本已变化，请重新核验');
   if(now>=m.expiresAt)return this.block(req,'authorization_expired','授权已到期');
   if(this.hasLedgerFreeze())return this.block(req,'transaction_frozen','订单或退款账本仍有未解决异常，禁止新增支付；请先对账或补偿取消');
   if(this.state.orders.some(order=>order.status==='refund_pending'))return this.block(req,'refund_pending','退款尚未实际到账，禁止任何新增支付和再次换订');
   if(this.state.agent.error)return this.block(req,'transaction_frozen','已有交易异常，继续购买已冻结');
   const active=this.lastOrder();
   if(!req.replacementFor&&active)return this.block(req,'existing_order','已有确认住宿，需要通过换订流程避免重复订单');
   if(!req.replacementFor&&now>=m.firstDeadline)return this.block(req,'deadline','首次预订截止已过，停止自动购买');
   const quote=this.quotes[req.quoteId];
   if(!quote||!req.quoteId.endsWith(`-v${this.revision}`))return this.block(req,'quote_changed','报价已变化，请重新打开结算页核验');
   if(quote.expiresAt<=now)return this.block(req,'quote_expired','报价已过期，请重新核验');
   const evaluation=this.evaluate(quote);
   if(!evaluation.eligible)return this.block(req,'conditions',evaluation.conflicts.join('；'));
   if(this.state.wallet.availableCents<quote.totalCents)return this.block(req,'insufficient_funds',`钱包可用 ${money(this.state.wallet.availableCents)}，不足以支付 ${money(quote.totalCents)}`);
   if(this.state.wallet.exposureCents+quote.totalCents>m.peakCents)return this.block(req,'peak_limit','付款后临时占款将超过授权上限，未到账退款不会提前释放占款');
   let old:Order|undefined;
   if(req.replacementFor) {
     old=this.state.orders.find(order=>order.id===req.replacementFor);
     if(!old||old.id!==active?.id||old.status!=='confirmed')return this.block(req,'replacement_missing','被替换订单不是当前确认住宿');
     if(this.state.wallet.refundPendingCents>0)return this.block(req,'refund_pending','上一笔退款尚未到账，暂停继续换订');
     if(now>=m.optimizeUntil)return this.block(req,'optimization_deadline','订后优化期限已到');
     if(old.quote.cancellation==='nonrefundable'||old.quote.cancelUntil===null)return this.block(req,'nonrefundable','原订单不可取消，禁止换订');
     if(old.quote.cancelUntil-now<HOUR)return this.block(req,'cancel_buffer','原订单免费取消不足 1 仿真小时，禁止换订');
     if(quote.cancellation!=='free_until'||quote.cancelUntil===null||quote.cancelUntil-now<HOUR)return this.block(req,'compensation_window','新订单不具备足够补偿取消窗口');
     if(evaluation.tier>old.tier||evaluation.risk>old.risk)return this.block(req,'quality_worse','新酒店的降级档位或个人差评风险更差');
     const refund=old.paidCents;const savings=refund-quote.totalCents;
     if(savings<m.minSavingsCents||savings<old.paidCents*m.minSavingsPercent/100)return this.block(req,'savings_threshold',`净节省 ${money(savings)} 未同时达到 ${money(m.minSavingsCents)} 和 ${m.minSavingsPercent}%`);
     if(quote.totalCents+this.state.wallet.realizedCostCents>m.budgetCents)return this.block(req,'budget','累计不可退损失与新订单总价超出住宿预算');
   }
   const order:Order={id:`ord-${randomUUID().slice(0,8)}`,platform:quote.platform,hotelId:quote.hotelId,hotelName:evaluation.hotel.name,quote:copy(quote),status:'confirmed',paidCents:quote.totalCents,refundCents:0,createdAt:now,refundDueAt:null,mandateVersion:m.version,tier:evaluation.tier,risk:evaluation.risk,replacementFor:old?.id??null};
   this.state.orders.push(order);
   quote.inventory-=quote.rooms; // Platform inventory is reduced within the same atomic checkpoint.
   this.state.agent.phase=old?'新订单已确认，等待取消旧订单':'已完成首次预订';
   if(quote.cancellation==='nonrefundable'){this.state.agent.monitoring=false;this.state.agent.phase='不可取消订单已确认，停止换订';}
   return this.finish(req.idempotencyKey,fingerprint,{ok:true,order},old?'换订新订单已确认':'预订成功',`${evaluation.hotel.name} · ${PLATFORM_LABELS[quote.platform]}，实付 ${money(order.paidCents)}。${old?'必须继续取消旧订单。':'已完成测试扣款。'}`);
 }

 cancel(req:CancelRequest):TradeResult {
   if(!req||typeof req.idempotencyKey!=='string'||!req.idempotencyKey.trim())return {ok:false,code:'invalid_request',reason:'取消交易缺少幂等键'};
   const fingerprint=JSON.stringify(req);const previous=this.outcome(req.idempotencyKey,fingerprint);if(previous)return previous;
   const order=this.state.orders.find(o=>o.id===req.orderId);
   const reject=(code:string,reason:string)=>this.finish(req.idempotencyKey,fingerprint,{ok:false,code,reason, ...(order?{order}: {})},'取消已阻止',reason,'blocked');
   if(!order)return reject('order_missing','订单不存在');
   if(order.status==='refund_pending'||order.status==='refunded')return this.finish(req.idempotencyKey,fingerprint,{ok:true,order},'取消结果已确认','重复取消未再次产生退款');
   if(order.status!=='confirmed'&&order.status!=='cancel_failed')return reject('order_status','当前订单不可取消');
   if(order.quote.cancellation==='nonrefundable'||order.quote.cancelUntil===null||this.state.clock.now>=order.quote.cancelUntil)return reject('cancellation_expired','该订单不可取消，或已到达免费取消截止时刻');
   const newer=this.state.orders.find(o=>o.replacementFor===order.id&&o.status==='confirmed');
   if(!req.compensation&&!newer)return reject('lodging_protection','取消现有住宿须先确认新订单；已有住宿不会因撤销授权被取消');
   if(!req.compensation) {
     const m=this.state.mandate;
     if(!m.confirmed||m.revoked)return reject('authorization_required','授权未确认或已撤销：保留原住宿，允许补偿取消新订单');
     if(this.state.clock.now>=m.expiresAt)return reject('authorization_expired','授权已到期：保留原住宿，允许补偿取消新订单');
     if(newer?.mandateVersion!==m.version)return reject('authorization_version','换订后授权版本发生变化：保留原住宿，需补偿取消新订单');
   }
   if(req.compensation) {
     const parent=order.replacementFor&&this.state.orders.find(o=>o.id===order.replacementFor);
     if(!parent||(parent.status!=='confirmed'&&parent.status!=='cancel_failed'))return reject('compensation_invalid','补偿取消必须保留原有有效住宿');
   }
   if(this.state.scenario==='cancel_failure'&&!req.compensation&&!this.cancellationFailureUsed) {
     this.cancellationFailureUsed=true;order.status='cancel_failed';this.state.agent.error='旧订单取消失败，请执行新订单补偿取消';this.state.agent.monitoring=false;
     return this.finish(req.idempotencyKey,fingerprint,{ok:false,order,code:'merchant_cancel_failure',reason:'商户模拟取消失败，原订单仍有效；需补偿取消新订单'},'旧订单取消失败','原订单仍有效，系统冻结继续购买并允许必要补偿。','cancel_failed');
   }
   order.status='refund_pending';order.refundDueAt=this.state.clock.now+(this.state.scenario==='refund_delay'?120:15)*MINUTE;
   if(req.compensation)this.state.agent.error='补偿退款处理中，待实际到账后核对资金';
   return this.finish(req.idempotencyKey,fingerprint,{ok:true,order},req.compensation?'补偿取消已提交':'旧订单已取消',`${order.hotelName}的 ${money(order.paidCents)} 退款处理中，实际到账前继续计入占款。`,'cancellation');
 }

 publishAlternatives():Alternative[] {
   if(this.state.clock.now<this.state.mandate.firstDeadline)return [];
   this.deadlineAlternatives(true);return copy(this.state.alternatives);
 }
 private deadlineAlternatives(force=false):void {
   if(!force&&(this.state.alternatives.length||this.state.events.some(event=>event.type==='deadline'&&(event.data as {mandateVersion?:number}|undefined)?.mandateVersion===this.state.mandate.version)))return;
   // Alternatives are grounded exclusively in pages actually observed by this session's browser agent.
   const observed=this.state.candidates.filter(item=>item.evidence.length>0);
   const candidates=observed.map(item=>this.evaluate(item.quote,item.evidence));
   const byHotel=new Map<string,Evaluation>();
   for(const item of candidates){
     const q=item.quote,m=this.state.mandate;
     if(item.hotel.openingYear===null||item.hotel.capacity*q.rooms<q.guests||item.evidence.some(r=>r.issues.some(i=>m.forbiddenIssues.includes(i)))
       ||q.checkIn!==m.checkIn||q.checkOut!==m.checkOut||q.guests!==m.guests||q.rooms!==m.rooms||q.roomType!==m.roomType
       ||m.windowPreference==='required'&&q.hasWindow!==true||m.windowPreference==='preferred'&&q.hasWindow==null
       ||q.inventory<q.rooms||q.cancellation==='nonrefundable'&&!m.allowNonrefundable
       ||q.cancellation==='free_until'&&(q.cancelUntil===null||q.cancelUntil<=this.state.clock.now))continue;
     const old=byHotel.get(item.hotel.id);if(!old||q.totalCents<old.quote.totalCents)byHotel.set(item.hotel.id,item);
   }
   const ranked=[...byHotel.values()].sort((a,b)=>a.tier-b.tier||a.risk-b.risk||a.quote.totalCents-b.quote.totalCents);
   this.state.alternatives=ranked.slice(0,3).map(item=>({hotelId:item.hotel.id,hotelName:item.hotel.name,platform:item.quote.platform,totalCents:item.quote.totalCents,
     changes:[...(item.quote.totalCents>this.state.mandate.budgetCents?[`预算需增加 ${money(item.quote.totalCents-this.state.mandate.budgetCents)} 至 ${money(item.quote.totalCents)}`]:[]),...(item.tier>this.state.mandate.downgradeOrder.length?['需另行放宽距离、评分、开业年份或窗型限制']:[]),'首次预订截止需延后并重新确认授权',...(item.quote.expiresAt<=this.state.clock.now?['已观察报价过期，须重新浏览平台核验价格和库存']:[])],
     reasons:[`个人差评风险 ${item.risk.toFixed(2)}；步行 ${item.hotel.walkMinutes} 分钟`,`评分 ${item.quote.score}/${item.quote.scoreMax}，开业 ${item.hotel.openingYear}；${item.quote.cancellation==='nonrefundable'?'不可取消':'限时免费取消'}`,`依据已读取网页和 ${item.evidence.length} 条评论；观察时间 ${new Date(item.quote.observedAt).toISOString()}`]}));
   this.state.agent.monitoring=false;this.state.agent.phase=this.state.alternatives.length?'截止仍无解，等待新的授权':'截止仍无解，网页观察不足';
   this.log('deadline','首次截止已到，未自动购买',this.state.alternatives.length?'停止购买并提供最多三套条件组合。任何超出原授权的条件都需要重新确认。':'尚未浏览足够酒店详情和评论，不能给出可靠条件组合。需要重新设定截止时间并观察网页。',{alternatives:this.state.alternatives,mandateVersion:this.state.mandate.version});
 }
}
