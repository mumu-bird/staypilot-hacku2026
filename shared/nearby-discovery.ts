import {zonedTimestamp} from './zoned-time.ts';
import type {WorkflowResult} from './live-workflow.ts';
const normalize=(value:string)=>value.replace(/[\s（）()·|｜]/g,'').toLowerCase();
export const nearbyRetryDelayMs=15*60_000;
// Existing candidates use targeted refresh; unsuccessful discovery attempts only cool down.
export function excludedNearbyNames(history:WorkflowResult[],now:number):Set<string>{
 const names=new Set(history.flatMap(run=>run.candidates.map(item=>normalize(item.candidate.name))));
 for(const run of history){
  const at=zonedTimestamp(run.completedAt);
  if(at===null||at>now||now-at>=nearbyRetryDelayMs)continue;
  for(const name of run.nearbyDiscovery?.attemptedNames??[])names.add(normalize(name));
 }
 return names;
}
export function nearbyRetryAt(history:WorkflowResult[],leadNames:string[],now:number):string|null{
 const retained=new Set(history.flatMap(run=>run.candidates.map(item=>normalize(item.candidate.name))));
 const leads=new Set(leadNames.map(normalize)),deadlines=new Map<string,number>();
 for(const run of history){
  const at=zonedTimestamp(run.completedAt);
  if(at===null||at>now||now-at>=nearbyRetryDelayMs)continue;
  for(const raw of run.nearbyDiscovery?.attemptedNames??[]){
   const name=normalize(raw);if(retained.has(name)||!leads.has(name))continue;
   deadlines.set(name,Math.max(deadlines.get(name)??0,at+nearbyRetryDelayMs));
  }
 }
 return deadlines.size?new Date(Math.min(...deadlines.values())).toISOString():null;
}
