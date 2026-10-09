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

test('expired trip stops standalone FlyAI monitoring before another provider request',async(t)=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-09T12:00:00+08:00')});
 const directory=mkdtempSync(join(tmpdir(),'staypilot-expired-trip-'));let calls=0;
 const trip={...query,checkIn:'2026-10-09',checkOut:'2026-10-10'};
 const agent=new RealAgent('expired',{directory,search:async()=>{calls++;return normalizeFlyai({status:0,data:{itemList:[]}},trip);}});
 try{
  await agent.startMonitor({...trip,deadline:'2026-10-10T11:00:00+08:00'});assert.equal(calls,1);
  t.mock.timers.setTime(Date.parse('2026-10-10T00:01:00+08:00'));
  await (agent as unknown as {poll():Promise<void>}).poll();
  const state=agent.state();assert.equal(calls,1);assert.equal(state.monitor.enabled,false);assert.equal(state.monitor.nextCheckAt,null);assert.match(state.monitor.lastError??'',/入住日期/);assert(state.events.some(e=>e.action==='行程失效'));assert.equal(state.snapshots.length,1);
 }finally{agent.close();rmSync(directory,{recursive:true,force:true});t.mock.timers.reset();}
});

test('standalone monitor stops after three consecutive failures and resets on successful recovery',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'staypilot-monitor-failure-'));let failing=true,calls=0;
 const agent=new RealAgent('failures',{directory,search:async()=>{calls++;if(failing)throw Error('private-upstream-marker');return normalizeFlyai({status:0,data:{itemList:[]}},query);}});
 const poll=()=> (agent as unknown as {poll():Promise<void>}).poll();
 try{
  await agent.startMonitor({...query,deadline:new Date(Date.now()+3600000).toISOString()});assert.equal(agent.state().monitor.consecutiveFailures,1);
  failing=false;await poll();assert.equal(agent.state().monitor.consecutiveFailures,0);
  failing=true;await poll();await poll();assert.equal(agent.state().monitor.enabled,true);await poll();
  const stopped=agent.state();assert.equal(stopped.monitor.enabled,false);assert.equal(stopped.monitor.nextCheckAt,null);assert.equal(stopped.monitor.consecutiveFailures,3);assert(!JSON.stringify(stopped).includes('private-upstream-marker'));
  const before=calls;await poll();assert.equal(calls,before);failing=false;
  await agent.startMonitor({...query,deadline:new Date(Date.now()+3600000).toISOString()});assert.equal(agent.state().monitor.enabled,true);assert.equal(agent.state().monitor.consecutiveFailures,0);
 }finally{agent.close();rmSync(directory,{recursive:true,force:true});}
});

test('standalone monitor rejects normalized invalid deadlines and stops immediately after a query crosses deadline',async(t)=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-02-28T12:00:00+08:00')});
 const directory=mkdtempSync(join(tmpdir(),'staypilot-monitor-deadline-'));let calls=0,finish!:()=>void;
 const pending=new Promise<void>(resolve=>{finish=resolve;});
 const agent=new RealAgent('deadline',{directory,search:async()=>{calls++;await pending;return normalizeFlyai({status:0,data:{itemList:[]}},query);}});
 try{
  for(const deadline of ['2026-02-29T12:00:00+08:00','2026-02-28T24:00:00+08:00','2026-02-28T13:00:00'])await assert.rejects(agent.startMonitor({...query,deadline}));assert.equal(calls,0);
  const run=agent.startMonitor({...query,deadline:'2026-02-28T13:00:00+08:00'});assert.equal(calls,1);
  t.mock.timers.setTime(Date.parse('2026-02-28T13:00:00+08:00'));finish();await run;
  const state=agent.state();assert.equal(state.monitor.enabled,false);assert.equal(state.monitor.nextCheckAt,null);assert.equal(state.snapshots.length,1);assert(state.events.some(e=>e.action==='监控截止'));
 }finally{finish?.();agent.close();rmSync(directory,{recursive:true,force:true});t.mock.timers.reset();}
});
