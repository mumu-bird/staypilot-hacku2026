import test from 'node:test';import assert from 'node:assert/strict';
import {searchBookingHotels} from '../server/booking-search.ts';
const arrival=new Date(Date.now()+86400000*7).toISOString().slice(0,10),departure=new Date(Date.now()+86400000*8).toISOString().slice(0,10);
const input={destination:'北京',poi:'雍和宫',checkIn:arrival,checkOut:departure,bookerCountry:'cn',latitude:39.947239,longitude:116.417296};
test('Booking search sends bounded official 3.2 read-only request with explicit country and returns unnormalized observations',async()=>{
 let calls=0;const result=await searchBookingHotels(input,{key:'test-private-key',affiliate:'123',fetcher:async(url,init)=>{calls++;assert.equal(url,'https://demandapi.booking.com/3.2/accommodations/search');assert.equal(init?.redirect,'error');const query=JSON.parse(String(init?.body));assert.equal(query.booker.country,'cn');assert.equal(query.rows,10);assert.equal(query.currency,'CNY');assert.equal(query.guests.number_of_rooms,1);return new Response(JSON.stringify({request_id:'fixture',data:[{id:1,price:{display:{booker_currency:500}}}],metadata:{next_page:null}}));}});
 assert.equal(calls,1);assert.equal(result.transactionEnabled,false);assert.equal(result.bookableQuote,false);assert(!JSON.stringify(result).includes('test-private-key'));assert.equal(result.observation.data[0].id,1);
});
test('Booking invalid inputs and missing credentials block before network; provider errors never echo raw bodies',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return new Response('private-upstream-body',{status:403});};
 for(const value of [{...input,bookerCountry:undefined},{...input,latitude:999},{...input,createOrder:true}])await assert.rejects(searchBookingHotels(value,{key:'key',affiliate:'123',fetcher}));
 await assert.rejects(searchBookingHotels(input,{key:'',affiliate:'123',fetcher}),/partner API token/);assert.equal(calls,0);
 await assert.rejects(searchBookingHotels(input,{key:'key',affiliate:'123',fetcher}),e=>e instanceof Error&&!e.message.includes('private-upstream-body')&&e.message.includes('403'));
 await assert.rejects(searchBookingHotels(input,{key:'key',affiliate:'123',fetcher:async()=>new Response(JSON.stringify({data:[],next_page:null}))}),/Demand 3.2/);
});
