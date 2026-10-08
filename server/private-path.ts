const privateRoots=new Set(['data','.cache','.git','server','scripts','tests','docs']);
/** Public page requests must not read application internals, including in development mode. */
export function isPrivatePagePath(path:string):boolean{
 let decoded:string;try{decoded=decodeURIComponent(path);}catch{return true;}
 const segments=decoded.replace(/\\/g,'/').split('/').filter(Boolean);
 if(!segments.length)return false;
 const first=segments[0].toLowerCase();
 if(first.startsWith('.')||privateRoots.has(first))return true;
 if(first==='@fs')return segments.some(raw=>{const segment=raw.toLowerCase();return privateRoots.has(segment)||segment.startsWith('.env')||segment.endsWith('.sqlite')||segment.endsWith('.sqlite-wal')||segment.endsWith('.sqlite-shm');});
 return false;
}
