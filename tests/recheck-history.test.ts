import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {LiveWorkflow} from '../server/live-workflow.ts';
test('targeted recheck history filters trip hotel and plan, is bounded, and cannot cross sessions',()=>{
 const dir=mkdtempSync(join(tmpdir(),'recheck-history-'));const unused=async():Promise<any>=>{throw Error('No external call');},deps={flySearch:unused,rollingSearch:unused,rollingDetail:unused,places:unused,routes:unused,jev:unused};const a=new LiveWorkflow('a',deps,dir),b=new LiveWorkflow('b',deps,dir),db=new DatabaseSync(join(dir,'a.sqlite'));
 try{
  db.prepare('INSERT INTO runs(payload) VALUES(?)').run(JSON.stringify({id:'trip'}));db.prepare('INSERT INTO runs(payload) VALUES(?)').run(JSON.stringify({id:'other-trip'}));
  for(let i=0;i<60;i++)db.prepare('INSERT INTO rechecks(payload) VALUES(?)').run(JSON.stringify({id:String(i),runId:'trip',candidateKey:'rollinggo:1',ratePlanId:'room',status:'failed'}));
  for(const item of [{runId:'other-trip',candidateKey:'rollinggo:1',ratePlanId:'room'},{runId:'trip',candidateKey:'rollinggo:2',ratePlanId:'room'},{runId:'trip',candidateKey:'rollinggo:1',ratePlanId:'other-room'}])db.prepare('INSERT INTO rechecks(payload) VALUES(?)').run(JSON.stringify(item));
  const rows=a.recheckHistory({runId:'trip',candidateKey:'rollinggo:1',ratePlanId:'room'});assert.equal(rows.length,50);assert.equal(rows[0].id,'59');assert.equal(rows.at(-1)!.id,'10');assert.deepEqual(b.recheckHistory({runId:'trip'}),[]);assert.deepEqual(a.recheckHistory({runId:'missing'}),[]);assert.throws(()=>a.recheckHistory({runId:"' OR 1=1 --"}));assert.throws(()=>a.recheckHistory({runId:'trip',ratePlanId:'room'}));
 }finally{db.close();a.close();b.close();rmSync(dir,{recursive:true,force:true});}
});
