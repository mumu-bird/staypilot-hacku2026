import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseTripReviewPage,fetchTripReviewPage} from '../server/trip-review-page.ts';
const url='https://hk.trip.com/hotels/beijing-hotel-detail-123/hotel/review.html',at='2026-10-08T12:00:00Z',expected={id:'123',name:'Hotel A',address:'Street 46, Beijing'};
function page(extra:any={}){
 const hotel={hotelName:expected.name,fullAddress:expected.address};
 const rows=[{id:1,createDate:'2026-03-14 12:00:00',checkinDate:'2026-03-01',rating:10,ratingFull:10,content:'Insulation was weak, but the stay was quiet.'},{id:1,createDate:'2026-03-14',rating:10,ratingFull:10,content:'duplicate'},{id:2,createDate:'2026-99-99',rating:10,ratingFull:10,content:'invalid date'}];
 const list={hotelId:123,rating:9.4,fullRating:10,totalCount:100,openYear:2014,fitmentYear:2023,groupList:[{commentList:rows}],...extra};
 const initData={'hohOnlineHeadAlbum-1Props':{hotel},'hohOnlineCommentList-1Props':list};
 return '<script id="__NEXT_DATA__">'+JSON.stringify({props:{pageProps:{pageInfo:{initData}}}})+'</script>';
}
test('review parsing retains high-rated issue-bearing text, dates and partial coverage without conflating renovation',()=>{
 const result=parseTripReviewPage(page(),url,at,expected);assert.equal(result.samples.length,1);assert.equal(result.samples[0].rating,10);assert.equal(result.samples[0].stayMonth,'2026-03');assert.equal(result.coverage,'visible_page_only');assert.equal(result.openingYear,2014);assert.equal(result.renovationYear,2023);
});
test('mismatched identities, untrusted URLs, blocked pages and missing ratings do not become review evidence',()=>{
 assert.throws(()=>parseTripReviewPage(page(),url,at,{...expected,address:'Another Street'}));assert.throws(()=>parseTripReviewPage(page(),url.replace('hk.trip.com','example.com'),at,expected));assert.throws(()=>parseTripReviewPage('<title>Login required</title>',url,at,expected));assert.throws(()=>parseTripReviewPage(page({rating:null}),url,at,expected));assert.throws(()=>parseTripReviewPage(page({groupList:[]}),url,at,expected));
});

test('public review fetching validates before network and never follows redirects or accepts a blocked page',async()=>{
 let calls=0;const request=async(_url:any,options:any)=>{calls++;assert.equal(options.redirect,'error');return new Response(page(),{headers:{'content-type':'text/html'}});};
 await assert.rejects(fetchTripReviewPage('http://127.0.0.1/private',expected,request));assert.equal(calls,0);
 assert.equal((await fetchTripReviewPage(url,expected,request)).samples.length,1);
 await assert.rejects(fetchTripReviewPage(url,expected,async()=>new Response('verify',{status:403})));
});
