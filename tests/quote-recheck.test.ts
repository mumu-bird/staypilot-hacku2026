import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LiveWorkflow,recordedCandidates,defaultWorkflowPolicy} from '../server/live-workflow.ts';
test('exact quote rechecks persist unchanged, changed terms, missing quote and failure without inventing savings',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'quote-check-'));const original=recordedCandidates(),candidate=original.candidates[0],room=candidate.rooms[0];
 const arrival=new Date(Date.now()+86400000*7).toISOString().slice(0,10),departure=new Date(Date.now()+86400000*8).toISOString().slice(0,10);
 const run={id:'original',mode:'live',query:{...original.query,checkIn:arrival,checkOut:departure},policy:defaultWorkflowPolicy,candidates:[{candidate}]};
 let stage=0;const unsupported=async():Promise<any>=>{throw new Error('unused');};
 const flow=new LiveWorkflow('one',{flySearch:unsupported,rollingSearch:unsupported,places:unsupported,routes:unsupported,jev:unsupported,rollingDetail:async()=>{stage++;if(stage===4)throw new Error('offline');return {hotelId:Number(candidate.hotelId),name:candidate.name,rooms:stage===3?[]:[{...room,cancelPolicy:stage===2?'changed policy':room.cancelPolicy}],observedAt:new Date().toISOString()} as any;}},dir);
 const db=new DatabaseSync(join(dir,'one.sqlite'));db.prepare('INSERT INTO runs(payload) VALUES(?)').run(JSON.stringify(run));db.close();
 const request={runId:run.id,candidateKey:candidate.key,ratePlanId:room.ratePlanId};
 try{assert.equal((await flow.recheck(request)).status,'unchanged');const changed=await flow.recheck(request);assert.equal(changed.status,'terms_changed');assert.equal(changed.deltaCents,null);assert.equal((await flow.recheck(request)).status,'not_found');assert.equal((await flow.recheck(request)).status,'failed');assert.equal(flow.state().rechecks?.length,4);await assert.rejects(flow.recheck({...request,runId:'foreign-session'}));assert.equal(stage,4);}finally{flow.close();rmSync(dir,{recursive:true,force:true});}
});
test('a selected quote watch rechecks the same plan without search and stops on changed terms',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'quote-watch-')),original=recordedCandidates(),candidate=original.candidates[0],room=candidate.rooms[0],asOf=new Date().toISOString();candidate.route!.observedAt=asOf;room.cancelUntil=new Date(Date.now()+10*60000).toISOString();room.sourceObservedAt=asOf;room.cancellationStatus='free_until';
 const query={...original.query,checkIn:new Date(Date.now()+7*86400000).toISOString().slice(0,10),checkOut:new Date(Date.now()+8*86400000).toISOString().slice(0,10)};
 let calls=0;const unsupported=async():Promise<any>=>{throw new Error('Search must not run for selected quote');};
 const flow=new LiveWorkflow('one',{flySearch:unsupported,rollingSearch:unsupported,places:unsupported,routes:unsupported,jev:unsupported,rollingDetail:async(input)=>{assert.equal(input.hotelId,Number(candidate.hotelId));calls++;return {hotelId:Number(candidate.hotelId),name:candidate.name,rooms:[{...room,cancelPolicy:calls===2?'changed policy':room.cancelPolicy}],observedAt:new Date().toISOString()} as any;}},dir);
 const hash='a'.repeat(64),version='b'.repeat(64),run={id:'watch',mode:'live',query,policy:defaultWorkflowPolicy,evidenceAsOf:asOf,candidates:[{candidate}],tradeoffs:{evidenceHash:hash,policyVersion:version,options:[{id:'option',status:'within_bounds',hardViolations:[],priceCents:Math.round(room.estimatedStayPrice!*100),minutes:15,candidateKey:candidate.key,ratePlanId:room.ratePlanId,hotelName:candidate.name,roomName:room.roomName}]}};
 const db=new DatabaseSync(join(dir,'one.sqlite'));db.prepare('INSERT INTO runs(payload) VALUES(?)').run(JSON.stringify(run));db.prepare('INSERT INTO selections(payload) VALUES(?)').run(JSON.stringify({id:'selection',purpose:'inspection_only',transactionEnabled:false,runId:run.id,optionId:'option',evidenceHash:hash,policyVersion:version}));db.close();
 const input={mode:'live',query,policy:defaultWorkflowPolicy,queryOnly:true,useJev:false,deadline:new Date(Date.now()+3600000).toISOString()};
 try{const first=await flow.startMonitor(input);assert.equal(first.monitor.mode,'quote');assert.equal(first.monitor.target?.ratePlanId,room.ratePlanId);assert.equal(first.monitor.checks,1);assert(first.monitor.enabled);assert.equal(first.monitor.nextCheckAt,room.cancelUntil);assert.equal(first.latest?.id,run.id);flow.stopMonitor();const changed=await flow.startMonitor(input);assert.equal(calls,2);assert.equal(changed.monitor.enabled,false);assert(changed.monitor.lastError);assert.equal(changed.rechecks?.[0].status,'terms_changed');assert.equal(changed.selectionValid,false);}finally{flow.close();rmSync(dir,{recursive:true,force:true});}
});
test('targeted refresh recovers only the selected hotel and keeps the previous record intact',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'hotel-refresh-')),original=recordedCandidates(),candidate=original.candidates[0],room=candidate.rooms[0];
 const query={...original.query,checkIn:new Date(Date.now()+7*86400000).toISOString().slice(0,10),checkOut:new Date(Date.now()+8*86400000).toISOString().slice(0,10)};
 let detailCalls=0;const unsupported=async():Promise<any>=>{throw new Error('unused source');};
 const flow=new LiveWorkflow('one',{flySearch:unsupported,rollingSearch:unsupported,places:unsupported,routes:unsupported,jev:unsupported,rollingDetail:async()=>{detailCalls++;return {hotelId:Number(candidate.hotelId),name:candidate.name,detailUrl:null,rooms:[{...room,ratePlanId:'replacement',estimatedStayPrice:400}],observedAt:new Date().toISOString()} as any;}},dir);
 const hash='a'.repeat(64),run={id:'old',mode:'live',query,policy:defaultWorkflowPolicy,candidates:[{candidate}],trace:[],evidenceHash:hash};const db=new DatabaseSync(join(dir,'one.sqlite'));db.prepare('INSERT INTO runs(payload) VALUES(?)').run(JSON.stringify(run));db.close();
 try{const refreshed=await flow.refreshCandidate({runId:run.id,candidateKey:candidate.key,evidenceHash:hash});assert.equal(detailCalls,1);assert.equal(refreshed.kind,'candidate_refresh');assert.equal(refreshed.parentRunId,'old');assert.equal(refreshed.candidates.length,1);assert.equal(refreshed.candidates[0].candidate.rooms[0].ratePlanId,'replacement');assert.equal(refreshed.candidates[0].candidate.route,null);assert.equal(refreshed.transactionEnabled,false);assert.equal(flow.history()[1].candidates[0].candidate.rooms[0].ratePlanId,room.ratePlanId);await assert.rejects(flow.refreshCandidate({runId:'old',candidateKey:candidate.key,evidenceHash:hash}));assert.equal(detailCalls,1);}finally{flow.close();rmSync(dir,{recursive:true,force:true});}
});

