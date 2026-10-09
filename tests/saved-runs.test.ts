import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {savedRunsResponse} from '../shared/saved-runs.ts';
const actual=()=>JSON.parse(readFileSync('docs/cases/live-post-recovery-regression-20261009.json','utf8'));
test('saved history binds a requested original assessment without rewriting actual observations',()=>{
 const run=actual(),rows=[run],before=JSON.stringify(rows);assert.equal(savedRunsResponse(rows,run.id),rows);assert.equal(JSON.stringify(rows),before);assert.deepEqual(savedRunsResponse([],run.id),[]);assert.throws(()=>savedRunsResponse(rows,'foreign-run'));
});
test('malformed history cannot crash the display or masquerade as the requested original',()=>{
 const run=actual();for(const response of [{},null,[{...run,query:null}],[{...run,policy:{budgetCents:-1}}],[{...run,candidates:[{candidate:{name:'wrong'},gaps:[]}]}],Array(31).fill(run)])assert.throws(()=>savedRunsResponse(response));
 const legacy=actual();delete legacy.tradeoffs;delete legacy.jev;delete legacy.kind;assert.equal(savedRunsResponse([legacy])[0],legacy);
});
