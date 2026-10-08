import type {WorkflowResult} from '../shared/live-workflow';
import {pick} from './i18n';
export function InspectionAdvice({result,onRefresh,disabled=false}:{result:WorkflowResult;onRefresh?:(key:string)=>void;disabled?:boolean}){
 const advice=result.jev;if(!advice)return null;
 const candidate=advice.answers.candidate,action=advice.answers.next_action;
 const target=result.candidates.find(d=>d.candidate.key===advice.selectedForAction)?.candidate;
 const bound=advice.evidenceHash===result.evidenceHash;
 const reviewUrls=[target?.reviews?.sourceUrl,...target?.additionalReviewAnalyses?.map(a=>a.sourceUrl)??[]].filter((url):url is string=>!!url);
 const name=(key:string|null|undefined)=>result.candidates.find(d=>d.candidate.key===key)?.candidate.name??null;
 const actionNames:Record<string,string>={quote:pick('核验最终价格、库存及取消条款','Verify final price, inventory and cancellation'),reviews:pick('补查相关评论证据','Inspect relevant review evidence'),window:pick('核验具体房型的外窗','Verify the exact room’s exterior window'),commute:pick('核验酒店身份和通勤路线','Verify hotel identity and commute'),none:pick('暂无下一步核验任务','No next inspection task')};
 const alternatives=Object.entries(candidate.probabilities).filter(([key])=>key!=='none'&&!!name(key)).sort((a,b)=>b[1]-a[1]).slice(0,3);
 return <section><h2>{pick('Jev：下一步核验建议','Jev: next inspection advice')}</h2><p>{advice.model} · {new Date(advice.observedAt).toLocaleString()}</p>
 <p>{pick('候选倾向','Candidate preference')}: {candidate.choice==='none'?pick('未选出候选','No candidate selected'):name(candidate.choice)??pick('候选身份待核验','Candidate identity requires verification')} · {pick('置信度','Confidence')} {candidate.confidence}</p>
 {candidate.confidence<.5&&<><p className="lw-hint">{pick('候选选择尚不明确，不能视为唯一首选。请结合下列备选及证据缺口继续核验。','The candidate choice is uncertain, not a unique preferred hotel. Continue checking the alternatives and evidence gaps.')}</p><ul>{alternatives.map(([key,probability])=><li key={key}>{name(key)} · {pick('模型选项概率','Model option probability')} {probability}</li>)}</ul></>}
 <p>{pick('下一步任务','Next evidence task')}: {actionNames[action.choice]??pick('任务待核验','Task requires verification')} · {pick('置信度','Confidence')} {action.confidence}</p>
 {advice.selectedForAction&&name(advice.selectedForAction)?<p>{pick('该任务固定对应','This task applies specifically to')}: {name(advice.selectedForAction)}</p>:<p className="lw-hint">{pick('此记录未确认下一步任务对应的酒店，不将任务自动关联到候选倾向。','The task’s hotel is unconfirmed in this record. It is not automatically linked to the candidate preference.')}</p>}
 {action.confidence<.5&&<p className="lw-hint">{pick('下一步任务也不明确，请先核对关键证据缺口。','The next task is also uncertain. Review the material evidence gaps first.')}</p>}
 {bound&&target&&action.choice!=='none'&&<div className="lw-next-action">
 <p>{pick('本记录行程','Trip in this record')}: {result.query.checkIn} → {result.query.checkOut} · {result.query.adultCount} {pick('成人，1间房','adults, 1 room')} · {pick('总预算上限','Total budget ceiling')} ¥{result.policy.budgetCents/100}</p>
 {target.key.startsWith('rollinggo:')&&result.mode==='live'&&onRefresh&&action.choice!=='reviews'&&<><button className="secondary" disabled={disabled} onClick={()=>onRefresh(target.key)}>{pick('手动补查这家酒店的房型与路线','Refresh this hotel’s rooms and route')}</button><p className="lw-hint">{pick('补查更新展示房型与路线，最终税费、确定库存和具体外窗仍需商户核验。','This refresh updates displayed rooms and routes. Final charges, confirmed inventory and the exact exterior window still require merchant verification.')}</p></>}
 {target.detailUrl?<a className="secondary" href={target.detailUrl} target="_blank" rel="noreferrer">{pick('打开对应平台继续核验','Open the corresponding platform to verify')}</a>:<p>{pick('平台未返回详情链接，请按以上酒店和行程条件查询。','No detail link was returned. Search using this hotel and the trip conditions above.')}</p>}
 {action.choice==='reviews'&&[...new Set(reviewUrls)].map(url=><p key={url}><a href={url} target="_blank" rel="noreferrer">{pick('打开已登记评论来源','Open registered review source')}</a></p>)}
 <p className="lw-hint">{pick('当前连接不能取得成交前的最终报价。请在商户核对同一日期、人数、房型、餐食、含税总价和取消期限；本建议不会创建订单。','This connection cannot obtain a final checkout quote. Verify the same dates, guests, room, meals, total charges and cancellation deadline with the merchant. This advice does not create an order.')}</p>
 </div>}
 {!bound&&<p className="lw-hint">{pick('建议与本轮证据版本不一致，请重新评估后再执行核验。','This advice does not match the current evidence version. Reassess before acting on it.')}</p>}
 <p className="lw-hint">{pick('两个判断独立回答：候选倾向和固定酒店的核验任务可能不同。概率和置信度不代表事实真实性、可订库存或购买权限。','These judgments are independent: the candidate preference and the fixed hotel’s task may differ. Probabilities and confidence do not establish facts, inventory or purchase permission.')}</p>
 </section>;
}
