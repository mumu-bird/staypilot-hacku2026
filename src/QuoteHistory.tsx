import {useEffect,useRef,useState} from 'react';
import type {QuoteRecheck} from '../shared/tradeoffs';
import {QuoteRecheckCard} from './QuoteRecheckCard';
import {pick} from './i18n';
export function QuoteHistory({runId,candidateKey,ratePlanId}:{runId:string;candidateKey:string;ratePlanId:string}){
 const [rows,setRows]=useState<QuoteRecheck[]>([]),[loaded,setLoaded]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(false);
 const active=useRef<AbortController|null>(null);
 useEffect(()=>{setRows([]);setLoaded(false);setLoading(false);setError(false);return()=>{active.current?.abort();active.current=null;};},[runId,candidateKey,ratePlanId]);
 function download(){
  if(!loaded||loading||error||rows.some(row=>row.runId!==runId||row.candidateKey!==candidateKey||row.ratePlanId!==ratePlanId))return;
  const snapshot={formatVersion:1,exportedAt:new Date().toISOString(),source:'saved_observations',scope:{runId,candidateKey,ratePlanId},maximumRecords:50,fullHistoryConfirmed:false,transactionEnabled:false,records:rows};
  const url=URL.createObjectURL(new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='staypilot-quote-history-'+runId+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 async function load(){
  if(active.current)return;const controller=new AbortController();active.current=controller;setLoading(true);setError(false);
  try{const response=await fetch('/api/live/workflow/rechecks?'+new URLSearchParams({runId,candidateKey,ratePlanId}),{signal:controller.signal});if(!response.ok)throw Error('History unavailable');const data:unknown=await response.json();
   if(!Array.isArray(data)||data.length>50||data.some(r=>!r||r.runId!==runId||r.candidateKey!==candidateKey||r.ratePlanId!==ratePlanId||typeof r.id!=='string'))throw Error('History scope mismatch');
   if(active.current===controller){setRows(data);setLoaded(true);}
  }catch{if(active.current===controller&&!controller.signal.aborted)setError(true);}
  finally{if(active.current===controller){active.current=null;setLoading(false);}}
 }
 return <details onToggle={event=>{if(event.currentTarget.open&&!loaded)void load();}}><summary>{pick('查看这个报价的复核历史','View history for this rate plan')}</summary><p className="lw-hint">{pick('只读取当前会话保存的同一行程、酒店与报价记录，最多最近50条；不重新请求商户，历史价格不能作为当前成交依据。','Reads up to 50 saved checks for this trip, hotel and rate plan in this session. No merchant query occurs; historical prices do not establish current bookability.')}</p>{loading&&<p>{pick('读取历史中…','Loading history…')}</p>}{error&&<p role="alert">{pick('无法读取该报价历史，请稍后重试。','This quote history could not be loaded. Retry later.')}</p>}{loaded&&!rows.length&&<p>{pick('当前会话尚无这个报价的复核记录。','No saved rechecks for this rate plan in this session.')}</p>}<button className="secondary" disabled={loading} onClick={()=>void load()}>{pick('重新读取保存记录','Reload saved records')}</button>{loaded&&<button className="secondary" disabled={loading||error} onClick={download}>{pick('导出这个报价的复核记录','Export this quote history')}</button>}{loaded&&rows.length===50&&<p className="lw-hint">{pick('已达到50条显示上限；更早记录可能未包含。','The 50-record limit was reached; earlier records may be omitted.')}</p>}{rows.map(row=><QuoteRecheckCard key={row.id} quote={row}/>)}</details>;
}
