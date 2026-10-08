import {searchBookingHotels} from './booking-search.ts';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {CallToolRequestSchema,ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {RealAgent} from './real-agent.ts';
import {fliggyEvidence,reviewAssessment} from './fliggy-evidence.ts';
import {RollinggoAgent} from './rollinggo.ts';
const agent=new RealAgent('mcp');
const rollinggo=new RollinggoAgent('mcp');
const server=new Server({name:'staypilot-hotels',version:'1.2.0'},{capabilities:{tools:{}}});
const providerProperty={type:'string',enum:['fliggy','rollinggo'],description:'默认fliggy。rollinggo为独立酒店ID空间，首版1间房无儿童。'};
const queryProperties={provider:providerProperty,destination:{type:'string'},poi:{type:'string'},checkIn:{type:'string',description:'YYYY-MM-DD'},checkOut:{type:'string',description:'YYYY-MM-DD'},adultCount:{type:'integer',minimum:1,maximum:4,description:'RollingGo每间成人数，默认2'},roomCount:{type:'integer',const:1},childCount:{type:'integer',const:0},size:{type:'integer',minimum:1,maximum:20}};
const hotelIdProperty={type:['string','integer'],description:'飞猪为字符串；RollingGo为search_hotels返回的整数ID，不可跨平台混用'};
const filterProperty={type:'object',properties:{cancelPolicy:{type:'string',enum:['CANCELABLE','NON_CANCELABLE']},mealType:{type:'string',enum:['WITH_BREAKFAST','SINGLE_BREAKFAST','DOUBLE_BREAKFAST','NO_MEAL']}},additionalProperties:false};
server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:[
 {name:'search_booking_hotels',description:'Official Booking.com Demand 3.2 read-only search. Requires partner credentials, explicit booker country and coordinates. Raw observations only; not integrated comparable quotes or booking.',inputSchema:{type:'object',properties:{destination:{type:'string'},poi:{type:'string'},checkIn:{type:'string'},checkOut:{type:'string'},adultCount:{type:'integer',minimum:1,maximum:4},bookerCountry:{type:'string',pattern:'^[a-z]{2}$'},latitude:{type:'number',minimum:-90,maximum:90},longitude:{type:'number',minimum:-180,maximum:180},radiusKm:{type:'number',minimum:1,maximum:10}},required:['destination','poi','checkIn','checkOut','bookerCountry','latitude','longitude'],additionalProperties:false},annotations:{readOnlyHint:true}},
 {name:'search_hotels',description:'查询飞猪或RollingGo真实酒店。搜索价格不等于已核验含税成交价；不预订。',inputSchema:{type:'object',properties:queryProperties,required:['destination','poi','checkIn','checkOut'],additionalProperties:false},annotations:{readOnlyHint:true}},
 {name:'get_hotel_details',description:'飞猪返回已浏览的历史证据；RollingGo调用实时房型详情，须额外提供destination、poi、checkIn、checkOut，可筛选取消政策与餐食。缺失评论不生成。',inputSchema:{type:'object',properties:{...queryProperties,hotelId:hotelIdProperty,filter:filterProperty,profile:{type:'string',enum:['sensitive','flexible']}},required:['hotelId'],additionalProperties:false},annotations:{readOnlyHint:true}},
 {name:'get_live_price',description:'飞猪重查搜索价；RollingGo重查具体酒店房型均价及取消条款。均未确认最终含税价，不能自动成交。',inputSchema:{type:'object',properties:{...queryProperties,hotelId:hotelIdProperty,filter:filterProperty},required:['destination','poi','checkIn','checkOut','hotelId'],additionalProperties:false},annotations:{readOnlyHint:true}},
 {name:'book_hotel',description:'当前两数据源真实交易均被阻断，不转发远程工具、不创建订单。',inputSchema:{type:'object',properties:{provider:providerProperty,hotelId:hotelIdProperty},required:['hotelId'],additionalProperties:false},annotations:{readOnlyHint:true}},
]}));
server.setRequestHandler(CallToolRequestSchema,async request=>{
 const {name,arguments:args={}}=request.params;
 try{
  let result:unknown;
  if(name==='search_booking_hotels')return {content:[{type:'text',text:JSON.stringify(await searchBookingHotels(args))}]};
  if(args.provider!==undefined&&args.provider!=='fliggy'&&args.provider!=='rollinggo')throw new Error('未知数据源');
  if(args.provider==='rollinggo'){
   if(name==='search_hotels')result=await rollinggo.search(args);
   else if(name==='get_hotel_details'||name==='get_live_price')result=await rollinggo.detail(args);
   else if(name==='book_hotel')return {isError:true,content:[{type:'text',text:JSON.stringify(rollinggo.blockBooking())}]};
   else throw new Error('未知工具');
  }else if(name==='search_hotels')result=await agent.search(args);
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
async function close(){agent.close();rollinggo.close();await server.close();}
process.on('SIGTERM',()=>void close());process.on('SIGINT',()=>void close());
