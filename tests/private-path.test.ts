import test from 'node:test';import assert from 'node:assert/strict';import {isPrivatePagePath} from '../server/private-path.ts';
test('page routes reject private data and encoded development file requests',()=>{
 for(const path of ['/.env','/DATA/session.sqlite','/SERVER/index.ts','/.env.production','/.cache/reviews.json','/data/session.sqlite','/server/index.ts','/docs/cases/private.json','/%2ecache/reviews.json','/data%2fsession.sqlite','/@fs/Users/project/data/session.sqlite','/@fs/Users/project/.env','/@fs/Users/project/.cache/reviews.json','/%invalid'])assert.equal(isPrivatePagePath(path),true,path);
});
test('public app, API, session-bound evidence and development frontend imports remain routable',()=>{
 for(const path of ['/','/live/workflow','/api/live/workflow/state','/evidence/abc/page.png','/assets/main.js','/cases/report.html','/src/main.tsx','/shared/live-workflow.ts','/node_modules/.vite/deps/react.js','/@vite/client'])assert.equal(isPrivatePagePath(path),false,path);
});
