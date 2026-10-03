import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {CallToolRequestSchema,ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {RealAgent} from './real-agent.ts';
import {fliggyEvidence,reviewAssessment} from './fliggy-evidence.ts';
const agent=new RealAgent('mcp');
const server=new Server({name:'staypilot-hotels',version:'1.1.0'},{capabilities:{tools:{}}});
const queryProperties={destination:{type:'string'},poi:{type:'string'},checkIn:{type:'string',description:'YYYY-MM-DD'},checkOut:{type:'string',description:'YYYY-MM-DD'}};
server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:[
 {name:'search_hotels',description:'查询飞猪真实酒店搜索结果。返回搜索价而非已核验成交价；不预订。',inputSchema:{type:'object',properties:queryProperties,required:['destination','poi','checkIn','checkOut'],additionalProperties:false},annotations:{readOnlyHint:true}},
 {name:'get_hotel_details',description:'返回已经浏览核验的酒店证据；历史观察带日期，不生成缺失评论或当前库存。',inputSchema:{type:'object',properties:{hotelId:{type:'string'},profile:{type:'string',enum:['sensitive','flexible']}},required:['hotelId'],additionalProperties:false},annotations:{readOnlyHint:true}},
 {name:'get_live_price',description:'重新查询指定酒店的搜索价格参考值。不是可下单房型报价，含税总价仍需核验。',inputSchema:{type:'object',properties:{...queryProperties,hotelId:{type:'string'}},required:['destination','poi','checkIn','checkOut','hotelId'],additionalProperties:false},annotations:{readOnlyHint:true}},
 {name:'book_hotel',description:'交易边界演示：当前缺少商户成交接口及真实授权，调用将实际返回阻断结果，永远不会创建订单。',inputSchema:{type:'object',properties:{hotelId:{type:'string'}},required:['hotelId'],additionalProperties:false},annotations:{readOnlyHint:true}},
]}));
server.setRequestHandler(CallToolRequestSchema,async request=>{
 const {name,arguments:args={}}=request.params;
 try{
  let result:unknown;
  if(name==='search_hotels')result=await agent.search(args);
  else if(name==='get_live_price'){
   if(typeof args.hotelId!=='string')throw new Error('缺少 hotelId');const found=await agent.search(args);const hotel=found.hotels.find(h=>h.id===args.hotelId);
   if(!hotel)throw new Error('当前搜索未返回此酒店，不能推断其可订状态');result={hotel,observedAt:found.observedAt,query:found.query,bookableQuote:false,missingFields:found.missingFields};
  }else if(name==='get_hotel_details'){
   if(args.hotelId!==fliggyEvidence.hotelId)throw new Error('此酒店尚未进行网页评论及房型核验');result={evidence:fliggyEvidence,assessment:reviewAssessment(args.profile==='flexible'?'flexible':'sensitive'),freshQuote:false};
  }else if(name==='book_hotel'){result=agent.blockBooking();return {isError:true,content:[{type:'text',text:JSON.stringify(result)}]};}
  else throw new Error('未知工具');
  return {content:[{type:'text',text:JSON.stringify(result)}]};
 }catch(e){return {isError:true,content:[{type:'text',text:JSON.stringify({error:(e as Error).message,orderCreated:false})}]};}
});
await server.connect(new StdioServerTransport());
async function close(){agent.close();await server.close();}
process.on('SIGTERM',()=>void close());process.on('SIGINT',()=>void close());
