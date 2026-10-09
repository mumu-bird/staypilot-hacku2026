import {spawn} from 'node:child_process';import {mkdtempSync,rmSync,symlinkSync} from 'node:fs';import {tmpdir} from 'node:os';import {resolve,join} from 'node:path';import assert from 'node:assert/strict';
const dir=mkdtempSync(join(tmpdir(),'staypilot-access-')),password='controlled-test-access-password',origin='http://127.0.0.1:4175';
symlinkSync(resolve('dist'),join(dir,'dist'));
const child=spawn(process.execPath,['--experimental-strip-types',resolve('server/index.ts')],{cwd:dir,env:{PATH:process.env.PATH,NODE_ENV:'production',PORT:'4175',HOST:'127.0.0.1',STAYPILOT_ACCESS_PASSWORD:password},stdio:'ignore'});
try{
 let ready=false;for(let i=0;i<60;i++){if(child.exitCode!==null)throw Error('Isolated access service exited');try{const response=await fetch(origin+'/api/ready');if(response.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}assert(ready);
 assert.equal((await fetch(origin+'/api/state')).status,401);assert.equal((await fetch(origin+'/api/live/integrations')).status,401);assert.equal((await fetch(origin+'/api/live/workflow/run',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
 const login=await fetch(origin+'/api/access/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({password})});assert.equal(login.status,200);const cookies=login.headers.getSetCookie();assert.equal(cookies.length,2);assert(cookies.every(c=>c.includes('HttpOnly')));let cookie=cookies.map(c=>c.split(';')[0]).join('; ');
 assert.equal((await fetch(origin+'/api/state',{headers:{Cookie:cookie}})).status,200);
 const previousCookie=cookie;const renewed=await fetch(origin+'/api/access/login',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json',Origin:origin},body:JSON.stringify({password})});assert.equal(renewed.status,200);cookie=renewed.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
 assert.equal((await fetch(origin+'/api/state',{headers:{Cookie:previousCookie}})).status,401);assert.equal((await fetch(origin+'/api/state',{headers:{Cookie:cookie}})).status,200);
 const authCookie=cookie.split('; ').find(c=>c.startsWith('staypilot_access='));assert(authCookie);assert.equal((await fetch(origin+'/api/state',{headers:{Cookie:'staypilot_session='+ 'b'.repeat(32)+'; '+authCookie}})).status,401);
 assert.equal((await fetch(origin+'/evidence/unknown/image.png')).status,401);

 if(process.env.TEST_ACCESS_BROWSER==='1'){
 const post=async(path:string,input:unknown)=>{const response=await fetch(origin+path,{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(input)});assert(response.ok);return response.json();};
 await post('/api/mandate',{patch:{},confirm:true});await post('/api/agent/run',{});
 let complete=false;for(let i=0;i<360;i++){const response=await fetch(origin+'/api/state',{headers:{Cookie:cookie}});assert(response.ok);const state=await response.json();if(!state.agent.running){assert.equal(state.agent.error,null);assert.equal(state.orders.length,1);complete=true;break;}await new Promise(r=>setTimeout(r,500));}assert(complete);
 }

 assert.equal((await fetch(origin+'/api/access/logout',{method:'POST',headers:{Cookie:cookie,Origin:origin},body:'{}'})).status,200);assert.equal((await fetch(origin+'/api/state',{headers:{Cookie:cookie}})).status,401);
 assert.equal((await fetch(origin+'/api/access/login',{method:'POST',headers:{Origin:'https://untrusted.example','Content-Type':'application/json'},body:JSON.stringify({password})})).status,403);
 console.log('Isolated HTTP gate passed: anonymous queries blocked, login grants access, logout revokes, foreign origin rejected. No provider query or real transaction. Optional browser flow uses simulation and test funds.');
}finally{child.kill('SIGTERM');await new Promise<void>(r=>{if(child.exitCode!==null)r();else child.once('exit',()=>r());});rmSync(dir,{recursive:true,force:true});}
