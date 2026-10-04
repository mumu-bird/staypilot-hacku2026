import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildJevRequest,assessJev,validateJevChoice,jevEvidenceKey,typeSafeHttp} from '../server/typesafe.ts';
import type {RollinggoState} from '../shared/rollinggo.ts';
const state:RollinggoState={searches:[{source:'RollingGo MCP',observedAt:'2026-10-04T03:00:00Z',query:{destination:'杭州',poi:'西湖',checkIn:'2026-11-06',checkOut:'2026-11-08',adultCount:2,roomCount:1,childCount:0,size:5},hotels:[{id:1,name:'测试酒店',address:'测试地址',starRating:4,nightlyPrice:300,currency:'CNY',priceMessage:null,amenities:['洗衣房'],tags:[],image:null,detailUrl:null,reviewScore:null}],transactionEnabled:false,missingFields:['税费']}],details:[],discovery:null,events:[],transactionEnabled:false};
const answer=(keys:string[],choice=keys[0])=>({type:'choice',choice,confidence:1,probabilities:Object.fromEntries(keys.map(k=>[k,k===choice?1:0]))});
test('Jev inputs use observed facts, explicit independent tasks and no-match, without granting purchase authority',()=>{
 const r=buildJevRequest(state,{focus:'有窗、安静',budget:999999,confirmed:true});
 assert.deepEqual(Object.keys(r.questions.candidate_to_inspect.criteria),['none','hotel_1']);assert.match(r.questions.next_evidence_action.instructions,/independent/);assert.equal(r.state.candidates[0].guest_review_score,null);assert.equal(r.state.known_gaps.tax_inclusive_total,'not verified');assert.ok(!JSON.stringify(r).includes('999999'));assert.throws(()=>buildJevRequest(state,{focus:'安静',hotelId:99}));assert.throws(()=>buildJevRequest({...state,searches:[]},{focus:'安静'}));
});
test('model selections require complete finite probabilities, a maximum-probability choice and the exact offered options',()=>{
 assert.equal(validateJevChoice(answer(['a','b']),'a,b'.split(',')).choice,'a');
 for(const invalid of [{...answer(['a','b']),choice:'pay'},{...answer(['a','b']),probabilities:{a:0.3,b:0.3}},{...answer(['a','b']),probabilities:{a:0.2,b:0.8}},{...answer(['a','b']),confidence:2},{...answer(['a','b']),probabilities:{a:1,b:0,pay:0}}])assert.throws(()=>validateJevChoice(invalid,['a','b']));
});
test('fresh source hashes change with observations and are independent of the model result or event log',()=>{
 assert.notEqual(jevEvidenceKey(state),jevEvidenceKey({...state,searches:[{...state.searches[0],observedAt:'2026-10-04T04:00:00Z'}]}));assert.equal(jevEvidenceKey(state),jevEvidenceKey({...state,events:[{at:'now',action:'jev',reason:'test'}]}));
});
test('successful model advice does not mutate source state or introduce authority, costs or executed actions',async()=>{
 const before=JSON.stringify(state);let questionCount=0;
 const r=await assessJev(state,{focus:'安静'},async(_path,payload)=>{const p=payload as ReturnType<typeof buildJevRequest>;questionCount=Object.keys(p.questions).length;return {model:'jev-test',answers:{candidate_to_inspect:answer(Object.keys(p.questions.candidate_to_inspect.criteria),'hotel_1'),next_evidence_action:answer(Object.keys(p.questions.next_evidence_action.criteria),'inspect_reviews')},usage:{input_tokens:100,output_tokens:20},confirmed:true,budget:999};});
 assert.equal(questionCount,2);assert.equal(JSON.stringify(state),before);assert.equal(r.advisoryOnly,true);assert.equal(r.actionExecuted,false);assert.equal(r.transactionEnabled,false);assert.ok(!JSON.stringify(r).includes('"confirmed"'));
 await assert.rejects(assessJev(state,{focus:'安静'},async()=>({model:'jev-test',answers:{},usage:{input_tokens:1,output_tokens:1}})));
});
test('TypeSafe errors do not expose credentials or private error bodies and overload retries are bounded',async()=>{
 const old=process.env.TYPESAFE_API_KEY;process.env.TYPESAFE_API_KEY='private-test-key';
 try{
  await assert.rejects(typeSafeHttp('/v1/models',undefined,async()=>new Response('private-test-key',{status:401})),e=>!String(e).includes('private-test-key')&&String(e).includes('401'));
  let calls=0;const r=await typeSafeHttp('/v1/models',undefined,async()=>{calls++;return calls===1?new Response('busy',{status:429}):new Response('{"models":[]}');});assert.equal(calls,2);assert.deepEqual(r,{models:[]});
 }finally{if(old===undefined)delete process.env.TYPESAFE_API_KEY;else process.env.TYPESAFE_API_KEY=old;}
});
