import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {LiveWorkflow,defaultWorkflowPolicy} from '../server/live-workflow.ts';
test('withdrawal persists across restart and blocks tool work until explicit valid reconfirmation',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'query-consent-'));let calls=0;const unused=async():Promise<any>=>{calls++;throw Error('Unexpected tool');};
 const deps={flySearch:unused,rollingSearch:unused,rollingDetail:unused,places:unused,routes:unused,jev:unused};let flow=new LiveWorkflow('case',deps,dir);
 const input={mode:'live',query:{destination:'北京',poi:'雍和宫',checkIn:'2099-10-09',checkOut:'2099-10-10',adultCount:2},policy:defaultWorkflowPolicy,queryOnly:true};
 try{
  flow.stopMonitor('consent_revoked');flow.stopMonitor('manual');flow.close();flow=new LiveWorkflow('case',deps,dir);
  await assert.rejects(flow.run(input),/授权已撤销/);await assert.rejects(flow.expandNearby({}),/授权已撤销/);await assert.rejects(flow.refreshCandidate({}),/授权已撤销/);await assert.rejects(flow.recheck({}),/授权已撤销/);await assert.rejects(flow.reevaluate({}),/授权已撤销/);await assert.rejects(flow.startMonitor({}),/授权已撤销/);assert.throws(()=>flow.selectInspection({}),/授权已撤销/);assert.equal(calls,0);
  assert.throws(()=>flow.authorizeQueries({...input,queryOnly:false}));await assert.rejects(flow.run(input),/授权已撤销/);
  flow.authorizeQueries(input);assert.equal(calls,0);await assert.rejects(flow.run({...input,policy:{...defaultWorkflowPolicy,budgetCents:70000}}),/只读授权范围/);await assert.rejects(flow.run({...input,query:{...input.query,poi:'故宫'}}),/只读授权范围/);assert.equal(calls,0);flow.close();flow=new LiveWorkflow('case',deps,dir);
  await assert.rejects(flow.run({...input,policy:{...defaultWorkflowPolicy,budgetCents:70000}}),/只读授权范围/);
  await assert.rejects(flow.expandNearby({}),error=>error instanceof Error&&!error.message.includes('授权已撤销'));assert.equal(calls,0);
 }finally{flow.close();rmSync(dir,{recursive:true,force:true});}
});

test('reconfirming changed conditions stops old monitoring and same conditions keep it',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'monitor-consent-'));let calls=0;const unavailable=async():Promise<any>=>{calls++;throw Error('Simulated provider outage');};
 const flow=new LiveWorkflow('case',{flySearch:unavailable,rollingSearch:unavailable,rollingDetail:unavailable,places:unavailable,routes:unavailable,jev:unavailable},dir);
 const input={mode:'live',query:{destination:'北京',poi:'雍和宫',checkIn:'2099-10-09',checkOut:'2099-10-10',adultCount:2},policy:defaultWorkflowPolicy,queryOnly:true};
 try{
  flow.authorizeQueries(input);await flow.startMonitor({...input,deadline:new Date(Date.now()+3600_000).toISOString()});assert.equal(flow.state().monitor.enabled,true);
  const before=calls;flow.authorizeQueries(input);assert.equal(flow.state().monitor.enabled,true);assert.equal(calls,before);
  const stopped=flow.authorizeQueries({...input,policy:{...defaultWorkflowPolicy,budgetCents:70000}});assert.equal(stopped.monitor.enabled,false);assert.equal(stopped.monitor.nextCheckAt,null);assert.equal(stopped.monitor.stopReason,'conditions_changed');assert.equal(calls,before);
  await assert.rejects(flow.run(input),/只读授权范围/);assert.equal(calls,before);
 }finally{flow.close();rmSync(dir,{recursive:true,force:true});}
});

test('production consent gate blocks new and legacy unconfirmed sessions without tool calls',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'first-consent-'));let calls=0;const unused=async():Promise<any>=>{calls++;throw Error('Must not query');};const deps={requireQueryConsent:true,flySearch:unused,rollingSearch:unused,rollingDetail:unused,places:unused,routes:unused,jev:unused};
 let flow=new LiveWorkflow('case',deps,dir);const input={mode:'live',query:{destination:'北京',poi:'雍和宫',checkIn:'2099-10-09',checkOut:'2099-10-10',adultCount:2},policy:defaultWorkflowPolicy,queryOnly:true};
 try{
  await assert.rejects(flow.run(input),/尚未确认/);await assert.rejects(flow.expandNearby({}),/尚未确认/);await assert.rejects(flow.refreshCandidate({}),/尚未确认/);await assert.rejects(flow.recheck({}),/尚未确认/);await assert.rejects(flow.startMonitor({}),/尚未确认/);assert.equal(calls,0);
  assert.throws(()=>flow.authorizeQueries({...input,mode:'recorded'}));await assert.rejects(flow.run(input),/尚未确认/);
  flow.close();flow=new LiveWorkflow('case',deps,dir);await assert.rejects(flow.run(input),/尚未确认/);
  flow.authorizeQueries(input);assert.equal(calls,0);flow.close();flow=new LiveWorkflow('case',deps,dir);await assert.rejects(flow.expandNearby({}),error=>error instanceof Error&&!error.message.includes('尚未确认'));assert.equal(calls,0);
 }finally{flow.close();rmSync(dir,{recursive:true,force:true});}
});
