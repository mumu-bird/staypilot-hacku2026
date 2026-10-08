import {t as uiText} from './i18n';
import {useId, useState} from 'react';
import type {Evaluation, State} from '../shared/types';
import {money, PLATFORM_LABELS, simTime} from '../shared/types';
import {compareCandidates, shortlist} from '../shared/workflow';
import {Pill, Policy, ReviewView} from './ui-components';

type CandidateScope = 'final' | 'platform' | 'partial';
type ResultFilter = 'all' | 'eligible' | 'excluded';

function rankingExplanation(candidate:Evaluation, firstChoice:Evaluation|undefined, scope:CandidateScope) {
  if (!candidate.eligible) return '未满足当前授权，不能自动预订。下方保留具体冲突和网页依据。';
  if (scope==='partial') return '本轮仍在读取网页，目前只掌握部分证据。最终首选以完整排序为准。';
  if (!firstChoice) return '符合当前授权，等待本轮完成比较。';
  if (candidate.hotel.id===firstChoice.hotel.id) return `在当前已读范围中优先推荐：先比较放宽条件的档位，再比较个人评论风险、含税总价和步行时间。${scope==='platform'?'这里仅比较平台 A，其他平台尚需核验。':'酒店排序不代表预订成功，订单以商户确认为准。'}`;
  if (candidate.tier>firstChoice.tier) return '作为备选：比首选需要放宽更多住宿偏好。';
  if (candidate.risk>firstChoice.risk) return '作为备选：同档位下，已读评论中你在意的问题风险比首选更高。';
  if (candidate.quote.totalCents>firstChoice.quote.totalCents) return '作为备选：档位和评论风险相同，但含税总价高于首选。';
  if (candidate.hotel.walkMinutes>firstChoice.hotel.walkMinutes) return '作为备选：条件、风险和价格相同，但步行时间长于首选。';
  return '与首选条件相当，作为本轮备选保留。';
}

function recommendation(candidate:Evaluation) {
  if (!candidate.eligible) return candidate.conflicts[0]||'当前报价未通过授权规则，不能自动预订。';
  const fit=candidate.tier===0?'完整满足你的首选条件':'使用你已授权的放宽条件';
  const reviews=candidate.risk===0?'已读评论未触发个人风险':'已读评论中有你在意的问题';
  return `${fit}；${reviews}。`;
}

