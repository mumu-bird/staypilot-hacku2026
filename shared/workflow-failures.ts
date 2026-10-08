import type {WorkflowResult} from './live-workflow';
/** Reported operation failures only. Empty or missing evidence is not a service outage. */
export function workflowFailures(result:WorkflowResult){
 const failures:{kind:'fliggy'|'rollinggo'|'rooms'|'route'|'reviews'|'model';count:number;step:number}[]=[];
 if(result.errors.some(e=>e==='飞猪查询未完成'||e.startsWith('飞猪附近排序补查未完成')))failures.push({kind:'fliggy',count:1,step:2});
 if(result.errors.includes('RollingGo查询未完成'))failures.push({kind:'rollinggo',count:1,step:2});
 const rooms=result.candidates.filter(d=>d.candidate.roomQuery?.status==='failed').length;
 if(rooms)failures.push({kind:'rooms',count:rooms,step:5});
 const routes=result.candidates.filter(d=>d.candidate.errors.some(e=>e.startsWith('地图或路线服务未完成')||e.startsWith('本轮路线核验未完成')||e.startsWith('独立候选地图核验未完成'))).length;
 if(routes||result.errors.includes('目的地地图查询未完成'))failures.push({kind:'route',count:routes||1,step:3});
 const reviews=result.candidates.filter(d=>d.candidate.errors.some(e=>e.startsWith('第二平台评论刷新未完成'))).length;
 if(reviews||result.errors.some(e=>e.startsWith('本轮公开评论刷新或模型分析未完成')))failures.push({kind:'reviews',count:reviews||1,step:3});
 if(result.tradeoffs?.status==='model_unavailable'||result.errors.some(e=>e.startsWith('Jev判断未完成')))failures.push({kind:'model',count:1,step:3});
 return failures;
}
