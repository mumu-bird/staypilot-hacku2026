import {execFile} from 'node:child_process';
import {resolve} from 'node:path';
import type {FlyaiQuery,FlyaiResult} from '../shared/flyai.ts';

export const missingFields=['对应日期可订房型及库存','入住人数与餐食','住宿含税总价与税费明细','取消政策与退款截止时间','评论原文、日期与样本量','评分尺度与零分含义','开业时间'];
export function validateFlyaiQuery(input:Record<string,unknown>):FlyaiQuery{
  const text=(key:string,max:number)=>{const v=input[key];if(typeof v!=='string'||v.length>max)throw new Error('查询条件格式无效');return v.trim();};
  const destination=text('destination',80),poi=text('poi',120),checkIn=text('checkIn',10),checkOut=text('checkOut',10);
  const validDate=(d:string)=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date());
  if(!destination||!validDate(checkIn)||!validDate(checkOut)||checkIn<today||checkOut<=checkIn)throw new Error('请选择有效的未来入住日期，退房应晚于入住');
  const sorts=['distance_asc','rate_desc','price_asc','price_desc','no_rank'];if(input.sort!==undefined&&(typeof input.sort!=='string'||!sorts.includes(input.sort)))throw new Error('不支持的酒店排序方式');
  return {destination,poi,checkIn,checkOut,...(input.sort!==undefined?{sort:input.sort as FlyaiQuery['sort']}:{})};
}
function safeUrl(value:unknown,image=false):string|null{
  if(typeof value!=='string')return null;
  try{const u=new URL(value);const domains=image?['alicdn.com']:['feizhu.com','fliggy.com','taobao.com'];return u.protocol==='https:'&&domains.some(d=>u.hostname===d||u.hostname.endsWith('.'+d))?u.href:null;}catch{return null;}
}
export function normalizeFlyai(payload:unknown,query:FlyaiQuery):FlyaiResult{
  const p=payload as {status?:unknown;data?:{itemList?:unknown};systemMessage?:unknown};
  if(!p||p.status!==0||!Array.isArray(p.data?.itemList))throw new Error('飞猪未返回有效酒店搜索结果');
  const string=(v:unknown)=>typeof v==='string'?v:null;
  return {source:'飞猪 FlyAI',observedAt:new Date().toISOString(),query,transactionEnabled:false,missingFields:[...missingFields],systemMessage:string(p.systemMessage),hotels:p.data.itemList.map((h:Record<string,unknown>)=>({id:string(h.shId)||'',name:string(h.name)||'未提供名称',address:string(h.address)||'地址未知',price:string(h.price)||'价格未知',score:string(h.rate)??string(h.score),decorationTime:string(h.decorationTime),nearby:string(h.interestsPoi),image:safeUrl(h.mainPic,true),detailUrl:safeUrl(h.detailUrl)}))};
}
let running=false;
export async function searchFlyai(input:Record<string,unknown>):Promise<FlyaiResult>{
  const query=validateFlyaiQuery(input),key=process.env.FLYAI_API_KEY;
  if(!key)throw new Error('服务端尚未配置 FlyAI API Key');
  if(running)throw new Error('飞猪搜索正在执行，请等待本次查询完成');
  running=true;
  try{
    const env:NodeJS.ProcessEnv={...process.env,FLYAI_API_KEY:key,NODE_USE_ENV_PROXY:'1',FLYAI_DEBUG:'0'};
    if(process.env.FLYAI_HTTPS_PROXY)env.HTTPS_PROXY=process.env.FLYAI_HTTPS_PROXY;
    const args=[resolve('node_modules/@fly-ai/flyai-cli/dist/flyai-bundle.cjs'),'search-hotel','--dest-name',query.destination,'--check-in-date',query.checkIn,'--check-out-date',query.checkOut,'--sort',query.sort??'rate_desc','--hotel-types','酒店'];
    if(query.poi)args.push('--poi-name',query.poi);
    if(query.poi&&query.sort==='distance_asc'){args.push('--key-words',query.poi);query.keywords=query.poi;}
    const stdout=await new Promise<string>((resolve,reject)=>execFile(process.execPath,args,{env,timeout:45000,maxBuffer:1024*1024},(error,out)=>error?reject(new Error('飞猪查询未完成，请检查密钥权限或网络后重试')):resolve(out)));
    return normalizeFlyai(JSON.parse(stdout.split(key).join('[REDACTED]')),query);
  }finally{running=false;}
}