export function CandidateList({candidates,scope='final'}:{candidates:Evaluation[];scope?:CandidateScope}) {
  const [query,setQuery]=useState('');
  const [filter,setFilter]=useState<ResultFilter>('all');
  const searchId=useId();
  const grouped=new Map<string,Evaluation[]>();
  for (const candidate of candidates) {
    const rows=grouped.get(candidate.hotel.id)||[];
    rows.push(candidate);
    grouped.set(candidate.hotel.id,rows);
  }
  const groups=[...grouped.values()].map(rows=>[...rows].sort(compareCandidates)).sort((a,b)=>compareCandidates(a[0],b[0]));
  const firstChoice=groups.find(rows=>rows[0].eligible)?.[0];
  const counts={all:groups.length,eligible:groups.filter(rows=>rows[0].eligible).length,excluded:groups.filter(rows=>!rows[0].eligible).length};
  const search=query.trim().toLocaleLowerCase();
  const visible=groups.map((rows,index)=>({rows,rank:index+1})).filter(({rows})=> {
    const candidate=rows[0];
    if (filter==='eligible'&&!candidate.eligible) return false;
    if (filter==='excluded'&&candidate.eligible) return false;
    return !search||[candidate.hotel.name,candidate.hotel.district,candidate.hotel.address,...candidate.hotel.amenities,...rows.map(row=>PLATFORM_LABELS[row.quote.platform])].join(' ').toLocaleLowerCase().includes(search);
  });
  const firstLabel=scope==='platform'?'平台 A 暂定首选':scope==='partial'?'当前暂定首选':'本轮首选';

  return <section className="hotel-results" aria-label={uiText("已观察酒店比较")}>
    <div className="result-controls">
      <label className="result-search" htmlFor={searchId}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg>
        <input id={searchId} type="search" aria-label={uiText("搜索酒店、位置或设施")} placeholder={uiText("搜索酒店、位置或设施")} value={query} onChange={event=>setQuery(event.target.value)}/>
      </label>
      <div className="result-filters" role="group" aria-label={uiText("筛选酒店")}>
        {([['all',uiText("全部")],['eligible',uiText("符合偏好")],['excluded',uiText("已排除")]] as const).map(([value,label])=><button key={value} type="button" className={filter===value?'selected':''} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{label}<span>{counts[value]}</span></button>)}
      </div>
    </div>
    <p className="result-count" role="status">{uiText("显示")}{visible.length} / {groups.length}{uiText("家酒店 · 符合偏好包含你已授权的放宽条件，优先展示可预订方案。")}</p>
    {visible.length?<div className="candidate-grid">
      {visible.map(({rows,rank})=> {
        const candidate=rows[0];
        const isFirst=candidate.eligible&&candidate.hotel.id===firstChoice?.hotel.id;
        const uniqueReviews=[...new Map(rows.flatMap(row=>row.evidence).map(review=>[review.id,review])).values()];
        const platformCount=new Set(rows.map(row=>row.quote.platform)).size;
        return <article className={`candidate-card hotel-result${candidate.eligible?'':' excluded'}${isFirst?' result-featured':''}`} key={candidate.hotel.id} data-hotel-id={candidate.hotel.id}>
          <div className="candidate-top">
            <img src={candidate.hotel.image||'/assets/hotel-room.jpg'} alt={uiText("住宿场景")} loading="lazy"/>

            {candidate.eligible&&<span className="candidate-rank">{String(rank).padStart(2,'0')}</span>}
          </div>
          <div className="candidate-content">
            <div className="candidate-heading">
              <div><Pill tone={isFirst?'blue':candidate.eligible?'green':'amber'}>{isFirst?firstLabel:candidate.eligible?`备选 ${rank-1}`:uiText("已排除")}</Pill><h3>{candidate.hotel.name}</h3></div>
              <div className="result-price"><strong>{money(candidate.quote.totalCents)}</strong><small>{PLATFORM_LABELS[candidate.quote.platform]}{uiText("· 全程含税总价")}</small></div>
            </div>
            <p className="hotel-location">{candidate.hotel.district}{uiText("· 步行")}{candidate.hotel.walkMinutes}{uiText("分钟 ·")}{candidate.hotel.metroDirect?uiText("地铁直达"):uiText("地铁需换乘")} {candidate.hotel.metroMinutes}{uiText("分钟")}</p>
            <div className="result-policy"><Policy quote={candidate.quote}/><span>{candidate.quote.roomType} · {candidate.quote.breakfast?uiText("含早餐"):uiText("不含早餐")} · {candidate.quote.hasWindow===true?uiText("有窗"):candidate.quote.hasWindow===false?uiText("无窗"):uiText("窗型未确认")}</span></div>
            <p className={`result-recommendation${candidate.eligible?'':' conflict-text'}`}>{recommendation(candidate)}</p>
            <div className="result-facts"><span>{uiText("平台评分")}{candidate.quote.score}/{candidate.quote.scoreMax}</span><span>{candidate.quote.reviewCount}{uiText("条评价")}</span><a href={`/platform/${candidate.quote.platform}/hotel/${candidate.hotel.id}`} target="_blank" rel="noreferrer">{uiText("查看酒店网页 ↗")}</a></div>
            <details className="result-disclosure quote-comparison">
              <summary>{uiText("比较")}{platformCount}{uiText("个平台的报价")}<span>{uiText("含税价格与取消政策")}</span></summary>
              <div className="quote-table"><div className="quote-table-heading"><span>{uiText("平台 / 评分与取消政策")}</span><span>{uiText("全程含税总价")}</span></div>
                {rows.map(row=><div className="quote-row" key={row.quote.id}>
                  <div><strong>{PLATFORM_LABELS[row.quote.platform]} <span className="score-text">{row.quote.score}/{row.quote.scoreMax}</span></strong><small>{row.quote.reviewCount}{uiText("条评价 ·")}{row.quote.inventory}{uiText("间可订")}</small><Policy quote={row.quote}/>{!row.eligible&&<small className="conflict-text">{uiText("此报价不符合授权：")}{row.conflicts.join(' · ')}</small>}</div>
                  <div><strong>{money(row.quote.totalCents)}</strong><small>{simTime(row.quote.observedAt)}{uiText("观察")}</small><a href={`/platform/${row.quote.platform}/hotel/${row.hotel.id}`} target="_blank" rel="noreferrer">{uiText("核验网页 ↗")}</a></div>
                </div>)}
              </div>
            </details>
            <details className="result-disclosure ranking-details">
              <summary>{candidate.eligible?uiText("为什么这样推荐"):uiText("查看排除原因")} <span>{uiText("排序与筛选依据")}</span></summary>
              <div className="candidate-reason"><p>{rankingExplanation(candidate,firstChoice,scope)}</p>{candidate.reasons.map((reason,index)=><p key={index}><span>✓</span>{reason}</p>)}{candidate.conflicts.map((conflict,index)=><p className="conflict" key={index}><span>!</span>{conflict}</p>)}</div>
              <div className="candidate-summary"><div><small>{uiText("偏好条件")}</small><strong>{candidate.tier===0?uiText("完整满足"):`放宽至第 ${candidate.tier} 档`}</strong></div><div><small>{uiText("个人评论风险 · 越低越好")}</small><strong>{Number(candidate.risk.toFixed(4))}</strong></div><div><small>{uiText("开业 / 翻新年份")}</small><strong>{candidate.hotel.openingYear||uiText("未知")} / {candidate.hotel.renovatedYear||uiText("无")}</strong></div></div>
              <p className="hint">{uiText("已见设施：")}{candidate.hotel.amenities.join('、')||uiText("暂无已确认设施")}</p>
              {candidate.matchScore&&<details className="score-details"><summary>{uiText("匹配参考分")}{candidate.matchScore.total}{uiText("/ 100 · 计算方式")}</summary><p className="hint">{uiText("参考分帮助理解取舍，不改变实际排序：授权规则 → 放宽档位 → 评论风险 → 含税总价 → 步行时间。")}</p>{candidate.matchScore.components.map(component=><p key={component.label}>{component.label} {component.value}/100 × {component.weight}% · {component.basis}</p>)}</details>}
            </details>
            <details className="evidence-details result-disclosure">
              <summary>{uiText("查看评论原文 ·")}{uniqueReviews.length}{uiText("条")}<span>{uiText("保留正反意见与来源")}</span></summary>
              <p className="hint">{uiText("以下是实际已读样本，不能代表全部住客体验。")}</p>
              {uniqueReviews.map(review=><div key={review.id}><small className="evidence-source">{uiText("来源：")}{PLATFORM_LABELS[review.platform]}</small><ReviewView review={review}/></div>)}
            </details>
          </div>
        </article>;
      })}
    </div>:<div className="empty result-empty"><strong>{query.trim()?uiText("没有找到匹配的酒店"):uiText("此分类暂时没有酒店")}</strong><p>{uiText("换个关键词或查看全部酒店。")}</p><button className="btn" type="button" onClick={()=>{setQuery('');setFilter('all');}}>{uiText("显示全部酒店")}</button></div>}
  </section>;
}

