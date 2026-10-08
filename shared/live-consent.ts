/** Stable identity for read-only consent and observed trip conditions. */
export function liveConditionsKey(query:unknown,policy:unknown):string {
 const stable=(value:unknown):unknown=>Array.isArray(value)?value.map(stable):value!==null&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,stable(item)])):value;
 return JSON.stringify(stable({query,policy}));
}
