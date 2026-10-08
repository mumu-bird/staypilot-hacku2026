import {EvidenceTime} from './EvidenceTime';
import type {WorkflowCandidate} from '../shared/live-workflow';
import {pick} from './i18n';
export function RoomQueryEvidence({candidate}:{candidate:WorkflowCandidate}){
 const q=candidate.roomQuery;
 if(!q)return <p className="lw-hint">{pick('没有房型查询记录；无法区分未查询与旧记录缺少该信息。','No room-query record is available; this may be an unqueried hotel or a legacy record without query metadata.')}</p>;
 const status={returned:pick('已返回房型','Rooms returned'),empty:pick('本次筛选未返回房型','No rooms returned for this filter'),failed:pick('房型请求失败','Room request failed')}[q.status];
 return <p className="lw-hint">{status} · {q.count??'—'} · {<EvidenceTime value={q.observedAt}/>} · {q.filter.cancelPolicy==='CANCELABLE'?pick('筛选：可取消','Filter: cancelable'):q.filter.cancelPolicy==='NON_CANCELABLE'?pick('筛选：不可取消','Filter: noncancelable'):pick('未按取消政策筛选','No cancellation filter')}{q.filter.mealType&&` · ${q.filter.mealType}`}{q.filterDiagnostics&&<><br/>{pick('平台本次响应房型数','Room plans in this platform response')}: {q.filterDiagnostics.received} · {pick('本地规则排除','Excluded by local filters')}: {q.filterDiagnostics.excluded}{q.filterDiagnostics.unknownCancellationExcluded>0&&<> · {pick('其中取消条款无法核验','Including plans with unverified cancellation terms')}: {q.filterDiagnostics.unknownCancellationExcluded}</>}</>}<br/>{pick('筛选标签不等于已确认免费取消；空结果不代表售罄。','A filter label does not verify free cancellation. Empty results do not prove sold-out inventory.')}</p>;
}
