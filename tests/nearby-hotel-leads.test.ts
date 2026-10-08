import test from 'node:test';import assert from 'node:assert/strict';import {normalizeNearbyHotelLeads} from '../server/amap.ts';
test('map discovery leads exclude out-of-radius, invalid and duplicate places without creating bookable hotels',()=>{
 const query={location:'116.417296,39.947239',city:'北京',radius:2000},near={id:'near',name:'测试酒店',address:'测试路1号',location:'116.4173,39.9472'};
 const result=normalizeNearbyHotelLeads({_observedAt:'2026-10-08T15:00:00Z',pois:[{...near,id:'far',location:'116.5,39.9'},near,near,{...near,id:'invalid',location:'200,90'},{...near,id:'blank',name:''}]},query);
 assert.equal(result.places.length,1);assert.equal(result.places[0].id,'poi-near');assert(result.places[0].straightDistanceMeters<100);assert.equal(result.observedAt,'2026-10-08T15:00:00Z');assert.equal(result.discoveryOnly,true);assert.equal('rooms' in result.places[0],false);assert(result.limitations.some(x=>x.includes('not verified merchant')));
 assert.throws(()=>normalizeNearbyHotelLeads({}, {...query,radius:50001}));assert.throws(()=>normalizeNearbyHotelLeads({}, {...query,location:'invalid'}));
});
