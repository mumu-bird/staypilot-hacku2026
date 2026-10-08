import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {rollinggoConfigured} from './rollinggo.ts';
export function providerStatus(){return [
 {id:'fliggy',name:'飞猪 FlyAI',configured:Boolean(process.env.FLYAI_API_KEY),status:'真实搜索已验证；浏览器已读到一个酒店的详情及差评',transactions:false},
 {id:'rollinggo',name:'RollingGo 酒店 MCP',configured:rollinggoConfigured(),status:'已实现只读搜索、房型报价与取消条款；鉴权结果见 RollingGo 核验页',transactions:false},
 {id:'booking',name:'Booking.com Demand / MCP',configured:Boolean(process.env.BOOKING_AFFILIATE_ID&&process.env.BOOKING_DEMAND_API_KEY),status:'官方MCP发现与Demand 3.2只读搜索已实现；待合作凭证联调，尚未接入六步比价',transactions:false},
 {id:'expedia',name:'Expedia Rapid',configured:Boolean(process.env.EXPEDIA_API_KEY&&process.env.EXPEDIA_SHARED_SECRET),status:'需合作审批及沙箱凭证；尚未实现业务适配器',transactions:false},
 {id:'agoda',name:'Agoda Demand',configured:false,status:'需平台颁发合作伙伴凭证；尚未实现业务适配器',transactions:false},
 {id:'amadeus',name:'Amadeus Enterprise',configured:false,status:'官方自助门户已停用；仅企业合作，不采用旧自助API',transactions:false},
 ];}
export async function discoverBookingTools(){
 const affiliate=process.env.BOOKING_AFFILIATE_ID,key=process.env.BOOKING_DEMAND_API_KEY;
 if(!affiliate||!key)throw new Error('需要 Managed Affiliate Partner 的 Affiliate ID 与 Demand API Key');
 if(!/^\d+$/.test(affiliate))throw new Error('Affiliate ID 必须是数字字符串');
 const client=new Client({name:'staypilot-readonly',version:'1.0.0'});
 const transport=new StreamableHTTPClientTransport(new URL('https://demandapi-mcp.booking.com/v1/sp/mcp/'),{requestInit:{headers:{'x-booking-affiliate-id':affiliate,'x-booking-authorization':key}},fetch:async(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(20000)})});
 try{await client.connect(transport);const tools=[];let cursor:string|undefined;const seen=new Set<string>();do{const page=await client.listTools(cursor?{cursor}:{});tools.push(...page.tools);cursor=page.nextCursor;if(cursor){if(seen.has(cursor))throw new Error('重复分页游标');seen.add(cursor);}if(tools.length>300)throw new Error('工具清单过大，请向平台核验');}while(cursor);return {provider:'booking',verifiedAt:new Date().toISOString(),tools,transactionEnabled:false};}
 catch{throw new Error('Booking.com 工具发现未完成；请检查账号开通状态、凭证和网络。密钥未记录到响应。');}finally{await client.close().catch(()=>{});}
}
