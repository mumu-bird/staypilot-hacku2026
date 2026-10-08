import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readJsonBody,RequestInputError} from '../server/http-input.ts';
async function* chunks(values:(string|Uint8Array)[]){yield* values;}
test('JSON input byte limit applies to UTF-8 and split chunks rather than character count',async()=>{
 const bytes=Buffer.from(JSON.stringify({name:'雍和宫'}));
 assert.deepEqual(await readJsonBody(chunks([bytes.subarray(0,10),bytes.subarray(10)])),{name:'雍和宫'});
 await assert.rejects(readJsonBody(chunks(['"'+ '京'.repeat(30)+'"']),40),error=>error instanceof RequestInputError&&error.status===413);
 await assert.rejects(readJsonBody(chunks(['1234','5678']),7),error=>error instanceof RequestInputError&&error.status===413);
});
test('empty input remains compatible while invalid JSON receives an actionable error',async()=>{
 assert.deepEqual(await readJsonBody(chunks([])),{});
 await assert.rejects(readJsonBody(chunks(['{broken'])),error=>error instanceof RequestInputError&&error.status===400&&!error.message.includes('broken'));
});
