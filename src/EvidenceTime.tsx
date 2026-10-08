import {zonedTimestamp} from '../shared/zoned-time';
import {pick} from './i18n';
/** Render an observed instant; preserve ambiguous source text without assigning a timezone. */
export function EvidenceTime({value}:{value:string|null|undefined}){
 const instant=zonedTimestamp(value);
 if(instant===null)return <span>{pick('时间无法核验','Time unverified')}{value&&<> · {pick('原始值','Source value')}: {value}</>}</span>;
 return <time dateTime={value!}>{new Intl.DateTimeFormat(pick('zh-CN','en-GB'),{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(instant)} UTC+8</time>;
}
