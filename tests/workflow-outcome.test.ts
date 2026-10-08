import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {workflowOutcome} from '../shared/workflow-outcome.ts';import type {WorkflowResult} from '../shared/live-workflow.ts';
const actual=JSON.parse(readFileSync('docs/cases/live-integrated-batched-workflow-20261008.json','utf8')) as WorkflowResult;
test('actual blocked offers retain unobserved room coverage rather than claiming market impossibility',()=>{
 const outcome=workflowOutcome(actual);assert.equal(outcome.status,'shown_offers_blocked');assert.equal(outcome.counts.hotels,14);assert(outcome.counts.withoutRooms>0);assert.equal(actual.transactionEnabled,false);
});
test('empty success, failed query, missing evidence and provisional options are distinct outcomes',()=>{
 const r=structuredClone(actual);r.candidates=[];r.errors=[];assert.equal(workflowOutcome(r).status,'empty_observation');
 r.errors=['Query failed'];assert.equal(workflowOutcome(r).status,'query_failed');
 r.candidates=actual.candidates;r.tradeoffs!.options=[];assert.equal(workflowOutcome(r).status,'evidence_needed');
 r.tradeoffs!.options=[{...actual.tradeoffs!.options[0],status:'requires_confirmation'}];assert.equal(workflowOutcome(r).status,'confirmation_needed');
 r.tradeoffs!.options[0].status='within_bounds';assert.equal(workflowOutcome(r).status,'provisional_options');assert.equal(r.transactionEnabled,false);
});
