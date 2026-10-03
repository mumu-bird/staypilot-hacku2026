import type {Evaluation, Hotel, Mandate, MatchScore} from './types.ts';

export function newnessYear(hotel:Hotel,mandate:Mandate):number|null {
  if(mandate.newnessBasis==='renovation')return hotel.renovatedYear;
  if(mandate.newnessBasis==='either'){
    const years=[hotel.openingYear,hotel.renovatedYear].filter((y):y is number=>y!==null);
    return years.length?Math.max(...years):null;
  }
  return hotel.openingYear;
}
export const compareCandidates=(a:Evaluation,b:Evaluation)=>Number(b.eligible)-Number(a.eligible)||a.tier-b.tier||a.risk-b.risk||a.quote.totalCents-b.quote.totalCents||a.hotel.walkMinutes-b.hotel.walkMinutes||a.hotel.id.localeCompare(b.hotel.id)||a.quote.platform.localeCompare(b.quote.platform);
export function shortlist(candidates:Evaluation[],activeHotelId?:string):Evaluation[] {
  const seen=new Set<string>();
  return [...candidates].filter(c=>c.eligible&&c.hotel.id!==activeHotelId).sort(compareCandidates).filter(c=>{if(seen.has(c.hotel.id))return false;seen.add(c.hotel.id);return true;}).slice(0,activeHotelId?3:4);
}
// A disclosed reference score. Authorization, downgrade tier, personal risk and price
// remain the governing lexicographic ranking, rather than being traded off for points.
export function matchScore(e:Evaluation,m:Mandate):MatchScore {
  const clamp=(n:number)=>Math.max(0,Math.min(100,n));
  const year=newnessYear(e.hotel,m),tripYear=Number(m.checkIn.slice(0,4));
  const commute=e.hotel.walkMinutes<=m.walkMax?e.hotel.walkMinutes:e.hotel.metroDirect?e.hotel.metroMinutes:e.hotel.walkMinutes;
  const preferred=m.preferredAmenities??[];
  const components=[
    {label:'预算余量',value:clamp(m.budgetCents>0?(1-e.quote.totalCents/m.budgetCents)*100:0),weight:40,basis:`1 − 含税总价 / 住宿预算；不计未来降价`},
    {label:'通勤',value:clamp(100-commute/60*100),weight:20,basis:`已知通勤 ${commute} 分钟，60 分钟计 0 分`},
    {label:'平台评分',value:clamp(e.quote.scoreMax>0?e.quote.score/e.quote.scoreMax*100:0),weight:20,basis:`平台原值 ${e.quote.score}/${e.quote.scoreMax}；仅用于仿真已知尺度`},
    {label:'新旧程度',value:year===null?0:clamp(100-Math.max(0,tripYear-year)*10),weight:10,basis:`按已选年份口径 ${year??'未知'}；每年扣 10 分`},
    {label:'偏好设施',value:preferred.length?preferred.filter(a=>e.hotel.amenities.includes(a)).length/preferred.length*100:100,weight:10,basis:preferred.length?`${preferred.filter(a=>e.hotel.amenities.includes(a)).length}/${preferred.length} 项有网页依据；未知不计满足`:'未设置设施偏好，所有酒店同分'}
  ].map(c=>({...c,value:Math.round(c.value*10)/10}));
  return {total:Math.round(components.reduce((s,c)=>s+c.value*c.weight/100,0)*10)/10,components};
}

export function preserveHardFloors(patch:Partial<Mandate>,current:Mandate):Partial<Mandate> {
 return {...patch,forbiddenIssues:[...new Set([...current.forbiddenIssues,...(patch.forbiddenIssues??[])])],requiredAmenities:[...new Set([...current.requiredAmenities,...(patch.requiredAmenities??[])])]};
}
