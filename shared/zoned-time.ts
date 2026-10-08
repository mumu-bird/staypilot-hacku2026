/** An explicit instant; ambiguous local dates and normalized invalid calendar values are not evidence. */
export function zonedTimestamp(value:string|null|undefined):number|null{
 if(typeof value!=='string')return null;
 const match=/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
 if(!match)return null;
 const instant=Date.parse(value);if(!Number.isFinite(instant))return null;
 const offset=match[6]==='Z'?0:(match[7]==='+'?1:-1)*(Number(match[8])*60+Number(match[9]));
 const expected=`${match[1]}T${match[2]}:${match[3]}:${match[4]??'00'}.${(match[5]??'').padEnd(3,'0')}`;
 return new Date(instant+offset*60000).toISOString().slice(0,-1)===expected?instant:null;
}
export function inspectionObservationCurrent(value:string|null|undefined,now:number):boolean{
 const instant=zonedTimestamp(value);if(instant===null||!Number.isFinite(now))return false;
 const age=now-instant;return age>=0&&age<=15*60000;
}
