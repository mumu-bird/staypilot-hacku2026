import {roomQueryEvidence} from '../shared/room-query-evidence.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateRollinggoQuery,normalizeRollinggoSearch,normalizeRollinggoDetail,decodeRollinggoResult,validateRollinggoFilter,RollinggoAgent,RollinggoClient} from '../server/rollinggo.ts';
import type {RollinggoGateway} from '../server/rollinggo.ts';
const query=validateRollinggoQuery({destination:'杭州',poi:'西湖',checkIn:'2099-11-06',checkOut:'2099-11-08'});
const plan={roomName:'双床房',ratePlanId:'r1',averagePrice:352,currency:'CNY',mealAmount:0,mealTypeStr:'不含早餐',cancelable:true,cancelPolicy:'免费取消截止至酒店当地时间 2099-11-04 18:00:00',isOnRequest:false,roomInfo:{hasWindow:true,maxOccupancy:2}};
const detail={success:true,hotelId:499437,name:'示例',checkIn:query.checkIn,checkOut:query.checkOut,roomRatePlans:[plan]};
test('RollingGo binds adult count and dates and refuses unsupported stays before invoking the gateway',()=>{
 assert.equal(query.adultCount,2);assert.equal(query.roomCount,1);
 assert.throws(()=>validateRollinggoQuery({...query,roomCount:2}));assert.throws(()=>validateRollinggoQuery({...query,childCount:1}));assert.throws(()=>validateRollinggoQuery({...query,adultCount:'2'}));assert.throws(()=>validateRollinggoQuery({...query,checkOut:'2099-12-08'}));assert.throws(()=>validateRollinggoQuery({...query,checkIn:'2099-02-30'}));
 assert.throws(()=>validateRollinggoFilter({cancelPolicy:'anything'}));
});
test('hotel stars and nightly display prices cannot masquerade as review scores or taxed totals',()=>{
 const r=normalizeRollinggoSearch({success:true,hotelInformationList:[{hotelId:1,name:'example',starRating:4,price:{hasPrice:true,lowestPrice:352,currency:'CNY'},bookingUrl:'javascript:alert(1)',imageUrl:'https://evil.example/a'}]},query);
 assert.equal(r.hotels[0].reviewScore,null);assert.equal(r.hotels[0].nightlyPrice,352);assert.equal(r.hotels[0].detailUrl,null);assert.equal(r.hotels[0].image,null);assert.equal(r.transactionEnabled,false);assert.ok(r.missingFields.some(x=>x.includes('含税')));
 const unavailable=normalizeRollinggoSearch({success:true,hotelInformationList:[{hotelId:1,price:{hasPrice:false,lowestPrice:0}}]},query);assert.equal(unavailable.hotels[0].nightlyPrice,null);
});
test('room estimates retain missing taxes and refund rules while China cancellation time receives an explicit timezone',()=>{
 const r=normalizeRollinggoDetail(detail,query,499437);assert.equal(r.rooms[0].estimatedStayPrice,704);assert.equal(r.rooms[0].cancelUntil,'2099-11-04T18:00:00+08:00');assert.equal(r.rooms[0].cancellationStatus,'free_until');assert.equal(r.bookableQuote,false);assert.equal(r.transactionEnabled,false);assert.ok(r.rooms[0].missingFields.some(x=>x.includes('税费')));assert.ok(r.rooms[0].missingFields.some(x=>x.includes('截止后')));
 assert.throws(()=>normalizeRollinggoDetail({...detail,hotelId:2},query,499437));assert.throws(()=>normalizeRollinggoDetail({...detail,checkOut:'2099-11-09'},query,499437));
 const uncertain=normalizeRollinggoDetail(detail,{...query,destination:'东京'},499437);assert.equal(uncertain.rooms[0].cancelUntil,null);assert.equal(uncertain.rooms[0].cancellationStatus,'unknown');
});
test('cancellation and meal filters are enforced locally when remote results contain mismatched or unknown fields',()=>{
 const p={...detail,roomRatePlans:[plan,{...plan,ratePlanId:'r2',mealAmount:2,cancelable:false,cancelPolicy:'不可取消，不可退款'},{...plan,ratePlanId:'r3',mealAmount:undefined,cancelable:false,cancelPolicy:undefined}]};
 assert.deepEqual(normalizeRollinggoDetail(p,query,499437,{cancelPolicy:'CANCELABLE',mealType:'NO_MEAL'}).rooms.map(r=>r.ratePlanId),['r1']);
 assert.deepEqual(normalizeRollinggoDetail(p,query,499437,{cancelPolicy:'NON_CANCELABLE',mealType:'DOUBLE_BREAKFAST'}).rooms.map(r=>r.ratePlanId),['r2']);
 assert.equal(normalizeRollinggoDetail(p,query,499437).rooms[2].cancellationStatus,'unknown');
});
test('Beijing cancellation windows survive the local cancellable filter without borrowing another city timezone',()=>{
 for(const destination of ['北京','北京市']){
  const r=normalizeRollinggoDetail(detail,{...query,destination},499437,{cancelPolicy:'CANCELABLE'});
  assert.equal(r.rooms.length,1);assert.equal(r.rooms[0].cancelUntil,'2099-11-04T18:00:00+08:00');assert.equal(r.rooms[0].cancellationStatus,'free_until');
 }
 assert.equal(normalizeRollinggoDetail(detail,{...query,destination:'东京'},499437,{cancelPolicy:'CANCELABLE'}).rooms.length,0);
 const malformed={...detail,roomRatePlans:[{...plan,cancelPolicy:'免费取消截止至酒店当地时间 2099-02-30 18:00:00'}]};
 assert.equal(normalizeRollinggoDetail(malformed,{...query,destination:'北京'},499437,{cancelPolicy:'CANCELABLE'}).rooms.length,0);
});
test('MCP success at transport level cannot hide a tool error, business error or malformed text',()=>{
 assert.throws(()=>decodeRollinggoResult({isError:true,structuredContent:{success:true}}));assert.throws(()=>decodeRollinggoResult({structuredContent:{success:false}}));assert.throws(()=>decodeRollinggoResult({content:[{type:'text',text:'invalid'}]}));assert.deepEqual(decodeRollinggoResult({content:[{type:'text',text:'{"success":true,"tags":[]}'}]}),{success:true,tags:[]});
});
test('readonly gateway refuses transaction tools before loading credentials or making a network call',async()=>{
 const c=new RollinggoClient();await assert.rejects(c.call('bookHotel',{}),/禁止转发/);await assert.rejects(c.call('cancelOrder',{}),/禁止转发/);
});
test('observations persist, quote filters reach the gateway, and book attempts never call an external transaction',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'staypilot-rollinggo-'));const calls:{name:string;args:Record<string,unknown>}[]=[];
 const gateway:RollinggoGateway={discover:async()=>({source:'RollingGo MCP',verifiedAt:new Date().toISOString(),server:null,tools:[],transactionEnabled:false}),call:async(name,args)=>{calls.push({name,args});return name==='searchHotels'?{success:true,hotelInformationList:[]}:detail;}};
 const a=new RollinggoAgent('test',{directory,gateway});
 try{
  await assert.rejects(a.search({...query,adultCount:0}));assert.equal(calls.length,0);
  await a.search({...query,searchRadiusMeters:3000});assert.deepEqual(calls[0].args.filterOptions,{distanceInMeter:3000});assert.deepEqual(calls[0].args.hotelTags,{requiredTags:[],preferredBrands:[]});await a.detail({...query,hotelId:499437,filter:{mealType:'NO_MEAL'}});
  assert.deepEqual(calls[1].args.occupancyParam,{adultCount:2,roomCount:1,childCount:0,childAgeDetails:[]});assert.deepEqual(calls[1].args.filter,{mealType:'NO_MEAL'});
  assert.equal(a.blockBooking().orderCreated,false);assert.equal(calls.length,2);a.close();const b=new RollinggoAgent('test',{directory,gateway});
  try{assert.equal(b.state().searches.length,1);assert.equal(b.state().details[0].rooms[0].estimatedStayPrice,704);assert.ok(b.state().events.some(e=>e.action==='真实下单阻断'));}finally{b.close();}
 }finally{a.close();rmSync(directory,{recursive:true,force:true});}
});