test('selected quote monitoring stops before calling merchant when cancellation has expired',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'expired-watch-')),original=recordedCandidates(),candidate=original.candidates[0],room=candidate.rooms[0],asOf=new Date().toISOString();
 room.cancelUntil=new Date(Date.now()-1000).toISOString();
 const query={...original.query,checkIn:new Date(Date.now()+7*86400000).toISOString().slice(0,10),checkOut:new Date(Date.now()+8*86400000).toISOString().slice(0,10)};
 let calls=0;const unsupported=async():Promise<any>=>{calls++;throw new Error('No tools should run');};
 const flow=new LiveWorkflow('one',{flySearch:unsupported,rollingSearch:unsupported,places:unsupported,routes:unsupported,jev:unsupported,rollingDetail:unsupported},dir);
 const hash='a'.repeat(64),version='b'.repeat(64),run={id:'expired',mode:'live',query,policy:defaultWorkflowPolicy,evidenceAsOf:asOf,candidates:[{candidate}],tradeoffs:{evidenceHash:hash,policyVersion:version,options:[{id:'option',status:'within_bounds',hardViolations:[],priceCents:50000,minutes:15,candidateKey:candidate.key,ratePlanId:room.ratePlanId,hotelName:candidate.name,roomName:room.roomName}]}};
 const db=new DatabaseSync(join(dir,'one.sqlite'));db.prepare('INSERT INTO runs(payload) VALUES(?)').run(JSON.stringify(run));db.prepare('INSERT INTO selections(payload) VALUES(?)').run(JSON.stringify({id:'selection',purpose:'inspection_only',transactionEnabled:false,runId:run.id,optionId:'option',evidenceHash:hash,policyVersion:version}));db.close();
 try{await assert.rejects(flow.startMonitor({mode:'live',query,policy:defaultWorkflowPolicy,useJev:false,queryOnly:true,deadline:new Date(Date.now()+3600000).toISOString()}));assert.equal(flow.state().monitor.enabled,false);assert.equal(flow.state().monitor.nextCheckAt,null);assert.equal(calls,0);}finally{flow.close();rmSync(dir,{recursive:true,force:true});}
});
test('monitor recovery preserves target and counts but never resumes queries or restores authority',()=>{
 const dir=mkdtempSync(join(tmpdir(),'monitor-recovery-'));let calls=0;
 const unsupported=async():Promise<any>=>{calls++;throw new Error('No recovery tool calls');};
 const deps={flySearch:unsupported,rollingSearch:unsupported,places:unsupported,routes:unsupported,jev:unsupported,rollingDetail:unsupported};
 const first=new LiveWorkflow('one',deps,dir);first.close();
 const db=new DatabaseSync(join(dir,'one.sqlite'));db.prepare('INSERT INTO monitor_state(id,payload) VALUES(1,?)').run(JSON.stringify({enabled:true,checks:7,deadline:new Date(Date.now()+3600000).toISOString(),nextCheckAt:new Date().toISOString(),lastError:null,mode:'quote',target:{runId:'old',candidateKey:'rollinggo:1',ratePlanId:'old-rate',hotelName:'Actual target',roomName:'Original room',checkIn:'2099-01-01',checkOut:'2099-01-02'}}));db.close();
 const recovered=new LiveWorkflow('one',deps,dir);
 try{const state=recovered.state();assert.equal(state.monitor.enabled,false);assert.equal(state.monitor.nextCheckAt,null);assert.equal(state.monitor.stopReason,'interrupted');assert.equal(state.monitor.checks,7);assert.equal(state.monitor.target?.ratePlanId,'old-rate');assert.equal(calls,0);assert.equal(state.selectionValid,false);recovered.stopMonitor();assert.equal(recovered.state().monitor.stopReason,'manual');}finally{recovered.close();}
 const again=new LiveWorkflow('one',deps,dir);try{assert.equal(again.state().monitor.stopReason,'manual');assert.equal(again.state().monitor.checks,7);assert.equal(calls,0);}finally{again.close();rmSync(dir,{recursive:true,force:true});}
});
test('rate plan names participate in same-terms comparison, including missing historical metadata',async()=>{
 const {compareRoomTerms}=await import('../server/tradeoffs.ts');const room=recordedCandidates().candidates[0].rooms[0];
 assert.equal(compareRoomTerms({...room,ratePlanName:'Standard offer'}),compareRoomTerms({...room,ratePlanName:'Standard offer'}));
 assert.notEqual(compareRoomTerms({...room,ratePlanName:'Standard offer'}),compareRoomTerms({...room,ratePlanName:'Member offer'}));
 assert.notEqual(compareRoomTerms(room),compareRoomTerms({...room,ratePlanName:'Standard offer'}));
});
test('explicit absence of free cancellation blocks required-free options without inventing a nonrefundable fee schedule',async()=>{
 const {buildTradeoffOptions}=await import('../server/tradeoffs.ts');const {assessCandidate}=await import('../server/live-workflow.ts');
 const candidate=structuredClone(recordedCandidates().candidates[0]);candidate.rooms=candidate.rooms.map(r=>({...r,cancelable:false,cancelPolicy:'不可免费取消',cancellationStatus:'unknown' as const,cancelUntil:null}));
 const at=new Date().toISOString();const options=buildTradeoffOptions([candidate],defaultWorkflowPolicy,at,2);assert.ok(options.length);assert.ok(options.every(o=>o.status==='blocked'&&o.hardViolations.some(s=>s.includes('Free cancellation is explicitly unavailable'))));
 assert.ok(assessCandidate(candidate,defaultWorkflowPolicy,at).reasons.some(s=>s.includes('均不提供')));
 const relaxed=buildTradeoffOptions([candidate],{...defaultWorkflowPolicy,requireCancelable:false},at,2);assert.ok(relaxed.every(o=>!o.hardViolations.some(s=>s.includes('Free cancellation is explicitly unavailable'))));assert.equal(candidate.rooms[0].cancellationStatus,'unknown');
});

