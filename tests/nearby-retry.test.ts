import test from 'node:test';
import assert from 'node:assert/strict';
import {excludedNearbyNames,nearbyRetryDelayMs,nearbyRetryAt} from '../shared/nearby-discovery.ts';
import type {WorkflowResult} from '../shared/live-workflow.ts';
const now=Date.parse('2026-10-08T23:40:00+08:00');
function record(completedAt:string):WorkflowResult{return {completedAt,candidates:[{candidate:{name:'已经核验（北京店）'}}],nearbyDiscovery:{attemptedNames:['临时失败酒店']}} as WorkflowResult;}
test('failed nearby attempts cool down then become eligible, while existing candidates remain excluded',()=>{
 assert(excludedNearbyNames([record(new Date(now-nearbyRetryDelayMs+1).toISOString())],now).has('临时失败酒店'));
 const names=excludedNearbyNames([record(new Date(now-nearbyRetryDelayMs).toISOString())],now);
 assert(!names.has('临时失败酒店'));assert(names.has('已经核验北京店'));
});
test('old, unzoned or future timestamps cannot suppress failed leads indefinitely',()=>{
 for(const at of ['2026-10-01T00:00:00Z','2026-10-08T23:39:00','2026-10-09T00:00:00+08:00']){
  const names=excludedNearbyNames([record(at)],now);assert(!names.has('临时失败酒店'));assert(names.has('已经核验北京店'));
 }
});

test('retry hint only covers returned failed leads and respects most recent attempt',()=>{
 const older=record(new Date(now-10*60_000).toISOString()),newer=record(new Date(now-2*60_000).toISOString());
 assert.equal(nearbyRetryAt([older,newer],['临时失败酒店'],now),new Date(now+13*60_000).toISOString());
 assert.equal(nearbyRetryAt([older],['不同酒店','已经核验（北京店）'],now),null);
 assert.equal(nearbyRetryAt([record(new Date(now-nearbyRetryDelayMs).toISOString())],['临时失败酒店'],now),null);
});
