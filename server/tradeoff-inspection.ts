import type {WorkflowCandidate,WorkflowPolicy} from '../shared/live-workflow.ts';
import type {TradeoffAssessment} from '../shared/tradeoffs.ts';
type Evaluation=(candidates:WorkflowCandidate[],policy:WorkflowPolicy,asOf:string,adults:number)=>Promise<TradeoffAssessment>;
export async function inspectTradeoffs(candidates:WorkflowCandidate[],policy:WorkflowPolicy,asOf:string,adults:number,evaluate:Evaluation,inspect:(candidate:WorkflowCandidate,action:'rooms'|'commute')=>Promise<void>){
 let assessment=await evaluate(candidates,policy,asOf,adults);
 const attempts=new Set<string>(),history:TradeoffAssessment['inspectionLog']=[];
 for(let i=0;i<3;i++){
  const proposal=assessment.inspectionLog.at(-1),action=assessment.nextAction?.choice;
  if(!proposal||!action||action==='none')break;
  const option=assessment.options.find(o=>o.id===proposal.optionId),candidate=candidates.find(c=>c.key===option?.candidateKey);
  if(!candidate)break;
  const key=candidate.key+'|'+action;
  if(attempts.has(key)){history.push({...proposal,status:'handoff',detail:'Repeated inspection avoided; remaining gap needs a different source or user review.'});break;}
  if(!['rooms','commute'].includes(action)||(action==='rooms'&&!candidate.key.startsWith('rollinggo:'))){history.push({...proposal,status:'handoff',detail:'No automatic tool for this evidence. Open the merchant source to verify reviews or final charges.'});break;}
  attempts.add(key);
  try{await inspect(candidate,action as 'rooms'|'commute');history.push({...proposal,status:'completed',at:new Date().toISOString(),detail:'Read-only source query completed; missing evidence remains missing.'});}
  catch{history.push({...proposal,status:'failed',at:new Date().toISOString(),detail:'Source query failed; previous observations retained with their original timestamps.'});break;}
  asOf=new Date().toISOString();assessment=await evaluate(candidates,policy,asOf,adults);
 }
 const last=history.at(-1),pending=assessment.inspectionLog.filter(entry=>!last||entry.optionId!==last.optionId||entry.action!==last.action);
 assessment.inspectionLog=[...history,...pending];return {assessment,asOf};
}
