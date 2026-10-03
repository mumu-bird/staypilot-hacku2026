import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeFlyai,validateFlyaiQuery} from '../server/flyai.ts';
const query={destination:'杭州',poi:'西湖',checkIn:'2099-11-06',checkOut:'2099-11-08'};
test('search price and zero score never become a verified transaction quote',()=>{
 const result=normalizeFlyai({status:0,data:{itemList:[{shId:'1',name:'酒店',price:'¥243',rate:'0',decorationTime:'2024'}]}},query);
 assert.equal(result.transactionEnabled,false);assert.equal(result.hotels[0].price,'¥243');assert.equal(result.hotels[0].score,'0');assert.ok(result.missingFields.includes('住宿含税总价与税费明细'));assert.ok(result.missingFields.includes('开业时间'));
});
test('external results cannot inject script links or non-platform destinations',()=>{
 const result=normalizeFlyai({status:0,data:{itemList:[{detailUrl:'javascript:alert(1)',mainPic:'https://example.com/a.png'},{detailUrl:'https://feizhu.com.evil.example/a'},{detailUrl:'https://router.feizhu.com/ws/test'}]}},query);
 assert.equal(result.hotels[0].detailUrl,null);assert.equal(result.hotels[0].image,null);assert.equal(result.hotels[1].detailUrl,null);assert.equal(result.hotels[2].detailUrl,'https://router.feizhu.com/ws/test');
});
test('invalid calendar dates or inverted stays are rejected before external calls',()=>{
 assert.throws(()=>validateFlyaiQuery({...query,checkIn:'2099-02-30'}));assert.throws(()=>validateFlyaiQuery({...query,checkOut:query.checkIn}));assert.throws(()=>normalizeFlyai({status:1,message:'error'},query));
});
