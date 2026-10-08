import {test} from 'node:test';
import assert from 'node:assert/strict';
import {zonedTimestamp} from '../shared/zoned-time.ts';
import {buildTradeoffOptions} from '../server/tradeoffs.ts';
import {recordedCandidates,defaultWorkflowPolicy} from '../server/live-workflow.ts';
test('explicit time validation preserves equivalent instants and rejects missing zones or invalid calendar values',()=>{
 assert.equal(zonedTimestamp('2026-10-08T20:00:00+08:00'),zonedTimestamp('2026-10-08T12:00:00Z'));assert.equal(zonedTimestamp('2026-10-08T20:00+08:00'),zonedTimestamp('2026-10-08T12:00:00.000Z'));
 for(const value of ['2026-10-08','2026-10-08T20:00:00','2026-02-30T20:00:00+08:00','2026-10-08T24:00:00+08:00','not a date'])assert.equal(zonedTimestamp(value),null);
 assert.equal(zonedTimestamp('2028-02-29T20:00:00+08:00'),Date.parse('2028-02-29T12:00:00Z'));
});
test('ambiguous cancellation deadline remains an evidence gap rather than a known free window',()=>{
 const original=recordedCandidates(),candidate=original.candidates[0];candidate.rooms=candidate.rooms.map(r=>({...r,cancellationStatus:'free_until',cancelUntil:'2099-10-09T20:00:00'}));
 const options=buildTradeoffOptions([candidate],defaultWorkflowPolicy,original.asOf,2);assert(options.length);assert(options.every(o=>o.gaps.includes('Cancellation deadline unknown.')));
});
