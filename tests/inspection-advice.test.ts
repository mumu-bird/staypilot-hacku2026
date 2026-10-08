import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectionAdviceCurrent} from '../shared/inspection-advice.ts';
test('inspection advice requires matching evidence and current explicit model and evidence times',()=>{
 const result=JSON.parse(readFileSync('docs/cases/live-post-recovery-regression-20261009.json','utf8')),now=Date.parse(result.completedAt),before=JSON.stringify(result);
 assert.equal(inspectionAdviceCurrent(result,now),true);assert.equal(inspectionAdviceCurrent(result,now+16*60000),false);assert.equal(JSON.stringify(result),before);
 for(const field of ['evidenceAsOf','observedAt']){
 const changed=structuredClone(result);const holder=field==='observedAt'?changed.jev:changed;
 for(const value of ['2026-10-09T02:25:00','invalid',new Date(now+60000).toISOString(),new Date(now-16*60000).toISOString()]){holder[field]=value;assert.equal(inspectionAdviceCurrent(changed,now),false);}
 }
 result.jev.evidenceHash='wrong';assert.equal(inspectionAdviceCurrent(result,now),false);result.jev=null;assert.equal(inspectionAdviceCurrent(result,now),false);
});