test('restarting a selected quote monitor rejects changed or uncertain rechecks without silently searching',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'uncertain-watch-')),original=recordedCandidates(),candidate=original.candidates[0],room=candidate.rooms[0];
 const query={...original.query,checkIn:new Date(Date.now()+7*86400000).toISOString().slice(0,10),checkOut:new Date(Date.now()+8*86400000).toISOString().slice(0,10)};
 let calls=0;const unsupported=async():Promise<any>=>{calls++;throw new Error('Must not run');};
 const flow=new LiveWorkflow('one',{flySearch:unsupported,rollingSearch:unsupported,places:unsupported,routes:unsupported,jev:unsupported,rollingDetail:unsupported},dir);
 const hash='a'.repeat(64),version='b'.repeat(64),run={id:'watch',mode:'live',query,policy:defaultWorkflowPolicy,candidates:[{candidate}],tradeoffs:{evidenceHash:hash,policyVersion:version,options:[{id:'option',status:'within_bounds',hardViolations:[],priceCents:50000,minutes:15,candidateKey:candidate.key,ratePlanId:room.ratePlanId}]}};
 const db=new DatabaseSync(join(dir,'one.sqlite'));db.prepare('INSERT INTO runs(payload) VALUES(?)').run(JSON.stringify(run));db.prepare('INSERT INTO selections(payload) VALUES(?)').run(JSON.stringify({runId:run.id,optionId:'option',evidenceHash:hash,policyVersion:version}));
 try{for(const status of ['failed','price_changed','terms_changed','not_found']){
 db.prepare('INSERT INTO rechecks(payload) VALUES(?)').run(JSON.stringify({runId:run.id,candidateKey:candidate.key,ratePlanId:room.ratePlanId,status}));
 await assert.rejects(flow.startMonitor({mode:'live',query,policy:defaultWorkflowPolicy,useJev:false,queryOnly:true,deadline:new Date(Date.now()+3600000).toISOString()}),/先刷新酒店/);
 assert.equal(flow.state().monitor.enabled,false);assert.equal(calls,0);
 }}finally{db.close();flow.close();rmSync(dir,{recursive:true,force:true});}
});

