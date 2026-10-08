import {test} from 'node:test';
import assert from 'node:assert/strict';
import {straightDistanceMeters} from '../shared/distance.ts';
test('straight distance is symmetric, bounded and rejects invalid locations',()=>{const a='116.404237,39.889395',b='116.417321,39.947242';const meters=straightDistanceMeters(a,b)!;assert(meters>6000&&meters<7000);assert.equal(meters,straightDistanceMeters(b,a));assert.equal(straightDistanceMeters(a,a),0);assert.equal(straightDistanceMeters('999,20',b),null);assert.equal(straightDistanceMeters('unknown',b),null);});
