import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {writeFileSync} from 'node:fs';
const client=new Client({name:'staypilot-booking-boundary',version:'1.0.0'});
const env=Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>typeof entry[1]==='string'));
env.BOOKING_DEMAND_API_KEY='';env.BOOKING_AFFILIATE_ID='';
const transport=new StdioClientTransport({command:process.execPath,args:['--experimental-strip-types','server/real-mcp.ts'],cwd:process.cwd(),env,stderr:'pipe'});
try{
 await client.connect(transport);const {tools}=await client.listTools();assert.equal(tools.length,5);
 const tool=tools.find(t=>t.name==='search_booking_hotels');assert(tool);assert.equal(tool.annotations?.readOnlyHint,true);
 const input={destination:'北京',poi:'雍和宫',checkIn:new Date(Date.now()+7*86400000).toISOString().slice(0,10),checkOut:new Date(Date.now()+8*86400000).toISOString().slice(0,10),bookerCountry:'cn',latitude:39.947239,longitude:116.417296};
 const blocked=await client.callTool({name:'search_booking_hotels',arguments:input});assert.equal(blocked.isError,true);assert(JSON.stringify(blocked).includes('partner API token'));
 const invalid=await client.callTool({name:'search_booking_hotels',arguments:{...input,createOrder:true}});assert.equal(invalid.isError,true);
 const report={verifiedAt:new Date().toISOString(),tools:tools.map(t=>t.name),credentials:'intentionally absent in controlled protocol check',missingCredentialsBlocked:true,unknownOrderArgumentRejected:true,realProviderQuery:false,orderCreated:false};
 writeFileSync('docs/cases/booking-mcp-boundary-verification-20261009.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await client.close();}
