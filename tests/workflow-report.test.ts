import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {workflowReport} from '../shared/workflow-report.ts';import type {WorkflowResult} from '../shared/live-workflow.ts';
const actual=JSON.parse(readFileSync('docs/cases/live-followup-room-coverage-workflow-20261008.json','utf8')) as WorkflowResult;
test('readable report preserves actual source times and read-only limits without changing the record',()=>{
 const before=JSON.stringify(actual),html=workflowReport(actual,'en');
 assert(html.includes(actual.evidenceAsOf));assert(html.includes('Budget ceiling'));assert(html.includes('not current inventory'));assert(html.includes('No real order was created'));assert(html.includes('jev-1.13.0'));
 for(const d of actual.candidates){assert(html.includes(d.candidate.name));if(d.representativeRoom)assert(html.includes(d.representativeRoom.sourceObservedAt));}
 assert.equal(JSON.stringify(actual),before);assert(workflowReport(actual).includes('不是当前库存'));
});
test('source content and unsafe URLs cannot execute in a downloaded report',()=>{
 const r=structuredClone(actual);r.candidates[0].candidate.name='<script>alert(1)</script>';r.candidates[0].candidate.detailUrl='javascript:alert(2)';r.candidates[0].gaps=['<img src=x onerror=alert(3)>'];
 const html=workflowReport(r,'en');assert(html.includes('&lt;script&gt;'));assert(html.includes('&lt;img'));assert(!html.includes('<script>'));assert(!html.includes('<img'));assert(!html.includes('javascript:'));assert(html.includes("default-src 'none'"));
});
