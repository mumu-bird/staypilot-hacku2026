import {randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
export const accessLifetimeMs=8*60*60*1000;
export function accessTokenFromCookie(header:string|undefined){
 const matches=(header??'').split(';').map(p=>p.trim()).filter(p=>p.startsWith('staypilot_access='));
 if(matches.length!==1)return undefined;const value=matches[0].slice('staypilot_access='.length);return /^[a-f0-9]{64}$/.test(value)?value:undefined;
}
/** Optional single-owner pilot gate, not a multi-user account or transaction authorization system. */
export class AccessGuard{
 private salt=randomBytes(32);private hash:Buffer|null=null;
 private grants=new Map<string,{sid:string;expires:number}>();private attempts=new Map<string,{count:number;until:number}>();
 constructor(password:string|undefined){if(password){if(password.length<12||password.length>1024)throw Error('STAYPILOT_ACCESS_PASSWORD must contain 12 to 1024 characters');this.hash=scryptSync(password,this.salt,32);}}
 get required(){return this.hash!==null;}
 authenticated(token:string|undefined,sid:string|undefined,now=Date.now()){
 if(!this.required)return true;if(!token||!sid)return false;const grant=this.grants.get(token);if(!grant)return false;
 if(grant.expires<=now)return false;return grant.sid===sid;
 }
 sessionAuthenticated(sid:string,now=Date.now()){return !this.required||[...this.grants.values()].some(grant=>grant.sid===sid&&grant.expires>now);}
 tokenForSession(sid:string,now=Date.now()){return [...this.grants.entries()].find(([,grant])=>grant.sid===sid&&grant.expires>now)?.[0];}
 login(password:unknown,sid:string,address:string,now=Date.now()):{status:'ok';token:string}|{status:'invalid'|'limited'}{
 if(!this.hash)return {status:'invalid'};
 for(const [key,value] of this.attempts)if(value.until<=now)this.attempts.delete(key);

 const attempt=this.attempts.get(address);if(attempt&&attempt.count>=5)return {status:'limited'};
 if(!/^[a-f0-9]{32}$/.test(sid))return {status:'invalid'};
 if(typeof password!=='string'||password.length>1024||!timingSafeEqual(scryptSync(password,this.salt,32),this.hash)){
 if(this.attempts.size>=1000&&!attempt)return {status:'limited'};
 this.attempts.set(address,{count:(attempt?.count??0)+1,until:attempt?.until??now+5*60000});return {status:'invalid'};
 }
 for(const [token,grant] of this.grants)if(grant.sid===sid)this.grants.delete(token);
 if(this.grants.size>=1000)return {status:'limited'};
 this.attempts.delete(address);const token=randomBytes(32).toString('hex');this.grants.set(token,{sid,expires:now+accessLifetimeMs});return {status:'ok',token};
 }
 expireGrants(now=Date.now()){const expired=new Set<string>();for(const [token,grant] of this.grants)if(grant.expires<=now){expired.add(grant.sid);this.grants.delete(token);}return [...expired].filter(sid=>![...this.grants.values()].some(grant=>grant.sid===sid));}
 logout(token:string|undefined){if(token)this.grants.delete(token);}
}
