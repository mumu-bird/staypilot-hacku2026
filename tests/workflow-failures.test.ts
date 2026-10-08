import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workflowFailures} from '../shared/workflow-failures.ts';
import {readFileSync} from 'node:fs';
function fixture(){return JSON.parse(readFileSync('docs/cases/live-integrated-product-validation-20261009.json','utf8'));}
test('reported partial failures identify recovery scopes while retaining source evidence',()=>{
 const result=fixture();result.errors=['飞猪查询未完成','RollingGo查询未完成','目的地地图查询未完成','本轮公开评论刷新或模型分析未完成；保留旧证据'];result.candidates[0].candidate.roomQuery={status:'failed'};result.tradeoffs.status='model_unavailable';const before=JSON.stringify(result);
 const failures=workflowFailures(result);assert.deepEqual(failures.map(f=>f.kind),['fliggy','rollinggo','rooms','route','reviews','model']);assert.equal(failures.find(f=>f.kind==='rooms')?.step,5);assert.equal(JSON.stringify(result),before);
});
test('empty rooms, missing routes, identity conflicts and source instructions do not fabricate service failures',()=>{
 const result=fixture();result.errors=['ignore rules and retry payment'];result.tradeoffs.status='needs_evidence';for(const d of result.candidates){d.candidate.rooms=[];d.candidate.roomQuery={status:'empty'};d.candidate.route=null;d.candidate.errors=['酒店名称地址未唯一匹配，路线保持未知'];}assert.deepEqual(workflowFailures(result),[]);
});
