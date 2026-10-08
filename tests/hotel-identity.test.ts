import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sameHotelAddress} from '../shared/hotel-identity.ts';
test('nearby attraction annotations do not prevent matching an exact hotel street address',()=>{assert(sameHotelAddress('安定门内大街方家胡同46号创意园，与雍和宫、南锣古巷相邻','安定门内大街方家胡同46号创意园'));assert(!sameHotelAddress('五道营胡同38号','五道营胡同39号'));assert(!sameHotelAddress('五道营胡同38号，2单元','五道营胡同38号，3单元'));assert(!sameHotelAddress('地址未知','地址未提供'));});
