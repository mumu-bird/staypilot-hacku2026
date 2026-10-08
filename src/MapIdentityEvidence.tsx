import type {WorkflowCandidate} from '../shared/live-workflow';
import {pick} from './i18n';
export function MapIdentityEvidence({candidate}:{candidate:WorkflowCandidate}){
 const evidence=candidate.mapIdentityEvidence;if(!evidence)return null;
 const seen=new Set<string>();
 const places=evidence.observations.flatMap(o=>o.places.filter(p=>p.source==='poi').map(p=>({...p,observedAt:o.observedAt}))).filter(p=>{const key=JSON.stringify([p.id,p.name,p.address,p.location]);if(seen.has(key))return false;seen.add(key);return true;});
 return <details><summary>{pick('酒店位置需要核验','Hotel location needs verification')}</summary>
 <p>{pick('平台记录','Platform record')}: {candidate.name} · {candidate.address}</p>
 <p className="lw-hint">{pick('以下是地图搜索返回的地点，尚未确认与该酒店相同。请核对分店及完整门牌；当前未使用这些地点计算通勤或关联报价。','These are map search results, not confirmed matches for this hotel. Check the branch and full street number. They have not been used to calculate commute or bind quotes.')}</p>
 {places.length?<ul>{places.slice(0,10).map(p=><li key={JSON.stringify([p.id,p.location])}><p>{p.name} · {p.address}</p><p>{pick('地图观察时间','Map observation time')}: {new Date(p.observedAt).toLocaleString()}</p>{/^poi-[A-Za-z0-9]+$/.test(p.id)&&<a href={`https://www.amap.com/place/${encodeURIComponent(p.id.slice(4))}`} target="_blank" rel="noreferrer">{pick('打开地图地点核验','Open map place to verify')}</a>}</li>)}</ul>:<p>{pick('本轮没有返回可核验的酒店地点。','No hotel place was returned for verification.')}</p>}
 <p>{pick('地址地理编码结果未作为酒店匹配依据。','Address geocoding results were not accepted as hotel identity evidence.')}</p>
 </details>;
}