test('selected monitor cannot bypass stale, future or uncertain offer validity checks',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'invalid-selection-watch-')),original=recordedCandidates(),candidate=original.candidates[0],room=candidate.rooms[0],now=Date.now();
 const query={...original.query,checkIn:new Date(now+7*86400000).toISOString().slice(0,10),checkOut:new Date(now+8*86400000).toISOString().slice(0,10)};
 let calls=0;const unsupported=async():Promise<any>=>{calls++;throw new Error('Must not query');};
 const flow=new LiveWorkflow('one',{flySearch:unsupported,rollingSearch:unsupported,rollingDetail:unsupported,places:unsupported,routes:unsupported,jev:unsupported},dir),db=new DatabaseSync(join(dir,'one.sqlite'));
 const hash='a'.repeat(64),version='b'.repeat(64),option={id:'option',status:'within_bounds',hardViolations:[],priceCents:50000,minutes:15,candidateKey:candidate.key,ratePlanId:room.ratePlanId},run={id:'watch',mode:'live',query,policy:defaultWorkflowPolicy,evidenceAsOf:new Date(now).toISOString(),candidates:[{candidate}],tradeoffs:{evidenceHash:hash,policyVersion:version,options:[option]}};
 db.prepare('INSERT INTO selections(payload) VALUES(?)').run(JSON.stringify({id:'selection',purpose:'inspection_only',transactionEnabled:false,runId:run.id,optionId:option.id,evidenceHash:hash,policyVersion:version}));
 try{for(const variant of ['stale_quote','future_quote','future_evidence','uncertain_cancel','expired_cancel','over_budget']){
 room.sourceObservedAt=new Date(now).toISOString();room.cancelUntil=new Date(now+3600000).toISOString();room.cancellationStatus='free_until';run.evidenceAsOf=new Date(now).toISOString();option.priceCents=50000;
 if(variant==='stale_quote')room.sourceObservedAt=new Date(now-16*60000).toISOString();if(variant==='future_quote')room.sourceObservedAt=new Date(now+60000).toISOString();if(variant==='future_evidence')run.evidenceAsOf=new Date(now+60000).toISOString();if(variant==='uncertain_cancel')room.cancellationStatus='unknown';if(variant==='expired_cancel')room.cancelUntil=new Date(now-1000).toISOString();if(variant==='over_budget')option.priceCents=70000;
 db.prepare('INSERT INTO runs(payload) VALUES(?)').run(JSON.stringify(run));
 await assert.rejects(flow.startMonitor({mode:'live',query,policy:defaultWorkflowPolicy,useJev:false,queryOnly:true,deadline:new Date(now+3600000).toISOString()}));assert.equal(flow.state().monitor.enabled,false);assert.equal(calls,0);
 }}finally{db.close();flow.close();rmSync(dir,{recursive:true,force:true});}
});

