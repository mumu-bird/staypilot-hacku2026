/** Exact cookie boundaries prevent prefix matches and ambiguous duplicate session IDs. */
export function sessionIdFromCookie(header:string|undefined):string|undefined{
 const matches=(header??'').split(';').map(part=>part.trim()).filter(part=>part.startsWith('staypilot_session='));
 if(matches.length!==1)return undefined;
 const value=matches[0].slice('staypilot_session='.length);
 return /^[a-f0-9]{32}$/.test(value)?value:undefined;
}
/** Only explicit HTTPS deployment configuration controls Secure, never forwarded headers. */
export function sessionCookie(id:string,publicOrigin:string|undefined):string{
 if(!/^[a-f0-9]{32}$/.test(id))throw new Error('Invalid session ID');
 let secure=false;
 if(publicOrigin?.trim()){
 const url=new URL(publicOrigin);
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('PUBLIC_ORIGIN must be an HTTP(S) origin');
 secure=url.protocol==='https:';
 }
 return `staypilot_session=${id}; Path=/; HttpOnly; SameSite=Lax${secure?'; Secure':''}`;
}