test('invalid search radius never becomes an unrestricted remote search',()=>{for(const radius of [0,-1,50001,NaN,'2000'])assert.throws(()=>validateRollinggoQuery({...query,searchRadiusMeters:radius}));});
test('name lookup rejects a different branch and confirms matching provider ID and address',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'name-lookup-'));let mismatch=true,calls=0;
 const gateway:RollinggoGateway={discover:async()=>({source:'RollingGo MCP',verifiedAt:'',server:null,tools:[],transactionEnabled:false}),call:async(name,args)=>{calls++;return name==='getHotelDetail'?{...detail,name:mismatch?'另一个分店':'具体酒店(北京店)'}:{success:true,hotelInformationList:[{hotelId:499437,name:'具体酒店（北京店）',address:'北新三巷11号',hotelAmenities:['电梯','停车场']}]};}};
 const agent=new RollinggoAgent('case',{directory,gateway});try{await assert.rejects(agent.detailByName({...query,name:'具体酒店（北京店）'}));assert.equal(calls,1);mismatch=false;const result=await agent.detailByName({...query,name:'具体酒店（北京店）'});assert.equal(result.identity?.verified,true);assert.equal(result.identity?.address,'北新三巷11号');assert.equal(result.hotelId,499437);assert.deepEqual(result.identity?.amenities,['电梯','停车场']);assert(result.identity?.observedAt);}finally{agent.close();rmSync(directory,{recursive:true,force:true});}
});
test('conflicting cancellation deadlines or blanket restrictions remain unknown instead of taking the first date',()=>{
 const conflicting=[
 '免费取消截止至酒店当地时间 2099-11-04 18:00:00；免费取消截止至酒店当地时间 2099-11-05 18:00:00',
 '不可取消，不可退款；免费取消截止至酒店当地时间 2099-11-04 18:00:00',
 '免费取消截止至酒店当地时间 2099-11-04 24:00:00'
 ];
 for(const cancelPolicy of conflicting){const r=normalizeRollinggoDetail({...detail,roomRatePlans:[{...plan,cancelPolicy}]},query,499437);assert.equal(r.rooms[0].cancelUntil,null);assert.equal(r.rooms[0].cancellationStatus,'unknown');}
 const valid=normalizeRollinggoDetail({...detail,roomRatePlans:[{...plan,cancelPolicy:plan.cancelPolicy+'；之后不可取消，不可退款'}]},query,499437);assert.equal(valid.rooms[0].cancellationStatus,'free_until');
});

