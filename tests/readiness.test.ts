import test from 'node:test';
import assert from 'node:assert/strict';
import {readiness} from '../server/readiness.ts';
test('production without built frontend is not ready even while the process is alive',()=>{
 assert.equal(readiness({production:true,frontendExists:false,shuttingDown:false}).status,'unavailable');
 assert.equal(readiness({production:true,frontendExists:true,shuttingDown:false}).status,'ready');
});
test('development uses its middleware and shutdown always withdraws readiness without enabling transactions',()=>{
 assert.equal(readiness({production:false,frontendExists:false,shuttingDown:false}).status,'ready');
 for(const production of [true,false]){
 const result=readiness({production,frontendExists:true,shuttingDown:true});
 assert.equal(result.status,'unavailable');assert.equal(result.realTransactionEnabled,false);
 }
});