export function HotelShortlist({state,monitoring=false}:{state:State;monitoring?:boolean}) {
  const active=state.orders.filter(order=>order.status==='confirmed'||order.status==='cancel_failed').at(-1);
  const choices=shortlist(state.candidates,monitoring?active?.hotelId:undefined);
  return <section className="panel shortlist-panel">
    <div className="section-heading"><div><span className="section-kicker">{monitoring?uiText("订后比较"):uiText("为你精选")}</span><h2>{monitoring?uiText("当前住宿与备选酒店"):uiText("先看首选，再看备选")}</h2><p className="hint">{state.agent.running?uiText("正在核验其他平台，以下为当前已读范围内的暂定结果。"):uiText("按你的授权条件排序，每家酒店保留一份优选报价。")}</p></div><Pill>{choices.length}{uiText("家")}{monitoring?uiText("备选"):uiText("符合授权")}</Pill></div>
    {monitoring&&active&&<div className="shortlist-current"><Pill tone="green">{uiText("当前已订")}</Pill><strong>{active.hotelName}</strong><span>{money(active.paidCents)} · {PLATFORM_LABELS[active.platform]}</span><Policy quote={active.quote}/></div>}
    {choices.length?<div className="shortlist-grid">
      {choices.map((candidate,index)=><article className={`shortlist-card${!monitoring&&index===0?' shortlist-featured':''}`} key={candidate.hotel.id}>
        <div className="shortlist-photo"><img src={candidate.hotel.image||'/assets/hotel-room.jpg'} alt={uiText("住宿场景")} loading="lazy"/><Pill tone={!monitoring&&index===0?'blue':'neutral'}>{monitoring?`备选 ${index+1}`:index===0?state.agent.running?uiText("暂定首选"):uiText("本轮首选"):`备选 ${index}`}</Pill></div>
        <div className="shortlist-body"><h3>{candidate.hotel.name}</h3><div className="shortlist-price"><strong>{money(candidate.quote.totalCents)}</strong><small>{uiText("全程含税 ·")}{PLATFORM_LABELS[candidate.quote.platform]}</small></div><Policy quote={candidate.quote}/><p className="shortlist-commute">{uiText("步行")}{candidate.hotel.walkMinutes}{uiText("分钟 ·")}{candidate.quote.score}/{candidate.quote.scoreMax}{uiText("分")}</p><p className="shortlist-reason">{recommendation(candidate)}</p>{monitoring&&active&&<p className="hint">{candidate.tier>active.tier||candidate.risk>active.risk?uiText("偏好或评论风险比当前住宿差，不能换订。"):uiText("换订前仍须核验节省金额、取消期限与可用余额。")}</p>}<a className="text-button" href={`/platform/${candidate.quote.platform}/hotel/${candidate.hotel.id}`} target="_blank" rel="noreferrer">{uiText("查看酒店网页 ↗")}</a></div>
      </article>)}
    </div>:<div className="empty"><strong>{state.agent.running?uiText("正在核验酒店"):uiText("暂时没有符合授权的酒店")}</strong><p>{state.agent.running?uiText("实际读过酒店详情和评论后，符合条件的酒店会显示在这里。"):uiText("可查看排除原因，或调整预算与可放宽的条件。")}</p></div>}
    {choices.length>0&&choices.length<(monitoring?3:4)&&<p className="hint shortlist-footnote">{uiText("当前有")}{choices.length}{uiText("家")}{monitoring?uiText("合格备选"):uiText("合格酒店")}{uiText("，没有用不符合授权的酒店补足数量。")}</p>}
    <p className="hint shortlist-footnote">{monitoring?uiText("监控每 30 仿真分钟复查当前酒店和备选，同时发现新候选；只在授权和免费取消期限内换订。"):uiText("首选与备选均来自已读网页；实际入住安排以商户确认订单为准。")}</p>
  </section>;
}
