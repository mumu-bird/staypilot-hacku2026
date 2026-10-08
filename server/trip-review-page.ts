export type TripReviewPage={sourceUrl:string;observedAt:string;hotel:{id:string;name:string;address:string};rating:number;ratingMax:number;totalCount:number;openingYear:number|null;renovationYear:number|null;samples:{id:string;publishedAt:string;stayMonth:string|null;rating:number;ratingMax:number;content:string}[];coverage:'visible_page_only'};
type ExpectedHotel={id:string;name:string;address:string};
const normalized=(value:string)=>value.replace(/[\s（）(),，]/g,'');
const numeric=(value:unknown)=>typeof value==='number'||(typeof value==='string'&&value.trim()!=='')?Number(value):NaN;
const year=(value:unknown)=>{const n=typeof value==='number'?value:typeof value==='string'&&/^\d{4}$/.test(value)?Number(value):NaN;return Number.isInteger(n)&&n>=1900&&n<=2100?n:null;};
export function parseTripReviewPage(html:string,sourceUrl:string,observedAt:string,expected:ExpectedHotel):TripReviewPage{
 const url=new URL(sourceUrl);
 if(url.protocol!=='https:'||url.hostname!=='hk.trip.com'||url.username||url.password||!url.pathname.includes(`hotel-detail-${expected.id}/`)||!url.pathname.endsWith('/review.html'))throw new Error('Unsupported or mismatched review source');
 if(!Number.isFinite(Date.parse(observedAt)))throw new Error('Invalid observation time');
 const match=html.match(/<script\b[^>]*\bid="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
 if(!match)throw new Error('Review page data unavailable; login or verification may be required');
 let root:any;try{root=JSON.parse(match[1]);}catch{throw new Error('Invalid review page data');}
 const data=root?.props?.pageProps?.pageInfo?.initData,hotel=data?.['hohOnlineHeadAlbum-1Props']?.hotel,list=data?.['hohOnlineCommentList-1Props'];
 if(!hotel||!list||String(list.hotelId)!==expected.id||typeof hotel.hotelName!=='string'||typeof hotel.fullAddress!=='string'||normalized(hotel.hotelName)!==normalized(expected.name)||normalized(hotel.fullAddress)!==normalized(expected.address))throw new Error('Review hotel identity mismatch');
 const rating=numeric(list.rating),ratingMax=numeric(list.fullRating),totalCount=numeric(list.totalCount);
 if(!Number.isFinite(rating)||!Number.isFinite(ratingMax)||ratingMax<=0||rating<0||rating>ratingMax||!Number.isSafeInteger(totalCount)||totalCount<0||!Array.isArray(list.groupList))throw new Error('Review rating or coverage metadata unavailable');
 const samples:TripReviewPage['samples']=[],seen=new Set<string>();
 for(const group of list.groupList){if(!Array.isArray(group?.commentList))continue;for(const row of group.commentList){
 const id=String(row?.id??''),date=typeof row?.createDate==='string'?row.createDate.slice(0,10):'',score=numeric(row?.rating),max=numeric(row?.ratingFull);
 if(!/^\d+$/.test(id)||seen.has(id)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||Date.parse(date)>Date.parse(observedAt)||typeof row.content!=='string'||!row.content.trim()||row.content.length>10000||!Number.isFinite(score)||!Number.isFinite(max)||max<=0||score<0||score>max)continue;
 seen.add(id);samples.push({id,publishedAt:date,stayMonth:typeof row.checkinDate==='string'&&/^\d{4}-\d{2}-\d{2}/.test(row.checkinDate)?row.checkinDate.slice(0,7):null,rating:score,ratingMax:max,content:row.content});if(samples.length>=30)break;
 }if(samples.length>=30)break;}
 if(!samples.length)throw new Error('No valid dated review sample; this does not mean there are no negative reviews');
 return {sourceUrl:url.href,observedAt,hotel:{id:expected.id,name:hotel.hotelName,address:hotel.fullAddress},rating,ratingMax,totalCount,openingYear:year(list.openYear),renovationYear:year(list.fitmentYear),samples,coverage:'visible_page_only'};
}
export async function fetchTripReviewPage(sourceUrl:string,expected:ExpectedHotel,request:typeof fetch=fetch):Promise<TripReviewPage>{
 const url=new URL(sourceUrl);
 if(!/^\d+$/.test(expected.id)||url.protocol!=='https:'||url.hostname!=='hk.trip.com'||url.username||url.password||!url.pathname.includes(`hotel-detail-${expected.id}/`)||!url.pathname.endsWith('/review.html'))throw new Error('Unsupported or mismatched review source');
 const response=await request(url.href,{redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!response.ok||!response.headers.get('content-type')?.includes('text/html')||!response.body)throw new Error('Public review page unavailable; no login or access restriction is bypassed');
 const chunks:Buffer[]=[];let size=0;
 for await(const chunk of response.body as unknown as AsyncIterable<Uint8Array>){size+=chunk.byteLength;if(size>1048576){await response.body.cancel().catch(()=>{});throw new Error('Review page exceeds capture limit');}chunks.push(Buffer.from(chunk));}
 return parseTripReviewPage(Buffer.concat(chunks).toString('utf8'),url.href,new Date().toISOString(),expected);
}
