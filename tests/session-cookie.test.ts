import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionCookie,sessionIdFromCookie} from '../server/session-cookie.ts';
const id='a'.repeat(32);
test('session cookie accepts only the exact name and complete token, rejecting duplicate or prefixed cookies',()=>{
 assert.equal(sessionIdFromCookie(`other=x; staypilot_session=${id}; preference=en`),id);
 for(const header of [undefined,`xstaypilot_session=${id}`,`staypilot_session=${id}extra`,`staypilot_session=${id}; staypilot_session=${id}`,`staypilot_session=${id.slice(1)}`,`staypilot_session=${id.toUpperCase()}`])assert.equal(sessionIdFromCookie(header),undefined);
});
test('HTTPS deployment sets Secure while local HTTP remains usable and unsafe origins are rejected',()=>{
 assert.match(sessionCookie(id,'https://staypilot.example'),/; Secure$/);
 assert.match(sessionCookie(id,undefined),/HttpOnly; SameSite=Lax$/);
 assert(!sessionCookie(id,'http://localhost:4173').includes('Secure'));
 for(const origin of ['not-a-url','https://name:password@example.com','https://example.com/path','https://example.com?q=x','file:///tmp'])assert.throws(()=>sessionCookie(id,origin));
 assert.throws(()=>sessionCookie('invalid',undefined));
});
