import {t as uiText} from './i18n';
import {useEffect,useState} from 'react';
import type {RollinggoState} from '../shared/rollinggo';
import {JEV_ACTION_LABELS,type JevAssessment} from '../shared/jev';
const defaultFocus='优先核验可取消、有窗的房型；我浅眠，需要卫生与隔音评论证据。这里只安排查证顺序，不改变预算或购买授权。';

export default function JevPanel({state,onRefresh,onInspect}:{state:RollinggoState|null;onRefresh:()=>Promise<unknown>;onInspect:(id:number)=>void}){
 const [focus,setFocus]=useState(defaultFocus),[result,setResult]=useState<JevAssessment|null>(null),[configured,setConfigured]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{fetch('/api/live/integrations').then(r=>r.json()).then(p=>setConfigured(Boolean(p.jev?.configured))).catch(()=>{});},[]);
 useEffect(()=>{setResult(state?.jevAssessments?.find(r=>r.evidenceKey===state.jevEvidenceKey&&r.focus===focus.trim())??null);},[state,focus]);
 async function assess(){setBusy(true);setError('');try{const r=await fetch('/api/live/jev/assess',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({focus})});const p=await r.json();if(!r.ok)throw new Error(p.error||'未取得新判断');setResult(p);await onRefresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const candidate=result?.answers.candidate_to_inspect,next=result?.answers.next_evidence_action;
 const isCurrent=result?.evidenceKey===state?.jevEvidenceKey&&result?.focus===focus.trim();
 const proposedId=candidate?.choice.startsWith('hotel_')?Number(candidate.choice.slice(6)):null;
 const hasHotels=Boolean(state?.searches[0]?.hotels.length);

 return <details className="panel jev-panel live-disclosure">
  <summary><span>{uiText("需要帮助决定先看哪家？")}</span><span className="pill">{uiText("AI 核验建议")}</span></summary>
  <h2>{uiText("告诉我们，你最在意什么")}</h2>
  <p className="hint">{uiText("根据已经查询到的酒店，建议优先补查的候选和信息。建议不会改变预算、个人底线或预订权限。")}</p>
  <label>{uiText("入住关注点")}<textarea value={focus} maxLength={1500} disabled={busy} placeholder={uiText("如：希望可免费取消，浅眠，重点关注隔音与卫生。")} onChange={e=>setFocus(e.target.value)}/></label>
  <div className="journey-buttons"><button className="btn primary" disabled={busy||!configured||!hasHotels||!focus.trim()} onClick={()=>void assess()}>{busy?uiText("正在整理建议…"):uiText("获取核验建议")}</button></div>
  {!hasHotels&&<p className="hint">{uiText("先查找酒店，再根据真实候选获取建议。")}</p>}
  {hasHotels&&!configured&&<p className="hint">{uiText("建议服务尚未配置。你仍可以直接选择酒店，核对房型和通勤。")}</p>}
  {error&&<p role="alert" className="conflict-text">{error}</p>}
  {result&&candidate&&next&&<>
   {!isCurrent&&<p className="live-notice" role="status">{uiText("查询信息或关注点已变化，请重新获取建议。")}</p>}
   <div className="jev-decisions">
    <article><span className="section-kicker">{uiText("建议先看")}</span><h3>{result.candidateLabels[candidate.choice]}</h3><p className="hint">{proposedId!==null?uiText("优先补查这家酒店的房型与取消政策。"):uiText("现有信息不足以优先选择候选，可以继续补充房型、评论或通勤信息。")}</p>{proposedId!==null&&<button className="btn" disabled={!isCurrent||busy} onClick={()=>onInspect(proposedId)}>{uiText("查看这家酒店的房型")}</button>}</article>
    <article><span className="section-kicker">{uiText("当前酒店还需确认")}</span><h3>{JEV_ACTION_LABELS[next.choice as keyof typeof JEV_ACTION_LABELS]}</h3><p>{result.selectedHotelName}</p><p className="hint">{uiText("这项建议对应当前已选酒店，可能与左侧候选不同。")}</p></article>
   </div>
   <p className="hint">{uiText("建议生成于")}{new Date(result.observedAt).toLocaleString('zh-CN',{timeZone:'Asia/Hong_Kong'})}{uiText("（香港时间）。仅安排查证顺序，未执行动作或创建订单。")}</p>
   <details className="live-disclosure"><summary>{uiText("查看判断依据与可信度")}</summary>
    <p className="hint">{uiText("所用搜索查询于")}{new Date(result.sourceObservedAt).toLocaleString('zh-CN',{timeZone:'Asia/Hong_Kong'})}{uiText("。候选优先级与当前酒店的下一步分别判断，概率表示模型倾向，置信度不是正确率或购买许可。")}</p>
    <h3>{uiText("候选建议 · 置信度")}{Math.round(candidate.confidence*100)}%</h3>{Object.entries(candidate.probabilities).sort((a,b)=>b[1]-a[1]).map(([id,p])=><div className="jev-probability" key={id}><span>{result.candidateLabels[id]}</span><meter min="0" max="1" value={p} aria-label={result.candidateLabels[id]+uiText("的模型概率")}/><span>{(p*100).toFixed(1)}%</span></div>)}
    <h3>{uiText("下一步建议 · 置信度")}{Math.round(next.confidence*100)}%</h3>{Object.entries(next.probabilities).sort((a,b)=>b[1]-a[1]).map(([id,p])=><div className="jev-probability" key={id}><span>{JEV_ACTION_LABELS[id as keyof typeof JEV_ACTION_LABELS]}</span><meter min="0" max="1" value={p} aria-label={JEV_ACTION_LABELS[id as keyof typeof JEV_ACTION_LABELS]+uiText("的模型概率")}/><span>{(p*100).toFixed(1)}%</span></div>)}
    <details className="live-disclosure live-secondary"><summary>{uiText("技术诊断与原始输入")}</summary><p className="hint">{uiText("TypeSafe Jev · 模型")}{result.model}{uiText("· 耗时")}{result.elapsedMs}{uiText("ms · 输入")}{result.usage.input_tokens}{uiText("/ 输出")}{result.usage.output_tokens} tokens</p><pre className="jev-request">{JSON.stringify(result.request,null,2)}</pre></details>
   </details>
  </>}
 </details>;
}
