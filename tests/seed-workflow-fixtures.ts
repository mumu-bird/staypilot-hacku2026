import {randomBytes} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {LiveWorkflow} from '../server/live-workflow.ts';
/** Test-only hydration of saved source observations. Does not renew times or authorize tools. */
export function seedSavedWorkflowFixtures(){
 const records=new Map<string,any>(),rechecks:any[]=[];
 for(const name of readdirSync('docs/cases').filter(n=>n.endsWith('.json'))){const value=JSON.parse(readFileSync(join('docs/cases',name),'utf8'));if(value?.id&&value.query&&value.policy&&Array.isArray(value.candidates)&&Array.isArray(value.trace))records.set(value.id,value);if(Array.isArray(value?.results))for(const r of value.results)if(r?.id&&r.runId&&r.candidateKey&&r.ratePlanId&&r.checkedAt&&r.before)rechecks.push(r);}
 const noTools=async():Promise<any>=>{throw Error('Saved-fixture session must not invoke providers');};
 const directory=resolve('data/workflows');let seeded=0;
 for(const record of records.values()){
 const session=randomBytes(16).toString('hex'),flow=new LiveWorkflow(session,{requireQueryConsent:true,flySearch:noTools,rollingSearch:noTools,rollingDetail:noTools,places:noTools,routes:noTools,jev:noTools},directory);flow.close();
 const db=new DatabaseSync(join(directory,session+'.sqlite'));
 try{
 const lineage:any[]=[];let item=record;const seen=new Set<string>();while(item&&!seen.has(item.id)){seen.add(item.id);lineage.unshift(item);item=item.parentRunId?records.get(item.parentRunId):null;}
 for(const run of lineage)db.prepare('INSERT INTO runs(payload) VALUES(?)').run(JSON.stringify(run));
 const unique=new Map(rechecks.filter(r=>r.runId===record.id).map(r=>[r.id,r]));for(const check of [...unique.values()].sort((a,b)=>Date.parse(a.checkedAt)-Date.parse(b.checkedAt)))db.prepare('INSERT INTO rechecks(payload) VALUES(?)').run(JSON.stringify(check));
 seeded++;
 }finally{db.close();}
 }
 return seeded;
}
