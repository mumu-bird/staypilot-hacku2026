import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {RealAgent} from '../server/real-agent.ts';
import {normalizeFlyai} from '../server/flyai.ts';
import {reviewAssessment,fliggyEvidence} from '../server/fliggy-evidence.ts';
const query={destination:'杭州',poi:'西湖',checkIn:'2099-11-06',checkOut:'2099-11-08'};
test('the same noise evidence conflicts with one profile and is tolerated by another',()=>{
 const sensitive=reviewAssessment('sensitive'),flexible=reviewAssessment('flexible');
 assert.ok(sensitive.excludedBy.includes('noise'));assert.ok(!flexible.excludedBy.includes('noise'));
 assert.ok(flexible.excludedBy.includes('hygiene'));assert.ok(sensitive.risk>flexible.risk);
 assert.equal(sensitive.rows.find(r=>r.issue==='noise')?.sampleSize,10);
 assert.match(fliggyEvidence.warning,/不是全部住客/);assert.equal(flexible.transactionEligible,false);
});
test('real observations persist but monitoring does not silently resume after restart',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'staypilot-real-'));let calls=0;
 const search=async()=>{calls++;return normalizeFlyai({status:0,data:{itemList:[{shId:'1',price:'¥200'}]}},query);};
 const a=new RealAgent('test',{directory,search});
 try{
  await assert.rejects(a.startMonitor({...query,deadline:'2000-01-01T00:00:00Z'}));assert.equal(calls,0);
  await a.startMonitor({...query,deadline:new Date(Date.now()+3600000).toISOString()});
  assert.equal(calls,1);assert.equal(a.state().snapshots.length,1);
  const blocked=a.blockBooking();assert.equal(blocked.orderCreated,false);assert.equal(blocked.transactionEnabled,false);
  a.close();const b=new RealAgent('test',{directory,search});
  try{assert.equal(b.state().snapshots.length,1);assert.equal(b.state().monitor.enabled,false);assert.ok(b.state().events.some(e=>e.action==='真实下单阻断'));}finally{b.close();}
 }finally{a.close();rmSync(directory,{recursive:true,force:true});}
});
test('stopping during an in-flight query prevents another scheduled check',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'staypilot-real-'));let finish!:()=>void;
 const pending=new Promise<void>(resolve=>{finish=resolve;});
 const a=new RealAgent('test',{directory,search:async()=>{await pending;return normalizeFlyai({status:0,data:{itemList:[]}},query);}});
 try{
  const run=a.startMonitor({...query,deadline:new Date(Date.now()+3600000).toISOString()});
  a.stopMonitor();await assert.rejects(a.startMonitor({...query,deadline:new Date(Date.now()+3600000).toISOString()}));
  finish();await run;assert.equal(a.state().monitor.enabled,false);assert.equal(a.state().monitor.nextCheckAt,null);
 }finally{a.close();rmSync(directory,{recursive:true,force:true});}
});
