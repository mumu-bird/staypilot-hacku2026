import {workflowErrorMessage} from '../shared/workflow-error';
import {t as uiText,pick} from './i18n';
import {useEffect,useState,useRef} from 'react';
import type {FlyaiQuery,FlyaiResult} from '../shared/flyai';
import type {RealState} from '../shared/real-agent';
type Evidence=typeof import('../server/fliggy-evidence').fliggyEvidence;
type Assessment=ReturnType<typeof import('../server/fliggy-evidence').reviewAssessment>;
const labels:Record<string,string>={noise:'隔音',hygiene:'清洁',smell:'气味',maintenance:'设施',service:'服务',space:'空间',security:'夜间安全体验'};
async function request<T>(path:string,payload?:unknown){const r=await fetch(path,payload?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}:undefined);const data=await r.json();if(!r.ok)throw new Error(data.error||'操作未完成');return data as T;}

export default function RealTools({query,onResult}:{query:FlyaiQuery;onResult:(r:FlyaiResult)=>void}){
 const [state,setState]=useState<RealState|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [profile,setProfile]=useState('sensitive'),[evidence,setEvidence]=useState<{evidence:Evidence;assessment:Assessment}|null>(null);
 const [providers,setProviders]=useState<{id:string;name:string;configured:boolean;status:string}[]>([]);
 const [deadline,setDeadline]=useState(()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(Date.now()+6*3600000)).replace(' ','T'));
 async function refresh(){const data=await request<RealState>('/api/live/fliggy/state');setState(data);}
 useEffect(()=>{void refresh().catch(()=>{});const timer=setInterval(()=>void refresh().catch(()=>{}),5000);void request<typeof providers>('/api/live/providers').then(setProviders).catch(()=>{});return()=>clearInterval(timer);},[]);
 useEffect(()=>{const controller=new AbortController();fetch('/api/live/fliggy/evidence/72547102?profile='+profile,{signal:controller.signal}).then(r=>r.json()).then(setEvidence).catch(()=>{});return()=>controller.abort();},[profile]);
 async function monitor(enabled:boolean){setBusy(true);setError('');try{const data=await request<RealState>('/api/live/fliggy/monitor',{...query,enabled,deadline:deadline+':00+08:00'});setState(data);if(enabled&&data.snapshots[0])onResult(data.snapshots[0]);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function blocked(){try{const r=await fetch('/api/live/fliggy/book',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});const data=await r.json();setError('真实交易已阻止：'+data.reasons.join('；'));await refresh();}catch{setError('暂时无法取得交易阻断结果');}}
 const latest=state?.snapshots[0];
 const delivered=useRef('');
 useEffect(()=>{if(latest&&state?.monitor.enabled&&latest.observedAt!==delivered.current&&JSON.stringify(latest.query)===JSON.stringify(query)){delivered.current=latest.observedAt;onResult(latest);}},[latest,state?.monitor.enabled,query,onResult]);

 return <>
  <details className="panel real-tools live-disclosure">
   <summary><span>{uiText("定时查看价格变化")}</span><span className={'pill'+(state?.monitor.enabled?' green':'')}>{state?.monitor.enabled?uiText("监控中"):uiText("未启用")}</span></summary>
   <p>{uiText("每 30 分钟查询一次当前行程，到截止时间自动停止。")}</p>
   <p className="hint">{uiText("后台服务与电脑需保持运行；重启后需要重新开启。仅查询，不会自动预订。")}</p>
   <div className="live-form"><label>{uiText("截止时间（上海时间）")}<input type="datetime-local" value={deadline} onChange={e=>setDeadline(e.target.value)} disabled={state?.monitor.enabled}/></label><button className="btn primary" disabled={busy} onClick={()=>void monitor(!state?.monitor.enabled)}>{busy?uiText("正在更新…"):state?.monitor.enabled?uiText("停止监控"):uiText("开启价格监控")}</button></div>
   <p className="hint" role="status">{state?.monitor.enabled?uiText("正在监控当前行程"):uiText("开启后，会立即查询当前表单中的行程")}{state?.monitor.nextCheckAt&&uiText(" · 下次检查 ")+new Date(state.monitor.nextCheckAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}</p>
   {state?.monitor.lastError&&<p role="alert" className="conflict-text">{pick(workflowErrorMessage(state.monitor.lastError).zh,workflowErrorMessage(state.monitor.lastError).en)}</p>}
   {latest&&<p className="hint">{uiText("已有")}{state?.snapshots.length}{uiText("次价格记录 · 最近查询")}{new Date(latest.observedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}</p>}
   {error&&<p role="alert" className="conflict-text">{error}</p>}
   {state&&state.snapshots.length>0&&<details className="live-disclosure"><summary>{uiText("查看价格记录")}</summary><div className="live-history">{state.snapshots.slice(0,8).map((s,i)=><p key={i}>{new Date(s.observedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})} · {s.query.destination} · {s.query.checkIn}{uiText("至")}{s.query.checkOut}<br/>{s.hotels.slice(0,3).map(h=>h.name+' '+h.price).join('；')||uiText("本轮未返回酒店")}</p>)}</div></details>}
   <details className="live-disclosure"><summary>{uiText("查看运行与交易阻断记录")}</summary><button className="btn small" onClick={()=>void blocked()}>{uiText("验证真实交易阻断")}</button><div className="live-history">{state?.events.slice(0,8).map((e,i)=><p key={i}>{e.action}：{e.reason}</p>)}</div></details>
  </details>
  <details className="panel real-tools live-disclosure">
   <summary><span>{uiText("了解评论中的入住体验")}</span><span className="pill">{uiText("历史评论样本")}</span></summary>
   <h2>{uiText("汉庭黄龙文三路 · 已核验评论样本")}</h2>
   <p className="hint">{uiText("2026 年 10 月 4 日浏览整理的历史证据，不是实时评论。仅对应这家酒店，其他酒店需分别查证。")}</p>
   {evidence&&<>
    <p>{evidence.evidence.warning}</p>
    <div className="live-form"><label>{uiText("选择你的关注程度")}<select value={profile} onChange={e=>setProfile(e.target.value)}><option value="sensitive">{uiText("浅眠，关注隔音、清洁与气味")}</option><option value="flexible">{uiText("可接受隔音与空间代价，清洁优先")}</option></select></label></div>
    <p className="live-notice">{uiText("与你的底线冲突：")}{evidence.assessment.excludedBy.map(i=>labels[i]).join('、')||uiText("所选样本中未发现底线冲突")}</p>
    <div className="hotel-chips">{evidence.assessment.rows.filter(r=>r.count>0).map(r=><span key={r.issue}>{labels[r.issue]} · {r.count}/{r.sampleSize}{uiText("条样本提及")}</span>)}</div>
    <p className="hint">{uiText("这里统计的是选出的 10 条差评，不代表全部")}{evidence.evidence.reviewCount}{uiText("条评论，也不能预测未来入住体验。部分旧评论可能重复。")}</p>
    <details className="live-disclosure"><summary>{uiText("查看评论原文与正面反馈")}</summary>{evidence.evidence.selectedReviews.map((r,i)=><article className="review" key={i}><strong>{r.date}</strong><p>{r.summary}{r.excerpt&&<>{uiText("· 原文节选「")}{r.excerpt}」</>}</p></article>)}{evidence.evidence.positiveEvidence.map((r,i)=><p key={i}>{uiText("正面反馈")}{r.date}：{r.summary}</p>)}</details>
    <details className="live-disclosure"><summary>{uiText("查看平台评分、房型观察与计算依据")}</summary><p>{uiText("网页评分")}{evidence.evidence.webScore}{uiText("，接口原值")}{evidence.evidence.apiScore}{uiText("；共")}{evidence.evidence.reviewCount}{uiText("条点评，差评标签")}{evidence.evidence.negativeTabCount}{uiText("条。2022 年开业 / 装修。")}</p><p>{uiText("样本风险分")}{evidence.assessment.risk.toFixed(2)}{uiText("，仅用于展示不同关注权重下的结果，不构成购买授权。")}</p><div className="hotel-chips">{evidence.assessment.rows.filter(r=>r.count>0).map(r=><span key={r.issue}>{labels[r.issue]}{uiText("· 权重")}{r.weight}</span>)}</div><p>{uiText("历史房型：")}{evidence.evidence.observedRoom.room} · {evidence.evidence.observedRoom.area} · {evidence.evidence.observedRoom.displayPrice}{uiText("（网页显示价）。")}</p><p>{uiText("取消政策：")}{evidence.evidence.observedRoom.cancellation}</p><p className="hint">{uiText("含税总价、餐食及退款到账时间仍未确认，不能据此自动预订。")}</p></details>
    <a className="btn" href={evidence.evidence.sourceUrl} target="_blank" rel="noreferrer">{uiText("查看飞猪原评论与房型 ↗")}</a>
   </>}
  </details>
  <details className="panel real-tools live-disclosure live-secondary"><summary>{uiText("查看数据源连接状态")}</summary><p className="hint">{uiText("已配置凭证仅表示本机有配置，能否使用以实际查询结果为准。")}</p>{providers.map(p=><p key={p.id}><strong>{p.name}</strong> · {p.configured?uiText("已配置"):uiText("未配置")} · {p.status}</p>)}</details>
 </>;
}