test('name lookup validates and forwards filters and excludes remote mismatches before saving',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'name-filter-'));const calls:{name:string;args:Record<string,unknown>}[]=[];
 const gateway:RollinggoGateway={discover:async()=>({source:'RollingGo MCP',verifiedAt:'',server:null,tools:[],transactionEnabled:false}),call:async(name,args)=>{calls.push({name,args});return name==='getHotelDetail'?{...detail,name:'具体酒店',roomRatePlans:[plan,{...plan,ratePlanId:'nonfree',cancelable:false,cancelPolicy:'不可取消，不可退款'}]}:{success:true,hotelInformationList:[{hotelId:499437,name:'具体酒店',address:'北新三巷11号'}]};}};
 const agent=new RollinggoAgent('case',{directory,gateway});
 try{
  await assert.rejects(agent.detailByName({...query,name:'具体酒店',filter:{cancelPolicy:'invalid'}}));assert.equal(calls.length,0);
  const filter={cancelPolicy:'CANCELABLE',mealType:'NO_MEAL'};
  const result=await agent.detailByName({...query,name:'具体酒店',filter});
  assert.deepEqual(calls[0].args.filter,filter);assert.deepEqual(result.filter,filter);assert.deepEqual(result.rooms.map(r=>r.ratePlanId),['r1']);
  assert.deepEqual(agent.state().details[0].filter,filter);assert.equal(result.identity?.verified,true);
 }finally{agent.close();rmSync(directory,{recursive:true,force:true});}
});

test('filtered empty response distinguishes missing cancellation evidence from no returned plans',()=>{
 const uncertain={...detail,roomRatePlans:[{...plan,cancelable:true,cancelPolicy:'可取消，详情请咨询商户'}]};
 const filtered=normalizeRollinggoDetail(uncertain,query,499437,{cancelPolicy:'CANCELABLE'});
 assert.equal(filtered.rooms.length,0);assert.deepEqual(roomQueryEvidence(filtered).filterDiagnostics,filtered.filterDiagnostics);assert.notEqual(roomQueryEvidence(filtered).filterDiagnostics,filtered.filterDiagnostics);assert.deepEqual(filtered.filterDiagnostics,{received:1,excluded:1,unknownCancellationExcluded:1});
 assert.deepEqual(normalizeRollinggoDetail({...detail,roomRatePlans:[]},query,499437,{cancelPolicy:'CANCELABLE'}).filterDiagnostics,{received:0,excluded:0,unknownCancellationExcluded:0});
 assert.deepEqual(normalizeRollinggoDetail(uncertain,query,499437).filterDiagnostics,{received:1,excluded:0,unknownCancellationExcluded:0});
 const known=normalizeRollinggoDetail({...detail,roomRatePlans:[{...plan,cancelable:false,cancelPolicy:'不可取消，不可退款'}]},query,499437,{cancelPolicy:'CANCELABLE'});
 assert.deepEqual(known.filterDiagnostics,{received:1,excluded:1,unknownCancellationExcluded:0});
});
