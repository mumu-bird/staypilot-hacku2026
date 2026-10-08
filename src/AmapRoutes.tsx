import {t as uiText} from './i18n';
import {useEffect,useState} from 'react';
import type {MapPlace,MapRoutes} from '../shared/amap';
async function request<T>(path:string,body?:unknown):Promise<T>{const r=await fetch(path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const data=await r.json();if(!r.ok)throw new Error(data.error||'查询未成功');return data;}

export default function AmapRoutes({hotelAddress}:{hotelAddress:string}){
 const [city,setCity]=useState('杭州'),[origin,setOrigin]=useState('杭州市西湖区文三路168号'),[destination,setDestination]=useState('湖滨银泰in77');
 const [fromPlaces,setFromPlaces]=useState<MapPlace[]>([]),[toPlaces,setToPlaces]=useState<MapPlace[]>([]),[fromId,setFromId]=useState(''),[toId,setToId]=useState(''),[confirmed,setConfirmed]=useState(false);
 const [routes,setRoutes]=useState<MapRoutes|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[warnings,setWarnings]=useState<string[]>([]),[expanded,setExpanded]=useState(false);
 const [integration,setIntegration]=useState<{model:{configured:boolean;name:string|null};amap:{configured:boolean}}|null>(null);
 const reset=()=>{setFromPlaces([]);setToPlaces([]);setFromId('');setToId('');setConfirmed(false);setRoutes(null);setWarnings([]);setError('');};
 useEffect(()=>{void request<typeof integration>('/api/live/integrations').then(setIntegration).catch(()=>{});},[]);
 useEffect(()=>{if(hotelAddress){setOrigin(hotelAddress);reset();setExpanded(true);document.getElementById('route-verification')?.scrollIntoView({behavior:'smooth',block:'start'});}},[hotelAddress]);
 async function find(){setBusy(true);reset();try{const [from,to]=await Promise.all([request<{places:MapPlace[];warnings:string[]}>('/api/live/amap/places',{query:origin,city}),request<{places:MapPlace[];warnings:string[]}>('/api/live/amap/places',{query:destination,city})]);setFromPlaces(from.places);setToPlaces(to.places);setWarnings([...from.warnings,...to.warnings]);if(!from.places.length||!to.places.length)setError('有一个地点未找到。请补全酒店地址或更换具体目的地后重试。');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function calculate(){const from=fromPlaces.find(p=>p.id===fromId),to=toPlaces.find(p=>p.id===toId);if(!from||!to||!confirmed)return;setBusy(true);setError('');setRoutes(null);try{setRoutes(await request<MapRoutes>('/api/live/amap/routes',{origin:from.location,destination:to.location,city,confirmed:true}));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const placeSelect=(label:string,places:MapPlace[],id:string,setId:(v:string)=>void)=><label>{label}<select value={id} disabled={busy} onChange={e=>{setId(e.target.value);setConfirmed(false);setRoutes(null);}}><option value="">{uiText("请选择正确的地点")}</option>{places.map(p=><option key={p.id} value={p.id}>{p.name} · {p.address}</option>)}</select></label>;
 const selectedFrom=fromPlaces.find(p=>p.id===fromId),selectedTo=toPlaces.find(p=>p.id===toId);

 return <details className="panel route-verification live-disclosure" id="route-verification" open={expanded} onToggle={e=>setExpanded(e.currentTarget.open)}>
  <summary><span>{uiText("核对通勤路线")}</span><span className="pill">{uiText("步行 · 地铁 · 公交")}</span></summary>
  <div className="section-heading"><div><h2>{uiText("从酒店出发，需要多久？")}</h2><p className="hint">{uiText("先找到并确认两个地点，再查看实际路线。")}</p></div><span className="pill">{integration?integration.amap.configured?uiText("高德已配置"):uiText("高德未配置"):uiText("地图状态待确认")}</span></div>
  <form className="route-fields" onSubmit={e=>{e.preventDefault();void find();}}>
   <label>{uiText("城市")}<input value={city} disabled={busy} required placeholder={uiText("如：杭州")} onChange={e=>{setCity(e.target.value);reset();}}/></label>
   <label>{uiText("酒店或出发地址")}<input value={origin} disabled={busy} required placeholder={uiText("填写酒店完整地址")} onChange={e=>{setOrigin(e.target.value);reset();}}/></label>
   <label>{uiText("要去的地点")}<input value={destination} disabled={busy} required placeholder={uiText("如：湖滨银泰 in77")} onChange={e=>{setDestination(e.target.value);reset();}}/></label>
   <button className="btn" disabled={busy||!city.trim()||!origin.trim()||!destination.trim()}>{busy?uiText("正在查询…"):uiText("查找地点")}</button>
  </form>
  {(fromPlaces.length>0||toPlaces.length>0)&&<div className="route-selection">
   <h3>{uiText("确认地图匹配的地点")}</h3><p className="hint">{uiText("同名地点可能有多个。请按名称和地址选择，避免算错路线。")}</p>
   {placeSelect(uiText("出发地点"),fromPlaces,fromId,setFromId)}{placeSelect(uiText("到达地点"),toPlaces,toId,setToId)}
   <label className="checkbox-label"><input type="checkbox" checked={confirmed} disabled={busy||!fromId||!toId} onChange={e=>setConfirmed(e.target.checked)}/>{uiText("我已确认这两个地点的位置正确。")}</label>
   <button className="btn primary" disabled={busy||!fromId||!toId||!confirmed} onClick={()=>void calculate()}>{busy?uiText("正在计算…"):uiText("查看通勤时间")}</button>
   {(!fromId||!toId||!confirmed)&&<p className="hint">{uiText("选择出发与到达地点，并确认位置后，即可计算路线。")}</p>}
  </div>}
  {error&&<p role="alert" className="conflict-text">{error}</p>}
  {warnings.map((w,i)=><p className="hint" key={i}>{w}</p>)}
  {routes&&<>
   <div className="section-heading"><div><h3>{uiText("通勤路线")}</h3><p className="hint">{selectedFrom?.name} → {selectedTo?.name}</p></div><span className="pill">{uiText("高德实时路线估计")}</span></div>
   <div className="route-results">
    <article><span className="pill">{uiText("步行")}</span><h3>{routes.walking?routes.walking.minutes+uiText(" 分钟"):uiText("暂无路线")}</h3><p>{routes.walking?uiText("约 ")+(routes.walking.meters/1000).toFixed(2)+uiText(" 公里"):uiText("本次没有返回步行路线，无法确认步行距离。")}</p></article>
    {routes.transits.map((t,i)=><article key={i}><span className="pill">{t.classification}</span><h3>{t.minutes}{uiText("分钟")}</h3><p>{t.transfers===null?uiText("换乘情况未知"):t.transfers+uiText(" 次换乘")}{t.walkingMeters!==null?uiText(" · 步行 ")+t.walkingMeters+uiText(" 米"):''}</p><small>{t.metroDirect?uiText("单条地铁线路，含步行接驳"):uiText("包含换乘或其他交通方式，不能视为地铁直达")}</small><details className="live-disclosure"><summary>{uiText("查看线路与站点")}</summary><p>{uiText("全程约")}{(t.meters/1000).toFixed(2)}{uiText("公里")}</p>{t.lines.map((l,j)=><p key={j}><strong>{l.name}</strong><br/>{l.departure} → {l.arrival}</p>)}</details></article>)}
   </div>
   {routes.transits.length===0&&<p className="hint">{uiText("本次未返回公交或地铁方案，可尝试更换具体地点后重查。")}</p>}
   <p className="hint">{uiText("查询于")}{new Date(routes.observedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}{uiText("（上海时间）。这是当前估计，入住当天的班次与运营时间需再确认。")}</p>
   {routes.warnings.map((w,i)=><p className="conflict-text" key={i}>{w}</p>)}
  </>}
  <details className="live-disclosure live-secondary"><summary>{uiText("查看数据来源与地图位置")}</summary><p className="hint">{uiText("路线来源：")}{routes?.source||uiText("高德地图 Web 服务")}{uiText("。地图用于核对通勤，酒店房型、设施和可订状态仍需另外确认。")}</p>{selectedFrom&&<p className="hint">{uiText("出发：")}{selectedFrom.name} · {selectedFrom.address}{uiText("· 坐标")}{selectedFrom.location}</p>}{selectedTo&&<p className="hint">{uiText("到达：")}{selectedTo.name} · {selectedTo.address}{uiText("· 坐标")}{selectedTo.location}</p>}<p className="hint">{uiText("需求理解：")}{integration?.model.configured?integration.model.name:uiText("规则模式")}{uiText("。地图密钥仅保存在服务端。")}</p></details>
 </details>;
}
