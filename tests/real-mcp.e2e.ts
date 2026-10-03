import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdirSync,writeFileSync} from 'node:fs';
const client=new Client({name:'staypilot-smoke',version:'1.0.0'});
const transport=new StdioClientTransport({command:process.execPath,args:['--env-file-if-exists=.env','--experimental-strip-types','server/real-mcp.ts'],cwd:process.cwd(),stderr:'pipe'});
const decode=(r:unknown)=>JSON.parse((r as {content:{type:string;text:string}[]}).content.find(c=>c.type==='text')!.text);
try{
 await client.connect(transport);
 const {tools}=await client.listTools();assert.equal(tools.length,4);
 const details=await client.callTool({name:'get_hotel_details',arguments:{hotelId:'72547102',profile:'flexible'}});
 assert.equal(decode(details).freshQuote,false);assert.equal(decode(details).evidence.selectedReviews.length,10);
 const blocked=await client.callTool({name:'book_hotel',arguments:{hotelId:'72547102'}});
 assert.equal(blocked.isError,true);assert.equal(decode(blocked).orderCreated,false);
 const unknown=await client.callTool({name:'get_hotel_details',arguments:{hotelId:'unknown'}});assert.equal(unknown.isError,true);
 const result=await client.callTool({name:'search_hotels',arguments:{destination:'杭州',poi:'西湖',checkIn:'2026-11-06',checkOut:'2026-11-08'}});
 assert.ok(!result.isError,JSON.stringify(result));const data=decode(result);assert.ok(data.hotels.length>0);assert.equal(data.transactionEnabled,false);
 const report={verifiedAt:new Date().toISOString(),tools:tools.map(t=>t.name),hotelCount:data.hotels.length,orderCreated:false,unknownDetailsBlocked:true};
 mkdirSync('data',{recursive:true});writeFileSync('data/real-mcp-smoke.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await client.close();}
