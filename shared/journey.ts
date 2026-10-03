import type {State} from './types.ts';
export const JOURNEY_STEPS=[
 {title:'行程计划',description:'确定住宿附近的目的地、日期、人数和总预算。'},
 {title:'取舍与授权',description:'提前排序可以放宽的条件，确认硬底线与购买权限。'},
 {title:'初筛与评论',description:'从平台 A 建立意向清单，逐条核对评价证据。'},
 {title:'三平台比价',description:'固定住宿条件，对照含税总价、取消期限和评分来源。'},
 {title:'预订或阻断',description:'提交时再次核验授权、库存与资金，展示商户确认结果。'},
 {title:'订后监控',description:'可取消时继续优化；退款到账前保留占款。'},
];
export function journeyProgress(state:State){
 const authorized=state.mandate.confirmed&&!state.mandate.revoked;
 const active=state.orders.filter(o=>o.status==='confirmed'||o.status==='cancel_failed').at(-1);
 const decision=state.events.findLast(e=>e.type==='decision');
 const latestBlock=state.events.findLast(e=>['blocked','browser_blocked','error','deadline'].includes(e.type));
 const issue=Boolean(state.agent.error||state.orders.some(o=>o.status==='cancel_failed')||state.orders.filter(o=>o.status==='confirmed'||o.status==='cancel_failed').length>1);
 const optimizationClosed=Boolean(active&&state.clock.now>=Math.min(state.mandate.optimizeUntil,active.quote.cancelUntil===null?Infinity:active.quote.cancelUntil-3600000));
 const terminal=!active&&state.clock.now>=state.mandate.firstDeadline;
 const runningStage=state.agent.phase==='screening'?2:['comparing','evaluating'].includes(state.agent.phase)?3:state.agent.phase==='booking'?4:2;
 const current=!authorized?1:state.agent.running?runningStage:active?5:decision||terminal?4:2;
 const badges=[authorized?'已确认':'待核对',authorized?'有效授权':state.mandate.revoked?'已撤销':'待确认',state.candidates.some(c=>c.quote.platform==='a')?'已读网页':'待观察',decision?'已排序':state.agent.running&&current===3?'正在核验':'待比较',active?'已有确认订单':terminal?'截止无解':latestBlock?'有阻断记录':'待成交',!active?'未开始':issue?'冻结待处理':active.quote.cancellation==='nonrefundable'?'不可取消，已锁定':optimizationClosed?'优化期限或取消窗口已结束':state.wallet.refundPendingCents>0?'等待退款到账':state.agent.monitoring?'监控中':'可取消，监控未启用'];
 return {current,badges,active,issue,optimizationClosed,terminal,latestBlock,decision};
}
