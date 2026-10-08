import {t as uiText} from './i18n';
import {useState,type FormEvent} from 'react';
import type {FlyaiResult} from '../shared/flyai';
import RealTools from './RealTools';
import AmapRoutes from './AmapRoutes';

export default function FlyaiLive(){
 const [destination,setDestination]=useState('杭州'),[poi,setPoi]=useState('西湖'),[checkIn,setCheckIn]=useState('2026-11-06'),[checkOut,setCheckOut]=useState('2026-11-08');
 const [hotelAddress,setHotelAddress]=useState('');
 const [result,setResult]=useState<FlyaiResult|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const stale=result&&(destination!==result.query.destination||poi!==result.query.poi||checkIn!==result.query.checkIn||checkOut!==result.query.checkOut);
 function showCommute(address:string){setHotelAddress(address);const panel=document.getElementById('route-verification');if(panel instanceof HTMLDetailsElement)panel.open=true;panel?.scrollIntoView({behavior:'smooth',block:'start'});}
 async function search(e:FormEvent){e.preventDefault();setBusy(true);setError('');setResult(null);try{const r=await fetch('/api/live/fliggy/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({destination,poi,checkIn,checkOut})});const data=await r.json();if(!r.ok)throw new Error(data.error);setResult(data);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}

 return <>
  <div className="simulation-banner">{uiText("真实酒店数据 · 仅查询与核验，不会下单或扣款")}</div>
  <main className="live-page">
   <header className="section-heading live-page-heading">
    <div><span className="section-kicker">{uiText("飞猪酒店查询")}</span><h1>{uiText("找到酒店，再确认细节。")}</h1><p className="hint">{uiText("查看真实搜索价格，选择酒店后核对房型、取消政策和通勤。")}</p></div>
    <div className="journey-buttons"><a className="btn" href="/live/rollinggo">{uiText("查询房型与取消政策")}</a><a className="btn" href="/">{uiText("返回体验首页")}</a></div>
   </header>
   <ol className="live-steps" aria-label={uiText("查询流程")}><li><span>1</span>{uiText("填写行程")}</li><li><span>2</span>{uiText("查看酒店")}</li><li><span>3</span>{uiText("核对详情与通勤")}</li></ol>
   <form className="panel" onSubmit={search}>
    <div className="section-heading"><div><h2>{uiText("你的行程")}</h2><p className="hint">{uiText("附近地点选填，可以填写景点、商圈或会议地址。")}</p></div><span className="pill">{uiText("飞猪真实搜索")}</span></div>
    <div className="live-form">
     <label>{uiText("目的地城市")}<input value={destination} onChange={e=>setDestination(e.target.value)} disabled={busy} required maxLength={80} placeholder={uiText("如：杭州")}/></label>
     <label>{uiText("附近地点（选填）")}<input value={poi} onChange={e=>setPoi(e.target.value)} disabled={busy} maxLength={120} placeholder={uiText("如：西湖")}/></label>
     <label>{uiText("入住日期")}<input type="date" value={checkIn} onChange={e=>setCheckIn(e.target.value)} disabled={busy} required/></label>
     <label>{uiText("退房日期")}<input type="date" value={checkOut} min={checkIn} onChange={e=>setCheckOut(e.target.value)} disabled={busy} required/></label>
     <button className="btn primary" disabled={busy}>{busy?uiText("正在查找酒店…"):uiText("查找酒店")}</button>
    </div>
   </form>
   {error&&<p role="alert" className="panel conflict-text">{uiText("查询未完成：")}{error}</p>}
   {busy&&<p className="hint" role="status">{uiText("正在获取飞猪酒店数据，请稍候。")}</p>}
   {!result&&!busy&&!error&&<section className="panel live-empty"><h2>{uiText("先从一段行程开始")}</h2><p className="hint">{uiText("点击「查找酒店」查看候选，再打开平台详情或核对酒店到目的地的通勤。")}</p></section>}
   {result&&<section className="live-results" aria-label={uiText("酒店查询结果")}>
    <div className="section-heading"><div><h2>{uiText("找到")}{result.hotels.length}{uiText("家酒店")}</h2><p className="hint">{result.query.destination} · {result.query.checkIn}{uiText("至")}{result.query.checkOut}{uiText("· 查询于")}{new Date(result.observedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}{uiText("（上海时间）")}</p></div><span className="pill amber">{uiText("搜索价，需核对房型")}</span></div>
    {stale&&<p className="live-notice" role="status">{uiText("行程已修改。以下是上一次查询结果，请重新查找酒店。")}</p>}
    {result.hotels.length===0&&<div className="panel live-empty"><h3>{uiText("暂未找到酒店")}</h3><p className="hint">{uiText("试试更换附近地点，或调整入住日期后再次查询。")}</p></div>}
    <div className="live-hotels">{result.hotels.map((h,i)=><article className={'panel live-hotel'+(h.image?'':' without-image')} key={h.id||i}>
     {h.image&&<img src={h.image} alt={h.name} referrerPolicy="no-referrer" loading="lazy"/>}
     <div><span className="section-kicker">{uiText("飞猪真实酒店")}</span><h2>{h.name}</h2><p className="live-hotel-address">{h.address||uiText("平台暂未提供地址")}</p>{h.nearby&&<p className="hint">{h.nearby}</p>}
      <h3 className="live-price">{h.price} <small>{uiText("平台搜索价")}</small></h3>
      <p className="hint">{uiText("具体房型、含税总价与取消条款，请在平台详情页确认。")}</p>
      <div className="journey-buttons live-hotel-actions">{h.detailUrl&&<a className="btn primary" href={h.detailUrl} target="_blank" rel="noreferrer">{uiText("查看飞猪详情 ↗")}</a>}<button className="btn" disabled={!h.address} onClick={()=>showCommute(h.address)}>{uiText("查看通勤路线")}</button></div>
      <details className="live-disclosure"><summary>{uiText("评分、装修及待核验信息")}</summary><p className="hint">{uiText("平台评分原值：")}{h.score??uiText("未提供")}{uiText("，评分尺度待核验。装修时间：")}{h.decorationTime||uiText("未提供")}{uiText("，不能代替开业时间。")}</p><p className="hint">{uiText("尚待确认：")}{result.missingFields.join('、')||uiText("请以平台详情为准")}。</p><p className="hint">{uiText("平台酒店编号：")}{h.id||uiText("未提供")}</p></details>
     </div>
    </article>)}</div>
    {result.systemMessage&&<p className="live-notice">{uiText("平台提示：")}{result.systemMessage}</p>}
   </section>}
   <AmapRoutes hotelAddress={hotelAddress}/>
   <RealTools query={{destination,poi,checkIn,checkOut}} onResult={setResult}/>
   <details className="panel live-disclosure live-secondary"><summary>{uiText("查询说明与预订限制")}</summary><p>{uiText("搜索价格尚未绑定具体房型、人数、餐食、税费和取消政策。搜索地点与排序条件也需要在详情页再次确认；评分为 0 或缺失时，不作为酒店质量判断。")}</p><p className="hint">{uiText("当前不会自动预订。真实结果不会进入体验钱包或测试订单，打开平台详情也不会创建订单。接口密钥保存在服务端。")}</p></details>
  </main>
 </>;
}