test('quote recheck rejects conflicting hotel identity even when the rate ID and price match',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'wrong-hotel-')),original=recordedCandidates(),candidate=original.candidates[0],room=candidate.rooms[0];
 const query={...original.query,checkIn:new Date(Date.now()+7*86400000).toISOString().slice(0,10),checkOut:new Date(Date.now()+8*86400000).toISOString().slice(0,10)};
 const unsupported=async():Promise<any>=>{throw new Error('unused');};let calls=0;
 const flow=new LiveWorkflow('one',{flySearch:unsupported,rollingSearch:unsupported,places:unsupported,routes:unsupported,jev:unsupported,rollingDetail:async():Promise<any>=>({hotelId:++calls===1?Number(candidate.hotelId):999,name:calls===1?'Another hotel':candidate.name,rooms:[room],observedAt:new Date().toISOString()})},dir);
 const db=new DatabaseSync(join(dir,'one.sqlite'));db.prepare('INSERT INTO runs(payload) VALUES(?)').run(JSON.stringify({id:'run',mode:'live',query,policy:defaultWorkflowPolicy,candidates:[{candidate}]}));db.close();
 try{for(let i=0;i<2;i++){const result=await flow.recheck({runId:'run',candidateKey:candidate.key,ratePlanId:room.ratePlanId});assert.equal(result.status,'failed');assert.equal(result.after,null);assert.equal(result.deltaCents,null);assert(result.reason.includes('Hotel identity'));}assert.equal(flow.history()[0].candidates[0].candidate.name,candidate.name);}finally{flow.close();rmSync(dir,{recursive:true,force:true});}
});
test('changed raw cancellation or window flags cannot be reported as same-terms price drops',async()=>{
 for(const field of ['cancelable','hasWindow'] as const){
 const dir=mkdtempSync(join(tmpdir(),'quote-flags-')),original=recordedCandidates(),candidate=original.candidates[0];
 const room={...candidate.rooms[0],roomName:'外窗大床房',windowType:'external' as const,hasWindow:true,cancelable:null,cancellationStatus:'unknown' as const,cancelPolicy:'条款未提供',cancelUntil:null};candidate.rooms=[room];
 const run={id:'flags',mode:'live',query:{...original.query,checkIn:'2099-10-09',checkOut:'2099-10-10'},policy:defaultWorkflowPolicy,candidates:[{candidate}]};
 const unused=async():Promise<any>=>{throw Error('Unused');};const after={...room,estimatedStayPrice:room.estimatedStayPrice!-10,[field]:field==='cancelable'?true:null};
 const flow=new LiveWorkflow('case',{flySearch:unused,rollingSearch:unused,places:unused,routes:unused,jev:unused,rollingDetail:async():Promise<any>=>({hotelId:Number(candidate.hotelId),name:candidate.name,observedAt:new Date().toISOString(),rooms:[after]})},dir);
 const db=new DatabaseSync(join(dir,'case.sqlite'));db.prepare('INSERT INTO runs(payload) VALUES(?)').run(JSON.stringify(run));db.close();
 try{const result=await flow.recheck({runId:run.id,candidateKey:candidate.key,ratePlanId:room.ratePlanId});assert.equal(result.status,'terms_changed');assert.equal(result.deltaCents,null);assert.equal(result.after?.[field],after[field]);}finally{flow.close();rmSync(dir,{recursive:true,force:true});}
 }
});
test('price comparison retains the last usable recheck across missing quotes and failures',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'quote-baseline-')),original=recordedCandidates(),candidate=original.candidates[0],room=candidate.rooms[0];
 const run={id:'baseline',mode:'live',query:{...original.query,checkIn:'2099-10-09',checkOut:'2099-10-10'},policy:defaultWorkflowPolicy,candidates:[{candidate}]};let stage=0;
 const unused=async():Promise<any>=>{throw Error('unused');};const flow=new LiveWorkflow('case',{flySearch:unused,rollingSearch:unused,places:unused,routes:unused,jev:unused,rollingDetail:async():Promise<any>=>{stage++;if(stage===3)throw Error('Outage');return {hotelId:Number(candidate.hotelId),name:candidate.name,observedAt:new Date().toISOString(),rooms:stage===2?[]:[{...room,estimatedStayPrice:stage===1?300:290}]};}},dir);
 const db=new DatabaseSync(join(dir,'case.sqlite'));db.prepare('INSERT INTO runs(payload) VALUES(?)').run(JSON.stringify(run));db.close();const request={runId:run.id,candidateKey:candidate.key,ratePlanId:room.ratePlanId};
 try{const valid=await flow.recheck(request);assert.equal((await flow.recheck(request)).status,'not_found');assert.equal((await flow.recheck(request)).status,'failed');const current=await flow.recheck(request);assert.equal(current.status,'price_changed');assert.equal(current.before.estimatedStayPrice,300);assert.equal(current.deltaCents,-1000);assert.deepEqual(current.baseline,{kind:'recheck',recheckId:valid.id,skippedAttempts:2});assert.equal(current.transactionEnabled,false);}finally{flow.close();rmSync(dir,{recursive:true,force:true});}
});

