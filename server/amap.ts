import {z} from 'zod';
import {straightDistanceMeters} from '../shared/distance.ts';
import type {MapPlace,MapRoutes,TransitLine} from '../shared/amap.ts';
const cache=new Map<string,{at:number;value:unknown}>();
// Serialize request starts across sessions so parallel hotel lookups do not burst the account quota.
let requestGate:Promise<void>=Promise.resolve(),lastRequestAt=0;
async function requestSlot(){
 const previous=requestGate;let release!:()=>void;requestGate=new Promise<void>(resolve=>{release=resolve;});
 await previous;try{const wait=Math.max(0,550-(Date.now()-lastRequestAt));if(wait)await new Promise(resolve=>setTimeout(resolve,wait));lastRequestAt=Date.now();}finally{release();}
}

export const amapConfigured=()=>Boolean(process.env.AMAP_WEB_SERVICE_KEY);
async function amap(path:string,params:Record<string,string>):Promise<any>{
 if(!amapConfigured())throw new Error('未配置高德 Web 服务密钥，请在服务端配置。');
 const cacheKey=path+JSON.stringify(params),hit=cache.get(cacheKey);
 if(hit&&Date.now()-hit.at<15*60000)return structuredClone(hit.value);
 const url=new URL('https://restapi.amap.com'+path);url.search=new URLSearchParams({...params,key:process.env.AMAP_WEB_SERVICE_KEY!}).toString();
 let response:Response;
 await requestSlot();
 try{response=await fetch(url,{signal:AbortSignal.timeout(20000)});}catch{throw new Error('高德服务暂未响应，请稍后重试；没有获得路线结果。');}
 if(!response.ok)throw new Error(`高德服务返回 HTTP ${response.status}`);
 let value:any;try{value=await response.json();}catch{throw new Error('高德返回格式无效');}
 if(value.status!=='1')throw new Error(`高德查询未成功，错误码 ${/^\d+$/.test(value.infocode)?value.infocode:'unknown'}；请检查 Web 服务权限或配额。`);
 if(cache.size>=100)cache.delete(cache.keys().next().value!);
 value._observedAt=new Date().toISOString();cache.set(cacheKey,{at:Date.now(),value});return value;
}
const querySchema=z.object({query:z.string().trim().min(2).max(120),city:z.string().trim().min(1).max(60)});
export async function findMapPlaces(input:unknown){
 const parsed=querySchema.safeParse(input);if(!parsed.success)throw new Error('请填写城市和至少两个字的具体地址或地点。');const {query,city}=parsed.data;
 const results=await Promise.allSettled([amap('/v3/place/text',{keywords:query,city,citylimit:'true',offset:'5'}),amap('/v3/geocode/geo',{address:query,city})]);
 const places:MapPlace[]=[],warnings:string[]=[],times:string[]=[];
 for(const [index,result] of results.entries()){
  if(result.status==='rejected'){warnings.push(result.reason instanceof Error?result.reason.message:'地址查询失败');continue;}
  times.push(result.value._observedAt);
  if(index===0)for(const p of Array.isArray(result.value.pois)?result.value.pois:[]){if(typeof p.location==='string'&&p.location)places.push({id:'poi-'+p.id,name:String(p.name),address:typeof p.address==='string'?p.address:'地址未提供',location:p.location,city:typeof p.cityname==='string'?p.cityname:city,source:'poi'});}
  else for(const [i,p] of (Array.isArray(result.value.geocodes)?result.value.geocodes:[]).entries()){if(typeof p.location==='string'&&p.location)places.push({id:`geo-${i}-${p.location}`,name:String(p.formatted_address),address:String(p.formatted_address),location:p.location,city:typeof p.city==='string'?p.city:city,source:'geocode'});}
 }
 if(!places.length&&warnings.length)throw new Error(warnings.join('；'));
 return {places:places.slice(0,10),warnings,observedAt:times.sort()[0]||new Date().toISOString(),source:'高德地图 Web 服务',requiresSelection:true};
}
const numeric=(value:unknown):number|null=>{if(typeof value!=='number'&&typeof value!=='string'||value==='')return null;const n=Number(value);return Number.isFinite(n)&&n>=0?n:null;};
export function parseTransit(raw:unknown):MapRoutes['transits'] {
 if(!raw||typeof raw!=='object')return [];
 const value=raw as {route?:{transits?:unknown[]}};
 return (Array.isArray(value.route?.transits)?value.route.transits:[]).flatMap(item=>{
  if(!item||typeof item!=='object')return [];const t=item as any;
  const duration=numeric(t.duration),distance=numeric(t.distance);if(duration===null||distance===null)return [];
  const lines:TransitLine[]=[];let otherModes=false;
  for(const s of Array.isArray(t.segments)?t.segments:[]){
   if(!s||typeof s!=='object'){otherModes=true;continue;}
   if(s.railway?.id||s.taxi?.distance)otherModes=true;
   const line=Array.isArray(s.bus?.buslines)?s.bus.buslines[0]:undefined;
   if(line){const type=typeof line.type==='string'?line.type:'类型未知';lines.push({name:typeof line.name==='string'?line.name:'线路未知',type,departure:typeof line.departure_stop?.name==='string'?line.departure_stop.name:'站点未知',arrival:typeof line.arrival_stop?.name==='string'?line.arrival_stop.name:'站点未知',metro:type==='地铁线路'||type==='地铁'});}
  }
  const known=lines.length>0&&lines.every(l=>l.type!=='类型未知')&&!otherModes;
  const metroDirect=known&&lines.length===1&&lines[0].metro;
  return [{minutes:Math.ceil(duration/60),meters:distance,walkingMeters:numeric(t.walking_distance),lines,transfers:known?Math.max(0,lines.length-1):null,metroDirect,classification:metroDirect?'地铁直达':known&&lines.every(l=>l.metro)?'地铁需换乘':known&&lines.every(l=>!l.metro)?'公交路线':known?'地铁与公交组合':'交通类型待核验'}];
 }).slice(0,3);
}
const coordinate=z.string().regex(/^-?\d+(?:\.\d{1,6})?,-?\d+(?:\.\d{1,6})?$/).refine(v=>{const [x,y]=v.split(',').map(Number);return x>=-180&&x<=180&&y>=-90&&y<=90;},'坐标超出有效范围');
const nearbySchema=z.object({location:coordinate,city:z.string().trim().min(1).max(60),radius:z.number().int().min(100).max(50000).default(2000)}).strict();
export function normalizeNearbyHotelLeads(value:any,input:unknown){
 const query=nearbySchema.parse(input),seen=new Set<string>();
 const places=(Array.isArray(value?.pois)?value.pois:[]).flatMap((p:any)=>{
  if(typeof p?.id!=='string'||!p.id||seen.has(p.id)||typeof p.name!=='string'||!p.name.trim()||!coordinate.safeParse(p.location).success)return [];
  const distance=straightDistanceMeters(query.location,p.location);if(distance===null||distance>query.radius)return [];
  seen.add(p.id);return [{id:'poi-'+p.id,name:p.name,address:typeof p.address==='string'?p.address:'地址未提供',location:p.location,city:typeof p.cityname==='string'?p.cityname:query.city,source:'poi' as const,straightDistanceMeters:distance}];
 }).sort((a:any,b:any)=>a.straightDistanceMeters-b.straightDistanceMeters).slice(0,10);
 return {source:'高德地图 Web 服务',observedAt:typeof value?._observedAt==='string'?value._observedAt:null,query,keyword:'酒店',places,discoveryOnly:true as const,limitations:['Map keyword leads are not verified merchant hotels or bookable offers.','Straight-line proximity does not establish walking or metro time.','Bounded keyword results do not cover every nearby hotel.']};
}
export async function findNearbyHotelLeads(input:unknown){
 const query=nearbySchema.parse(input);
 const raw=await amap('/v3/place/around',{location:query.location,city:query.city,radius:String(query.radius),keywords:'酒店',offset:'10',page:'1',extensions:'base'});
 return normalizeNearbyHotelLeads(raw,query);
}
const routeSchema=z.object({origin:coordinate,destination:coordinate,city:z.string().trim().min(1).max(60),confirmed:z.literal(true)});
export async function mapRoutes(input:unknown):Promise<MapRoutes>{
 const parsed=routeSchema.safeParse(input);if(!parsed.success)throw new Error('请先选择并确认两个有效的地图位置，再核验通勤。');const {origin,destination,city}=parsed.data;
 const results=await Promise.allSettled([amap('/v3/direction/walking',{origin,destination}),amap('/v3/direction/transit/integrated',{origin,destination,city,cityd:city,strategy:'0'})]);
 let walking:MapRoutes['walking']=null;let transits:MapRoutes['transits']=[];const warnings:string[]=[],times:string[]=[];
 for(const [index,result] of results.entries()){
  if(result.status==='rejected'){warnings.push((index===0?'步行':'公共交通')+'：'+(result.reason instanceof Error?result.reason.message:'路线未取得'));continue;}
  times.push(result.value._observedAt);
  if(index===0){const p=result.value.route?.paths?.[0],duration=numeric(p?.duration),distance=numeric(p?.distance);if(duration!==null&&distance!==null)walking={minutes:Math.ceil(duration/60),meters:distance};else warnings.push('未取得有效步行路线，不能按0分钟处理');}
  else{transits=parseTransit(result.value);if(!transits.length)warnings.push('未取得有效公共交通路线，不能推定地铁直达');}
 }
 return {source:'高德地图 Web 服务',observedAt:times.sort()[0]||new Date().toISOString(),origin,destination,city,walking,transits,warnings};
}
