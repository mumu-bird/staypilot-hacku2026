import {test} from 'node:test';
import assert from 'node:assert/strict';
import {displayPriceCents} from '../shared/display-money.ts';
import {buildTradeoffOptions,comparePlatforms} from '../server/tradeoffs.ts';
import {recordedCandidates,defaultWorkflowPolicy} from '../server/live-workflow.ts';
test('invalid display amounts cannot become comparable prices',()=>{
 for(const value of [-1,NaN,Infinity,-Infinity,Number.MAX_VALUE,'100',null,undefined])assert.equal(displayPriceCents(value),null);
 assert.equal(displayPriceCents(0),0);assert.equal(displayPriceCents(303.25),30325);
 const saved=recordedCandidates(),a=saved.candidates.find(c=>c.rooms.length)!;a.rooms=a.rooms.slice(0,1);const room=a.rooms[0];room.sourceObservedAt=saved.asOf;
 const b=structuredClone(a);b.source='other-platform' as any;b.key='other:hotel';
 for(const value of [-10,NaN,Infinity,Number.MAX_VALUE]){room.estimatedStayPrice=value;const options=buildTradeoffOptions([a],defaultWorkflowPolicy,saved.asOf,2);assert.equal(options[0].priceCents,null);assert(options[0].gaps.includes('No comparable CNY room price.'));assert.equal(comparePlatforms([a,b],saved.asOf)[0].priceDifferenceCents,null);}
});