test('stale, future and unzoned detail observations do not establish price changes or quote absence',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'quote-source-time-')),original=recordedCandidates(),candidate=original.candidates[0],room=candidate.rooms[0];
 const run={id:'source-time',mode:'live',query:{...original.query,checkIn:'2099-10-09',checkOut:'2099-10-10'},policy:defaultWorkflowPolicy,candidates:[{candidate}]};
 let observedAt='',empty=false;const unused=async():Promise<any>=>{throw Error('unused');};
 const flow=new LiveWorkflow('case',{flySearch:unused,rollingSearch:unused,places:unused,routes:unused,jev:unused,rollingDetail:async():Promise<any>=>({hotelId:Number(candidate.hotelId),name:candidate.name,observedAt,rooms:empty?[]:[{...room,estimatedStayPrice:1}]})},dir);
 const db=new DatabaseSync(join(dir,'case.sqlite'));db.prepare('INSERT INTO runs(payload) VALUES(?)').run(JSON.stringify(run));db.close();
 try{for(const time of [new Date(Date.now()-16*60000).toISOString(),new Date(Date.now()+60000).toISOString(),'2026-10-09T00:31:32','2026-02-30T00:00:00Z'])for(const missing of [false,true]){observedAt=time;empty=missing;const result=await flow.recheck({runId:run.id,candidateKey:candidate.key,ratePlanId:room.ratePlanId});assert.equal(result.status,'failed');assert.equal(result.deltaCents,null);assert.equal(result.after,null);assert.match(result.reason,/observation time/);assert.equal(result.baseline?.kind,'original');}
 observedAt=new Date().toISOString();empty=false;const recovered=await flow.recheck({runId:run.id,candidateKey:candidate.key,ratePlanId:room.ratePlanId});assert.equal(recovered.status,'price_changed');assert.equal(recovered.baseline?.kind,'original');assert.equal(recovered.baseline?.skippedAttempts,8);
 }finally{flow.close();rmSync(dir,{recursive:true,force:true});}
});
test('invalid merchant amounts cannot produce a successful recheck or price-drop delta',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'invalid-price-')),original=recordedCandidates(),candidate=original.candidates[0],room=candidate.rooms[0];let amount=0;
 const unused=async():Promise<any>=>{throw Error('unused');},flow=new LiveWorkflow('case',{flySearch:unused,rollingSearch:unused,places:unused,routes:unused,jev:unused,rollingDetail:async():Promise<any>=>({hotelId:Number(candidate.hotelId),name:candidate.name,observedAt:new Date().toISOString(),rooms:[{...room,estimatedStayPrice:amount}]})},dir);
 const db=new DatabaseSync(join(dir,'case.sqlite'));db.prepare('INSERT INTO runs(payload) VALUES(?)').run(JSON.stringify({id:'amounts',mode:'live',query:{...original.query,checkIn:'2099-10-09',checkOut:'2099-10-10'},policy:defaultWorkflowPolicy,candidates:[{candidate}]}));db.close();
 try{for(const price of [-10,NaN,Infinity,Number.MAX_VALUE]){amount=price;const result=await flow.recheck({runId:'amounts',candidateKey:candidate.key,ratePlanId:room.ratePlanId});assert.equal(result.status,'failed');assert.equal(result.deltaCents,null);assert.equal(result.transactionEnabled,false);}}finally{flow.close();rmSync(dir,{recursive:true,force:true});}
});
test('legacy successful-status rows with invalid amounts do not poison the last usable comparison baseline',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'legacy-money-')),original=recordedCandidates(),candidate=original.candidates[0],room=candidate.rooms[0];const unused=async():Promise<any>=>{throw Error('unused');};
 const flow=new LiveWorkflow('case',{flySearch:unused,rollingSearch:unused,places:unused,routes:unused,jev:unused,rollingDetail:async():Promise<any>=>({hotelId:Number(candidate.hotelId),name:candidate.name,observedAt:new Date().toISOString(),rooms:[{...room,estimatedStayPrice:290}]})},dir);
 const run={id:'legacy',mode:'live',query:{...original.query,checkIn:'2099-10-09',checkOut:'2099-10-10'},policy:defaultWorkflowPolicy,candidates:[{candidate}]},db=new DatabaseSync(join(dir,'case.sqlite'));db.prepare('INSERT INTO runs(payload) VALUES(?)').run(JSON.stringify(run));
 const common={runId:run.id,candidateKey:candidate.key,ratePlanId:room.ratePlanId,status:'unchanged'};
 db.prepare('INSERT INTO rechecks(payload) VALUES(?)').run(JSON.stringify({...common,id:'last-valid',after:{...room,estimatedStayPrice:300}}));
 for(const price of [-10,'300',Number.MAX_VALUE])db.prepare('INSERT INTO rechecks(payload) VALUES(?)').run(JSON.stringify({...common,id:'legacy-'+String(price),after:{...room,estimatedStayPrice:price}}));db.close();
 try{const result=await flow.recheck({runId:run.id,candidateKey:candidate.key,ratePlanId:room.ratePlanId});assert.equal(result.status,'price_changed');assert.equal(result.before.estimatedStayPrice,300);assert.equal(result.deltaCents,-1000);assert.deepEqual(result.baseline,{kind:'recheck',recheckId:'last-valid',skippedAttempts:3});assert.equal(flow.recheckHistory({runId:run.id}).length,5);}finally{flow.close();rmSync(dir,{recursive:true,force:true});}
});
