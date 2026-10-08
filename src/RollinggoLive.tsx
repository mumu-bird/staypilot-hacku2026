import {t as uiText} from './i18n';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import type {RollinggoQuery,RollinggoFilter,RollinggoSearch,RollinggoDetail,RollinggoState,RollinggoDiscovery} from '../shared/rollinggo';
import AmapRoutes from './AmapRoutes';
import JevPanel from './JevPanel';
const time=(v:string)=>new Date(v).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'});
const money=(v:number|null,currency:string|null)=>v===null?'未提供':(currency==='CNY'?'¥':currency||'币种未知 ')+v.toFixed(2);
const cancellationLabels={CANCELABLE:'可核验免费取消',NON_CANCELABLE:'不可退款'};
const mealLabels={NO_MEAL:'不含早餐',WITH_BREAKFAST:'含早餐',SINGLE_BREAKFAST:'单份早餐',DOUBLE_BREAKFAST:'双份早餐'};
async function request<T>(path:string,input?:unknown):Promise<T>{const r=await fetch(path,input===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});const p=await r.json();if(!r.ok)throw new Error(p.error||p.reasons?.join('；')||'查询未完成');return p;}
const initial:RollinggoQuery={destination:'杭州',poi:'西湖',checkIn:'2026-11-06',checkOut:'2026-11-08',adultCount:2,roomCount:1,childCount:0,size:5};

