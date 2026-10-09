import test from 'node:test';import assert from 'node:assert/strict';
import {AccessGuard,accessLifetimeMs,accessTokenFromCookie} from '../server/access-guard.ts';
const password='controlled-test-password',sid='a'.repeat(32);
test('optional pilot gate is open only when not configured and grants are bound to a session and finite lifetime',()=>{
 assert.equal(new AccessGuard(undefined).authenticated(undefined,undefined),true);assert.throws(()=>new AccessGuard('short'));
 const guard=new AccessGuard(password);assert.equal(guard.authenticated(undefined,sid),false);const result=guard.login(password,sid,'local',1000);assert.equal(result.status,'ok');if(result.status!=='ok')return;
 assert.equal(guard.authenticated(result.token,sid,1000),true);assert.equal(guard.tokenForSession(sid,1000),result.token);assert.equal(guard.sessionAuthenticated(sid,1000),true);assert.equal(guard.sessionAuthenticated(sid,1000+accessLifetimeMs),false);assert.equal(guard.authenticated(result.token,'b'.repeat(32),1000),false);assert.equal(guard.authenticated(result.token,sid,1000+accessLifetimeMs),false);assert.deepEqual(guard.expireGrants(1000+accessLifetimeMs),[sid]);assert.deepEqual(guard.expireGrants(1000+accessLifetimeMs),[]);
});
test('attempt throttling, expiry and logout reject further access without persisting passwords',()=>{
 const guard=new AccessGuard(password);for(let i=0;i<5;i++)assert.equal(guard.login('wrong',sid,'local',1000).status,'invalid');assert.equal(guard.login(password,sid,'local',1001).status,'limited');
 const result=guard.login(password,sid,'local',301000);assert.equal(result.status,'ok');if(result.status!=='ok')return;guard.logout(result.token);assert.equal(guard.authenticated(result.token,sid,301001),false);
});
test('expiry of an older grant does not revoke a renewed login to the same session; exact auth-cookie boundaries are required',()=>{
 const guard=new AccessGuard(password);const first=guard.login(password,sid,'local',1000),second=guard.login(password,sid,'local',2000);assert.equal(first.status,'ok');assert.equal(second.status,'ok');if(first.status==='ok')assert.equal(guard.authenticated(first.token,sid,2500),false);assert.deepEqual(guard.expireGrants(1000+accessLifetimeMs),[]);assert.deepEqual(guard.expireGrants(2000+accessLifetimeMs),[sid]);
 const token='a'.repeat(64);assert.equal(accessTokenFromCookie('staypilot_access='+token),token);for(const value of ['xstaypilot_access='+token,'staypilot_access='+token+'x','staypilot_access='+token+'; staypilot_access='+token])assert.equal(accessTokenFromCookie(value),undefined);
});
