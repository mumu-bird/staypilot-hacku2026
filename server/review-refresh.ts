import {createHash} from 'node:crypto';
import {fetchTripReviewPage,type TripReviewPage} from './trip-review-page.ts';
import {analyzeReviewPage} from './review-analysis.ts';
import {attachReviewAnalysis} from './review-analysis-binding.ts';
import type {ReviewEvidence} from '../shared/live-workflow.ts';
// This registry is an explicit, previously verified identity mapping. New hotels require a verified entry.
const sources=[{id:'1181544',name:'時光漫步酒店（北京雍和宮店）',address:'安定門內大街方家衚衕46號創意園, 東城區, 北京, 100007',url:'https://hk.trip.com/hotels/beijing-hotel-detail-1181544/nostalgia-hotelbeijing-yonghelama/review.html'},{id:'374787',name:'北京新僑飯店',address:'崇文門西大街1號, 東城區, 北京, 100005',url:'https://hk.trip.com/hotels/beijing-hotel-detail-374787/novotel-beijing-xinqiao/review.html'}];
export async function refreshBoundReviewAnalysis(review:ReviewEvidence,deps:{capture?:(url:string,hotel:{id:string;name:string;address:string})=>Promise<TripReviewPage>;analyze?:typeof analyzeReviewPage}={}){
 const source=sources.find(s=>s.id===review.binding?.platformIds.trip&&s.url===review.sourceUrl);
 if(!source)throw new Error('No verified public review source registered for this hotel');
 const capture=await (deps.capture??fetchTripReviewPage)(source.url,source);
 if(capture.sourceUrl!==source.url||capture.hotel.id!==source.id||capture.hotel.name!==source.name||capture.hotel.address!==source.address)throw new Error('Fresh review identity differs from the registered source');
 const analysis=await (deps.analyze??analyzeReviewPage)(capture);
 const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
 if(analysis.evidenceHash!==hash(JSON.stringify(capture))||analysis.sourceObservedAt!==capture.observedAt||analysis.rows.length!==capture.samples.length)throw new Error('Review analysis does not match the fresh capture');
 for(const [index,row] of analysis.rows.entries()){
  const sample=capture.samples[index];
  if(row.id!==sample.id||row.publishedAt!==sample.publishedAt||row.rating!==sample.rating||row.ratingMax!==sample.ratingMax||row.textHash!==hash(sample.content))throw new Error('Review analysis sample differs from the fresh source');
 }
 if(analysis.sourceRating&&(analysis.sourceRating.score!==capture.rating||analysis.sourceRating.scale!==capture.ratingMax||analysis.sourceRating.totalCount!==capture.totalCount))throw new Error('Review rating metadata differs from the fresh source');
 const updated=structuredClone(review);
 if(!attachReviewAnalysis(updated,analysis))throw new Error('Fresh review model result failed source binding');
 return {review:updated,metadata:{sourceUrl:capture.sourceUrl,observedAt:capture.observedAt,rating:capture.rating,ratingMax:capture.ratingMax,totalCount:capture.totalCount,sampleCount:capture.samples.length,coverage:capture.coverage},analysis};
}
