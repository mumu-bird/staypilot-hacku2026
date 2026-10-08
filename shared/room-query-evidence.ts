import type {RollinggoDetail} from './rollinggo';
import type {WorkflowCandidate} from './live-workflow';
export function roomQueryEvidence(detail:RollinggoDetail):NonNullable<WorkflowCandidate['roomQuery']>{
 return {status:detail.rooms.length?'returned':'empty',observedAt:detail.observedAt,filter:{...detail.filter},count:detail.rooms.length,...(detail.filterDiagnostics?{filterDiagnostics:{...detail.filterDiagnostics}}:{})};
}
