import type {WorkflowPolicy} from '../shared/live-workflow';
import {pick} from './i18n';

export function PreferenceBounds({policy,onChange}:{policy:WorkflowPolicy;onChange:(policy:WorkflowPolicy)=>void}) {
 const update=(patch:Partial<WorkflowPolicy>)=>onChange({...policy,...patch});
 return <div className="lw-form">
  <h3>{pick('理想条件与可接受范围','Ideal preferences and acceptable limits')}</h3>
  <p>{pick('未勾选的放宽项需要重新确认。评分按5分制比较，保留平台原始评分；翻新年份不能证明开业年份。','Unchecked relaxations require confirmation. Ratings are compared on a 5-point scale while retaining original platform ratings. Renovation dates do not establish opening dates.')}</p>
  <label>{pick('理想评分（5分制，可留空）','Preferred rating (out of 5; optional)')}<input type="number" min="0" max="5" step="0.1" value={policy.preferredRating??''} onChange={e=>update({preferredRating:e.target.value===''?null:Number(e.target.value)})}/></label>
  <label>{pick('评分硬底线（5分制，可留空）','Hard minimum rating (out of 5; optional)')}<input type="number" min="0" max="5" step="0.1" value={policy.minimumRating??''} onChange={e=>update({minimumRating:e.target.value===''?null:Number(e.target.value)})}/></label>
  <label>{pick('理想开业年份不早于（可留空）','Preferred opening year, no earlier than (optional)')}<input type="number" min="1900" max="2100" value={policy.preferredYear??''} onChange={e=>update({preferredYear:e.target.value===''?null:Number(e.target.value)})}/></label>
  <div className="lw-checks">
   <label><input type="checkbox" checked={policy.allowLowerRating===true} onChange={e=>update({allowLowerRating:e.target.checked})}/>{pick('允许低于理想评分，但仍须满足评分硬底线','Allow a lower preferred rating, preserving the hard minimum')}</label>
   <label><input type="checkbox" checked={policy.allowOlder===true} onChange={e=>update({allowOlder:e.target.checked})}/>{pick('允许更早开业的酒店','Allow hotels opened before the preferred year')}</label>
   <label><input type="checkbox" disabled={policy.window!=='preferred'} checked={policy.allowWindowRelaxation===true} onChange={e=>update({allowWindowRelaxation:e.target.checked})}/>{pick('有窗仅为偏好时，允许接受已知其他窗型','When a window is preferred, allow other verified window types')}</label>
  </div>
  <h3>{pick('必须具备的设施','Required facilities')}</h3>
  <p>{pick('例如电梯、停车或无障碍设施。每项都需要酒店证据；缺少证据不表示满足。最多10项，留空项需填写或删除。','For example: an elevator, parking or accessible facilities. Each requirement needs hotel evidence; missing evidence does not establish availability. Up to 10 items; complete or remove empty entries.')}</p>
  {(policy.requiredAmenities??[]).map((amenity,index)=><div key={index} className="lw-actions"><label>{pick('必须设施','Required facility')} {index+1}<input maxLength={80} value={amenity} onChange={e=>update({requiredAmenities:(policy.requiredAmenities??[]).map((value,i)=>i===index?e.target.value:value)})}/></label><button type="button" className="secondary" onClick={()=>update({requiredAmenities:(policy.requiredAmenities??[]).filter((_,i)=>i!==index)})}>{pick('删除此项','Remove item')} {index+1}</button></div>)}
  <button type="button" className="secondary" disabled={(policy.requiredAmenities?.length??0)>=10} onClick={()=>update({requiredAmenities:[...(policy.requiredAmenities??[]),'']})}>{pick('添加必须设施','Add required facility')}</button>
  <h3>{pick('其他体验的重要程度','Other experience priorities')}</h3>
  <p>{pick('0表示不纳入差评风险排序，5表示最重要；不可接受项仍独立排除。','0 excludes an issue from weighted review-risk ranking; 5 is most important. Unacceptable issues are excluded independently.')}</p>
  {(['smell','maintenance','service','space','security'] as const).map(issue=><label key={issue}>{({smell:pick('气味','Smell'),maintenance:pick('设施维护','Maintenance'),service:pick('服务','Service'),space:pick('空间','Space'),security:pick('安全','Security')})[issue]} {pick('重要度（0—5）','importance (0–5)')}<input type="number" min="0" max="5" value={policy.weights[issue]} onChange={e=>update({weights:{...policy.weights,[issue]:Number(e.target.value)}})}/></label>)}
  <h3>{pick('不可接受的问题','Unacceptable issues')}</h3>
  <p>{pick('这些底线不会因为更低价格或更短通勤被抵消。评论缺失仍需补查。','Lower prices or shorter commutes cannot override these limits. Missing reviews still require verification.')}</p>
  <div className="lw-checks">{(['maintenance','service','space','security'] as const).map(issue=><label key={issue}><input type="checkbox" checked={policy.unacceptable.includes(issue)} onChange={e=>update({unacceptable:e.target.checked?[...policy.unacceptable.filter(x=>x!==issue),issue]:policy.unacceptable.filter(x=>x!==issue)})}/>{({maintenance:pick('设施维护问题','Maintenance problems'),service:pick('服务问题','Service problems'),space:pick('空间问题','Space problems'),security:pick('安全问题','Security problems')})[issue]}</label>)}</div>
 </div>;
}