export default function RollinggoLive(){
 const [query,setQuery]=useState(initial),[result,setResult]=useState<RollinggoSearch|null>(null),[detail,setDetail]=useState<RollinggoDetail|null>(null),[state,setState]=useState<RollinggoState|null>(null),[discovery,setDiscovery]=useState<RollinggoDiscovery|null>(null);
 const [filter,setFilter]=useState<RollinggoFilter>({}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[hotelAddress,setHotelAddress]=useState('');
 const detailRef=useRef<HTMLElement|null>(null),scrollToDetail=useRef(false);
 async function refresh(){const s=await request<RollinggoState>('/api/live/rollinggo/state');setState(s);setDiscovery(s.discovery);return s;}
 useEffect(()=>{void refresh().then(s=>{if(s.searches[0]){setResult(s.searches[0]);setQuery(s.searches[0].query);}if(s.details[0])setDetail(s.details[0]);}).catch(()=>{});},[]);
 useEffect(()=>{if(detail&&scrollToDetail.current){detailRef.current?.scrollIntoView({behavior:'smooth',block:'start'});scrollToDetail.current=false;}},[detail]);
 async function act(work:()=>Promise<void>){setBusy(true);setError('');try{await work();await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 function search(e:FormEvent){e.preventDefault();setResult(null);setDetail(null);void act(async()=>setResult(await request('/api/live/rollinggo/search',query)));}
 function readDetail(hotelId:number){if(!result)return;scrollToDetail.current=true;setDetail(null);void act(async()=>setDetail(await request('/api/live/rollinggo/detail',{...result.query,hotelId,filter})));}
 function showCommute(address:string){setHotelAddress(address);const panel=document.getElementById('route-verification');if(panel instanceof HTMLDetailsElement)panel.open=true;panel?.scrollIntoView({behavior:'smooth',block:'start'});}
 const stale=result&&(Object.keys(query) as (keyof RollinggoQuery)[]).some(key=>query[key]!==result.query[key]);

 return <>
  <div className="simulation-banner">{uiText("真实酒店与房型数据 · 仅查询与核验，不会下单或扣款")}</div>
  <main className="live-page">
   <header className="section-heading live-page-heading"><div><span className="section-kicker">{uiText("RollingGo 酒店与房型")}</span><h1>{uiText("看清房型，也看清取消条件。")}</h1><p className="hint">{uiText("先找到酒店，再查看对应行程的房型报价、餐食和取消条款。")}</p></div><div className="journey-buttons"><a className="btn" href="/live/fliggy">{uiText("飞猪酒店查询")}</a><a className="btn" href="/">{uiText("返回体验首页")}</a></div></header>
   <ol className="live-steps" aria-label={uiText("查询流程")}><li><span>1</span>{uiText("填写行程")}</li><li><span>2</span>{uiText("选择酒店")}</li><li><span>3</span>{uiText("核对房型与条款")}</li></ol>
   <form className="panel" onSubmit={search}>
    <div className="section-heading"><div><h2>{uiText("你的行程")}</h2><p className="hint">{uiText("当前支持 1 间房、无儿童入住；成人数可调整。")}</p></div><span className="pill">{uiText("真实房型查询")}</span></div>
    <div className="live-form">
     <label>{uiText("目的地城市")}<input value={query.destination} maxLength={80} required disabled={busy} placeholder={uiText("如：杭州")} onChange={e=>setQuery({...query,destination:e.target.value})}/></label>
     <label>{uiText("附近地点（选填）")}<input value={query.poi} maxLength={120} disabled={busy} placeholder={uiText("如：西湖")} onChange={e=>setQuery({...query,poi:e.target.value})}/></label>
     <label>{uiText("入住日期")}<input type="date" value={query.checkIn} required disabled={busy} onChange={e=>setQuery({...query,checkIn:e.target.value})}/></label>
     <label>{uiText("退房日期")}<input type="date" value={query.checkOut} min={query.checkIn} required disabled={busy} onChange={e=>setQuery({...query,checkOut:e.target.value})}/></label>
     <label>{uiText("成人数")}<input type="number" min="1" max="4" value={query.adultCount} disabled={busy} onChange={e=>setQuery({...query,adultCount:Number(e.target.value)})}/></label>
     <button className="btn primary" disabled={busy}>{busy?uiText("正在查询…"):uiText("查找酒店")}</button>
    </div>
   </form>
   {error&&<p className="panel conflict-text" role="alert">{uiText("查询未完成：")}{error}</p>}
   {busy&&<p className="hint" role="status">{uiText("正在获取酒店或房型数据，请稍候。")}</p>}
   {!result&&!busy&&!error&&<section className="panel live-empty"><h2>{uiText("从酒店开始，逐项确认")}</h2><p className="hint">{uiText("查找酒店后，点击「查看房型与取消政策」，确认价格对应的床型、早餐和退款条件。")}</p></section>}
   {result&&<section className="live-results" aria-label={uiText("酒店查询结果")}>
    <div className="section-heading"><div><h2>{uiText("找到")}{result.hotels.length}{uiText("家酒店")}</h2><p className="hint">{result.query.destination} · {result.query.checkIn}{uiText("至")}{result.query.checkOut} · {result.query.adultCount}{uiText("成人 / 1 间 · 查询于")}{time(result.observedAt)}{uiText("（上海时间）")}</p></div><span className="pill amber">{uiText("搜索价按每晚展示")}</span></div>
    {stale&&<p className="live-notice" role="status">{uiText("行程已修改。以下仍是上一次查询结果，请重新查找酒店。")}</p>}
    <details className="panel live-disclosure live-room-filters"><summary>{uiText("房型筛选")}<span className="pill">{filter.cancelPolicy?cancellationLabels[filter.cancelPolicy]:uiText("全部取消政策")} · {filter.mealType?mealLabels[filter.mealType]:uiText("全部餐食")}</span></summary>
     <div className="live-form"><label>{uiText("取消政策")}<select value={filter.cancelPolicy||''} disabled={busy} onChange={e=>setFilter({...filter,cancelPolicy:(e.target.value||undefined) as RollinggoFilter['cancelPolicy']})}><option value="">{uiText("全部")}</option><option value="CANCELABLE">{uiText("可核验免费取消")}</option><option value="NON_CANCELABLE">{uiText("不可退款")}</option></select></label><label>{uiText("早餐")}<select value={filter.mealType||''} disabled={busy} onChange={e=>setFilter({...filter,mealType:(e.target.value||undefined) as RollinggoFilter['mealType']})}><option value="">{uiText("全部")}</option><option value="NO_MEAL">{uiText("不含早餐")}</option><option value="WITH_BREAKFAST">{uiText("含早餐")}</option><option value="SINGLE_BREAKFAST">{uiText("单份早餐")}</option><option value="DOUBLE_BREAKFAST">{uiText("双份早餐")}</option></select></label></div>
     <p className="hint">{uiText("选择筛选条件后，点击酒店的「查看房型与取消政策」应用筛选。")}</p>
    </details>
    {result.hotels.length===0&&<div className="panel live-empty"><h3>{uiText("暂未找到酒店")}</h3><p className="hint">{uiText("试试调整附近地点或日期后再次查询。")}</p></div>}
    <div className="live-hotels">{result.hotels.map(h=><article className={'panel live-hotel'+(h.image?'':' without-image')} key={h.id}>
     {h.image&&<img src={h.image} alt={h.name} loading="lazy" referrerPolicy="no-referrer"/>}
     <div><span className="section-kicker">{uiText("RollingGo 真实酒店")}</span><h2>{h.name}</h2><p className="live-hotel-address">{h.address}</p>
      <div className="hotel-chips"><span>{uiText("酒店星级")}{h.starRating??uiText("未提供")}</span>{h.tags.slice(0,5).map(t=><span key={t}>{t}</span>)}</div>
      <h3 className="live-price">{money(h.nightlyPrice,h.currency)} <small>{uiText("/ 晚 · 搜索展示价")}</small></h3>{h.priceMessage&&<p className="hint">{h.priceMessage}</p>}
      <div className="journey-buttons live-hotel-actions"><button className="btn primary" disabled={busy} onClick={()=>readDetail(h.id)}>{uiText("查看房型与取消政策")}</button><button className="btn" disabled={!h.address} onClick={()=>showCommute(h.address)}>{uiText("查看通勤路线")}</button>{h.detailUrl&&<a className="text-button" href={h.detailUrl} target="_blank" rel="noreferrer">{uiText("平台详情 ↗")}</a>}</div>
      <p className="hint">{uiText("星级表示酒店等级；住客评分尚未提供。价格需结合具体房型确认。")}</p>
     </div>
    </article>)}</div>
   </section>}
   {detail&&<section className="panel rollinggo-detail" ref={detailRef} id="room-rates">
    <div className="section-heading"><div><span className="section-kicker">{uiText("房型与取消政策")}</span><h2>{detail.name}</h2><p className="hint">{detail.query.checkIn}{uiText("至")}{detail.query.checkOut} · {detail.query.adultCount}{uiText("成人 / 1 间 · 查询于")}{time(detail.observedAt)}{uiText("（上海时间）")}</p></div><span className="pill amber">{uiText("含税总价待确认")}</span></div>
    <p className="hint">{uiText("本次筛选：")}{detail.filter.cancelPolicy?cancellationLabels[detail.filter.cancelPolicy]:uiText("全部取消政策")} · {detail.filter.mealType?mealLabels[detail.filter.mealType]:uiText("全部餐食")}{uiText("。报价与库存需在预订时再次确认。")}</p>
    {detail.rooms.length===0?<div className="live-empty"><h3>{uiText("本次没有匹配的房型")}</h3><p className="hint">{uiText("可调整上方房型筛选后重查。这不代表酒店所有房型都已售罄。")}</p></div>:detail.rooms.map((r,i)=><article className="review" key={r.ratePlanId||i}>
     <div className="section-heading"><h3>{r.roomName}</h3><span className={'pill'+(r.cancellationStatus==='free_until'?' green':r.cancellationStatus==='nonrefundable'?' amber':'')}>{r.cancellationStatus==='free_until'?uiText("可免费取消"):r.cancellationStatus==='nonrefundable'?uiText("不可退款"):uiText("取消条款待确认")}</span></div>
     <p>{r.bedType||uiText("床型未提供")} · {r.hasWindow===null?uiText("窗型未提供"):r.hasWindow?uiText("有窗"):uiText("无窗")}{uiText("· 最多")}{r.maxOccupancy??uiText("未知")}{uiText("人")}{r.size?' · '+r.size+uiText(" 平方米"):''}</p>
     <p>{r.mealType||uiText("餐食未提供")}{uiText("· 早餐")}{r.mealAmount??uiText("未知")}{uiText("份")}</p>
     <strong className="live-price">{uiText("暂算")}{money(r.estimatedStayPrice,r.currency)} / {Math.round((Date.parse(detail.query.checkOut)-Date.parse(detail.query.checkIn))/86400000)}{uiText("晚")}</strong>
     <p className="hint">{uiText("平均")}{money(r.averagePrice,r.currency)}{uiText("/ 晚，暂算价格尚未确认税费及到店费用。")}</p>
     <p>{r.cancellationStatus==='free_until'&&r.cancelUntil?uiText("免费取消截止：")+time(r.cancelUntil)+uiText("（UTC+8，已映射城市的酒店当地时间）"):r.cancellationStatus==='nonrefundable'?uiText("此房型不可退款，请确认是否符合你的入住计划。"):uiText("取消政策或酒店时区尚未完整确认。")}</p>
     <details className="live-disclosure"><summary>{uiText("查看取消原文与待确认事项")}</summary><p>{uiText("平台取消原文：")}{r.cancelPolicy||uiText("未提供")}</p><p className="hint">{r.onRequest===null?uiText("可售状态尚未提供"):r.onRequest?uiText("需要商户二次确认"):uiText("接口未标记需二次确认，仍需在预订前复核库存")}。</p><p className="hint">{uiText("尚待确认：")}{r.missingFields.join('、')}。</p>{!r.size&&<p className="hint">{uiText("房间面积尚未提供。")}</p>}</details>
    </article>)}
    <details className="live-disclosure live-secondary"><summary>{uiText("查看本次报价的核验说明")}</summary><p className="hint">{uiText("尚待确认：")}{detail.missingFields.join('、')}{uiText("。真实订单与支付未启用。")}</p></details>
   </section>}
   <JevPanel state={state} onRefresh={refresh} onInspect={readDetail}/>
   <AmapRoutes hotelAddress={hotelAddress}/>
   <details className="panel live-disclosure live-secondary"><summary>{uiText("连接状态与查询说明")}<span className="pill">{discovery?uiText("已验证连接"):uiText("尚未验证连接")}</span></summary>
    <p>{uiText("搜索价按每晚展示。房型平均价乘以晚数只是暂算住宿价格，税费、库存、评论与开业时间仍需确认。同名酒店或不同餐食、取消条款的报价，不能直接视为同一产品。")}</p>
    <div className="journey-buttons"><button className="btn small" disabled={busy} onClick={()=>void act(async()=>setDiscovery(await request('/api/live/rollinggo/discover',{})))}>{uiText("检查数据源连接")}</button><button className="btn small" disabled={busy} onClick={()=>void act(async()=>{await request('/api/live/rollinggo/book',{});})}>{uiText("验证真实交易阻断")}</button></div>
    {discovery?<><p className="hint">{uiText("连接验证成功 ·")}{time(discovery.verifiedAt)}{uiText("（上海时间）。仅开放搜索、详情与标签查询。")}</p><details className="live-disclosure"><summary>{uiText("查看接口与权限")}</summary><p className="hint">{uiText("服务：")}{discovery.server?.name||uiText("未提供名称")}</p><div className="hotel-chips">{discovery.tools.map(t=><span key={t.name}>{t.name} · {t.readOnlyEnabled?uiText("只读已启用"):uiText("禁止转发")}</span>)}</div></details></>:<p className="hint">{uiText("配置凭证不等于连接已验证，可点击检查确认权限。")}</p>}
    <p className="hint">{uiText("密钥保存在服务端，未开放自动下单。")}</p>
   </details>
   {state&&<details className="panel live-disclosure live-secondary"><summary>{uiText("历史查询记录")}<span className="pill">{state.searches.length}{uiText("次搜索 ·")}{state.details.length}{uiText("次房型查询")}</span></summary><p className="hint">{uiText("查询记录带有获取时间，刷新后会保留。历史报价不代表当前库存或价格。")}</p>{state.events.map((e,i)=><p key={i}>{time(e.at)} · {e.action}：{e.reason}</p>)}</details>}
  </main>
 </>;
}
