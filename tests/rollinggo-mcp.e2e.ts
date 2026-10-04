import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {writeFileSync,mkdirSync} from 'node:fs';
import type {RollinggoSearch,RollinggoDetail} from '../shared/rollinggo.ts';
const client=new Client({name:'staypilot-rollinggo-smoke',version:'1.0.0'});
const transport=new StdioClientTransport({command:process.execPath,args:['--env-file-if-exists=.env','--experimental-strip-types','server/real-mcp.ts'],cwd:process.cwd(),stderr:'pipe'});
const decode=(r:unknown)=>JSON.parse((r as {content:{type:string;text:string}[]}).content.find(c=>c.type==='text')!.text);
const query={provider:'rollinggo',destination:'杭州',poi:'西湖',checkIn:'2026-11-06',checkOut:'2026-11-08',adultCount:2,roomCount:1,childCount:0,size:5};
try{
 await client.connect(transport);const {tools}=await client.listTools();assert.equal(tools.length,4);
 const invalid=await client.callTool({name:'search_hotels',arguments:{...query,adultCount:0}});assert.equal(invalid.isError,true);
 const search=await client.callTool({name:'search_hotels',arguments:query});assert.ok(!search.isError,'RollingGo 酒店搜索失败');const result=decode(search) as RollinggoSearch;assert.ok(result.hotels.length>0);assert.equal(result.transactionEnabled,false);assert.ok(result.hotels.every(h=>h.reviewScore===null));
 const hotel=[...result.hotels].sort((a,b)=>(a.nightlyPrice??Infinity)-(b.nightlyPrice??Infinity))[0];
 const detail=await client.callTool({name:'get_live_price',arguments:{...query,hotelId:hotel.id,filter:{cancelPolicy:'CANCELABLE',mealType:'NO_MEAL'}}});assert.ok(!detail.isError,'RollingGo 房型查询失败');const rooms=decode(detail) as RollinggoDetail;assert.equal(rooms.hotelId,hotel.id);assert.equal(rooms.bookableQuote,false);assert.ok(rooms.rooms.every(r=>r.cancellationStatus==='free_until'&&r.mealAmount===0));
 const blocked=await client.callTool({name:'book_hotel',arguments:{provider:'rollinggo',hotelId:hotel.id}});assert.equal(blocked.isError,true);assert.equal(decode(blocked).orderCreated,false);
 const report={verifiedAt:new Date().toISOString(),provider:'RollingGo MCP',transport:'Streamable HTTP via StayPilot stdio MCP',query,tools:tools.map(t=>t.name),hotelCount:result.hotels.length,selectedForVerification:{hotelId:hotel.id,name:hotel.name,nightlyDisplayPrice:hotel.nightlyPrice,currency:hotel.currency},roomCount:rooms.rooms.length,roomObservations:rooms.rooms.map(r=>({roomName:r.roomName,averagePrice:r.averagePrice,estimatedStayPrice:r.estimatedStayPrice,currency:r.currency,mealType:r.mealType,mealAmount:r.mealAmount,cancelPolicy:r.cancelPolicy,cancelUntil:r.cancelUntil})),taxInclusiveTotalVerified:false,invalidOccupancyBlocked:true,orderCreated:false};
 mkdirSync('docs',{recursive:true});writeFileSync('docs/rollinggo-verification.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await client.close();}
