import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {validateFlyaiQuery} from './flyai.ts';
import {assessJev,jevEvidenceKey} from './typesafe.ts';
import type {RollinggoQuery,RollinggoFilter,RollinggoSearch,RollinggoDetail,RollinggoDiscovery,RollinggoState,RollinggoRoom} from '../shared/rollinggo.ts';

const endpoint='https://mcp.rollinggo.cn/mcp';
const readOnlyTools=new Set(['searchHotels','getHotelDetail','getHotelSearchTags']);
type ObjectValue=Record<string,unknown>;
const obj=(v:unknown):ObjectValue=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as ObjectValue:{};
const text=(v:unknown):string|null=>typeof v==='string'?v:null;
const number=(v:unknown):number|null=>typeof v==='number'&&Number.isFinite(v)?v:null;
const price=(v:unknown):number|null=>{const n=number(v);return n!==null&&n>=0?n:null;};
const boolean=(v:unknown):boolean|null=>typeof v==='boolean'?v:null;
const strings=(v:unknown):string[]=>Array.isArray(v)?v.filter((x):x is string=>typeof x==='string').slice(0,200):[];
export function rollinggoConfigured(){return Boolean(process.env.ROLLINGGO_API_KEY);}
function safeUrl(v:unknown,image=false){try{const u=new URL(String(v));return u.protocol==='https:'&&(image?u.hostname==='image-cdn.rollinggo.cn':u.hostname==='rollinggo.cn')&&!u.username&&!u.password?u.href:null;}catch{return null;}}
export function validateRollinggoQuery(input:ObjectValue):RollinggoQuery{
 const base=validateFlyaiQuery(input);
 const integer=(key:string,fallback:number,min:number,max:number)=>{const v=input[key]??fallback;if(typeof v!=='number'||!Number.isInteger(v)||v<min||v>max)throw new Error(`${key} 超出支持范围`);return v;};
 const nights=(Date.parse(base.checkOut)-Date.parse(base.checkIn))/86400000;
 if(nights>28)throw new Error('RollingGo 首版最多查询28晚');
 if((input.roomCount??1)!==1||(input.childCount??0)!==0)throw new Error('首版仅支持1间房、无儿童；不能忽略人数条件');
 return {...base,adultCount:integer('adultCount',2,1,4),size:integer('size',5,1,20),roomCount:1,childCount:0};
}
export function validateRollinggoFilter(input:unknown):RollinggoFilter{
 const v=obj(input),out:RollinggoFilter={};
 if(v.cancelPolicy!==undefined){if(v.cancelPolicy!=='CANCELABLE'&&v.cancelPolicy!=='NON_CANCELABLE')throw new Error('无效取消政策筛选');out.cancelPolicy=v.cancelPolicy;}
 if(v.mealType!==undefined){if(!['WITH_BREAKFAST','SINGLE_BREAKFAST','DOUBLE_BREAKFAST','NO_MEAL'].includes(String(v.mealType)))throw new Error('无效餐食筛选');out.mealType=v.mealType as RollinggoFilter['mealType'];}
 return out;
}
export function decodeRollinggoResult(result:unknown):ObjectValue{
 const r=obj(result);if(r.isError===true)throw new Error('RollingGo 工具返回失败，未取得新观察');
 let data=r.structuredContent;
 if(data===undefined){const block=Array.isArray(r.content)?r.content.find(c=>obj(c).type==='text'):undefined;try{data=JSON.parse(String(obj(block).text));}catch{throw new Error('RollingGo 返回格式无法核验');}}
 const p=obj(data);if(p.success!==true)throw new Error('RollingGo 业务查询失败，未取得新观察');return p;
}
const commonMissing=['评论原文、日期、数量与评分尺度','开业与翻新时间','准确目的地通勤','完整真实购买授权','订单、取消与退款接口'];
export function normalizeRollinggoSearch(payload:ObjectValue,query:RollinggoQuery):RollinggoSearch{
 if(payload.success!==true||!Array.isArray(payload.hotelInformationList))throw new Error('RollingGo 未返回有效酒店列表');
 return {source:'RollingGo MCP',observedAt:new Date().toISOString(),query,transactionEnabled:false,missingFields:['绑定房型的住宿含税总价与全部费用','具体房型、餐食与取消政策',...commonMissing],hotels:payload.hotelInformationList.map(value=>{
  const h=obj(value),p=obj(h.price),id=number(h.hotelId);if(id===null||!Number.isSafeInteger(id)||id<=0)throw new Error('酒店标识无法核验');
  return {id,name:text(h.name)||'名称未提供',address:text(h.address)||'地址未提供',starRating:number(h.starRating),reviewScore:null,nightlyPrice:p.hasPrice===true?price(p.lowestPrice):null,currency:text(p.currency),priceMessage:text(p.message),amenities:strings(h.hotelAmenities),tags:strings(h.tags),image:safeUrl(h.imageUrl,true),detailUrl:safeUrl(h.bookingUrl)};
 })};
}
// Only mainland-China requests use this adapter. Do not infer a timezone for another country.
function cancelTime(policy:string|null,query:RollinggoQuery){
 const match=policy?.match(/免费取消截止至酒店当地时间 (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/);
 if(!match||query.destination!=='杭州')return null;
 const date=`${match[1]}T${match[2]}+08:00`,parsed=Date.parse(date);
 return Number.isFinite(parsed)&&new Date(parsed+8*3600000).toISOString().slice(0,19)===`${match[1]}T${match[2]}`?date:null;
}
function filterRoom(r:RollinggoRoom,f:RollinggoFilter){
 if(f.cancelPolicy==='CANCELABLE'&&r.cancellationStatus!=='free_until')return false;
 if(f.cancelPolicy==='NON_CANCELABLE'&&r.cancellationStatus!=='nonrefundable')return false;
 if(f.mealType==='NO_MEAL'&&r.mealAmount!==0)return false;
 if(f.mealType==='WITH_BREAKFAST'&&!(r.mealAmount!==null&&r.mealAmount>0))return false;
 if(f.mealType==='SINGLE_BREAKFAST'&&r.mealAmount!==1)return false;
 if(f.mealType==='DOUBLE_BREAKFAST'&&r.mealAmount!==2)return false;
 return true;
}
export function normalizeRollinggoDetail(p:ObjectValue,query:RollinggoQuery,hotelId:number,filter:RollinggoFilter={}):RollinggoDetail{
 if(p.success!==true||p.hotelId!==hotelId||p.checkIn!==query.checkIn||p.checkOut!==query.checkOut||!Array.isArray(p.roomRatePlans))throw new Error('酒店或日期与请求不一致，拒绝使用该报价');
 const nights=(Date.parse(query.checkOut)-Date.parse(query.checkIn))/86400000;
 const rooms=p.roomRatePlans.map(value=>{
  const r=obj(value),info=obj(r.roomInfo),averagePrice=price(r.averagePrice),cancelPolicy=text(r.cancelPolicy),cancelable=boolean(r.cancelable),until=cancelTime(cancelPolicy,query);
  // A false flag alone does not specify a nonrefundable fee schedule. Require original wording.
  const cancellationStatus=cancelable===true&&until?'free_until':cancelable===false&&/不可取消|不可退款|不予退款/.test(cancelPolicy||'')?'nonrefundable':'unknown';
  return {ratePlanId:text(r.ratePlanId)||'',roomName:text(r.roomName)||'房型未提供',bedType:text(r.bedTypeDescription),averagePrice,estimatedStayPrice:averagePrice===null?null:Math.round(averagePrice*nights*100)/100,currency:text(r.currency),mealAmount:number(r.mealAmount),mealType:text(r.mealTypeStr),onRequest:boolean(r.isOnRequest),cancelable,cancelPolicy,cancelUntil:until,cancellationStatus,hasWindow:boolean(info.hasWindow),maxOccupancy:number(info.maxOccupancy),size:text(info.size),missingFields:['含税总价、税费与到店费用明细','报价有效期及成交前库存复核','取消截止后的费用及退款到账规则',...(cancellationStatus==='unknown'?['可核验的取消条款与时区']:[])]} satisfies RollinggoRoom;
 }).filter(r=>filterRoom(r,filter));
 return {source:'RollingGo MCP',observedAt:new Date().toISOString(),query,filter,hotelId,name:text(p.name)||'名称未提供',detailUrl:safeUrl(p.bookingUrl),rooms,transactionEnabled:false,bookableQuote:false,missingFields:commonMissing};
}
export type RollinggoGateway={discover:()=>Promise<RollinggoDiscovery>;call:(name:string,args:ObjectValue)=>Promise<ObjectValue>};
export class RollinggoClient implements RollinggoGateway{
 private async connected<T>(work:(client:Client)=>Promise<T>):Promise<T>{
  const key=process.env.ROLLINGGO_API_KEY;
  if(!key)throw new Error('服务端尚未配置 RollingGo API Key');
  if(process.env.ROLLINGGO_MCP_URL&&process.env.ROLLINGGO_MCP_URL!==endpoint)throw new Error('只允许连接已核验的 RollingGo 官方酒店端点');
  const client=new Client({name:'staypilot-readonly',version:'1.2.0'});
  const transport=new StreamableHTTPClientTransport(new URL(endpoint),{requestInit:{headers:{Authorization:`Bearer ${key}`}},fetch:async(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(90000)})});
  try{await client.connect(transport);return await work(client);}catch{throw new Error('RollingGo 调用未完成；请检查凭证权限、查询条件或网络。未记录密钥，也未创建订单。');}finally{await client.close().catch(()=>{});}
 }
 async discover():Promise<RollinggoDiscovery>{return this.connected(async client=>{
  const tools:RollinggoDiscovery['tools']=[],seen=new Set<string>();let cursor:string|undefined;
  do{const page=await client.listTools(cursor?{cursor}:{});tools.push(...page.tools.map(t=>({name:t.name,readOnlyEnabled:readOnlyTools.has(t.name)})));cursor=page.nextCursor;if(cursor){if(seen.has(cursor))throw new Error('工具分页重复');seen.add(cursor);}if(tools.length>100)throw new Error('工具清单超限');}while(cursor);
  const server=client.getServerVersion();return {source:'RollingGo MCP',verifiedAt:new Date().toISOString(),server:server?{name:server.name,version:server.version}:null,tools,transactionEnabled:false};
 });}
 async call(name:string,args:ObjectValue){
  if(!readOnlyTools.has(name))throw new Error('仅允许酒店搜索、详情和标签查询；真实交易工具禁止转发');
  return this.connected(async client=>decodeRollinggoResult(await client.callTool({name,arguments:args},undefined,{timeout:95000})));
 }
}
export class RollinggoAgent{
 private db:DatabaseSync;private gateway:RollinggoGateway;private busy=false;private closed=false;
 constructor(id:string,options:{directory?:string;gateway?:RollinggoGateway}={}){
  if(!/^[a-zA-Z0-9_-]+$/.test(id))throw new Error('Invalid RollingGo session');const directory=options.directory??'data/rollinggo';mkdirSync(directory,{recursive:true});this.db=new DatabaseSync(resolve(directory,id+'.sqlite'));this.gateway=options.gateway??new RollinggoClient();
  this.db.exec('CREATE TABLE IF NOT EXISTS observations(id INTEGER PRIMARY KEY,kind TEXT,payload TEXT);CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,at TEXT,action TEXT,reason TEXT)');
 }
 private log(action:string,reason:string){if(!this.closed)this.db.prepare('INSERT INTO events(at,action,reason) VALUES(?,?,?)').run(new Date().toISOString(),action,reason);}
 private async run<T>(kind:string,work:()=>Promise<T>):Promise<T>{
  if(this.closed||this.busy)throw new Error('本会话查询未结束或已关闭');this.busy=true;
  try{const result=await work();if(this.closed)throw new Error('本会话已关闭');this.db.prepare('INSERT INTO observations(kind,payload) VALUES(?,?)').run(kind,JSON.stringify(result));this.log(kind,'取得当前只读观察；未确认税费、完整授权与成交能力，不创建真实订单。');return result;}
  catch(e){this.log('查询未完成','没有保存新的可用报价，历史观察不能证明当前可订。');throw e;}finally{this.busy=false;}
 }
 async discover(){return this.run('discovery',()=>this.gateway.discover());}
 async search(input:ObjectValue){const query=validateRollinggoQuery(input);return this.run('search',async()=>normalizeRollinggoSearch(await this.gateway.call('searchHotels',{
  originQuery:`${query.destination}${query.poi}附近酒店，${query.checkIn}至${query.checkOut}，每间${query.adultCount}成人，1间房，无儿童。只查询，不预订。`,place:query.poi?`${query.poi} ${query.destination}`:`${query.destination} 中国`,placeType:query.poi?'景点':'城市',checkInParam:{checkInDate:query.checkIn,stayNights:(Date.parse(query.checkOut)-Date.parse(query.checkIn))/86400000,adultCount:query.adultCount},size:query.size,
 }),query));}
 async detail(input:ObjectValue){const query=validateRollinggoQuery(input),hotelId=input.hotelId,filter=validateRollinggoFilter(input.filter);if(typeof hotelId!=='number'||!Number.isSafeInteger(hotelId)||hotelId<=0||hotelId>2147483647)throw new Error('需要有效的 RollingGo 酒店 ID');
  return this.run('detail',async()=>normalizeRollinggoDetail(await this.gateway.call('getHotelDetail',{hotelId,dateParam:{checkInDate:query.checkIn,checkOutDate:query.checkOut},occupancyParam:{adultCount:query.adultCount,roomCount:1,childCount:0,childAgeDetails:[]},...(Object.keys(filter).length?{filter}:{})}),query,hotelId,filter));
 }
 async tags(){return this.run('tags',async()=>{const p=await this.gateway.call('getHotelSearchTags',{});if(!Array.isArray(p.tags))throw new Error('搜索标签格式无效');return {source:'RollingGo MCP',observedAt:new Date().toISOString(),tags:p.tags.map(v=>({name:text(obj(v).name),category:text(obj(v).category)})),transactionEnabled:false};});}
 async assess(input:ObjectValue){return this.run('jev',async()=>{const snapshot=this.state(),result=await assessJev(snapshot,input);if(this.closed||result.evidenceKey!==jevEvidenceKey(this.state()))throw new Error('观察已变化或会话关闭，拒绝采用旧判断');return result;});}
 state():RollinggoState{
  const rows=(kind:string,limit:number)=>(this.db.prepare('SELECT payload FROM observations WHERE kind=? ORDER BY id DESC LIMIT ?').all(kind,limit) as {payload:string}[]).map(r=>JSON.parse(r.payload));
  const state:RollinggoState={searches:rows('search',20),details:rows('detail',20),discovery:rows('discovery',1)[0]??null,events:this.db.prepare('SELECT at,action,reason FROM events ORDER BY id DESC LIMIT 50').all() as RollinggoState['events'],transactionEnabled:false,jevAssessments:rows('jev',20)};state.jevEvidenceKey=jevEvidenceKey(state);return state;
 }
 blockBooking(){const reasons=['此示例行程只授权查询和规则验证','当前 MCP 工具清单未核验下单、取消、退款能力','缺少最终含税成交报价与完整购买授权'];this.log('真实下单阻断',reasons.join('；'));return {ok:false,transactionEnabled:false,orderCreated:false,reasons};}
 close(){if(this.closed)return;this.closed=true;this.db.close();}
}
