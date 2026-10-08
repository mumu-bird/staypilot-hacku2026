import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {roomQueryEvidence} from '../shared/room-query-evidence.ts';
test('actual filtered empty and unfiltered room observations preserve different filters and source times',()=>{
 const unfiltered=JSON.parse(readFileSync('docs/cases/live-xinqiao-missing-room-recheck-20261008.json','utf8')).result;
 const filtered=JSON.parse(readFileSync('docs/cases/live-xinqiao-free-cancel-recheck-20261008.json','utf8')).result;
 const a=roomQueryEvidence(unfiltered),b=roomQueryEvidence(filtered);
 assert.equal(a.status,'returned');assert.equal(a.count,85);assert.deepEqual(a.filter,{});
 assert.equal(b.status,'empty');assert.equal(b.count,0);assert.equal(b.filter.cancelPolicy,'CANCELABLE');
 assert.equal(a.observedAt,unfiltered.observedAt);assert.equal(b.observedAt,filtered.observedAt);
 b.filter.cancelPolicy='NON_CANCELABLE';assert.equal(filtered.filter.cancelPolicy,'CANCELABLE');
});
