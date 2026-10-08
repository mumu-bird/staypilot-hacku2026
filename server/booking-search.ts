import {z} from 'zod';
import {validateRollinggoQuery} from './rollinggo.ts';
const schema=z.object({destination:z.string(),poi:z.string(),checkIn:z.string(),checkOut:z.string(),adultCount:z.number().int().min(1).max(4).default(2),bookerCountry:z.string().regex(/^[a-z]{2}$/),latitude:z.number().finite().min(-90).max(90),longitude:z.number().finite().min(-180).max(180),radiusKm:z.number().finite().min(1).max(10).default(2)}).strict();
/** Official Demand 3.2 read-only search. Country and coordinates are caller-supplied, never guessed. */
export async function searchBookingHotels(input:unknown,options:{key?:string;affiliate?:string;fetcher?:typeof fetch}={}){
 const v=schema.parse(input);validateRollinggoQuery({destination:v.destination,poi:v.poi,checkIn:v.checkIn,checkOut:v.checkOut,adultCount:v.adultCount});
 const key=options.key??process.env.BOOKING_DEMAND_API_KEY,affiliate=options.affiliate??process.env.BOOKING_AFFILIATE_ID;
 if(!key?.trim()||!affiliate?.trim()||!/^\d+$/.test(affiliate))throw new Error('Booking.com requires a partner API token and numeric Affiliate ID');
 const query={booker:{country:v.bookerCountry,platform:'desktop'},checkin:v.checkIn,checkout:v.checkOut,guests:{number_of_adults:v.adultCount,number_of_rooms:1},coordinates:{latitude:v.latitude,longitude:v.longitude,radius:v.radiusKm},currency:'CNY',extras:['extra_charges','products'],rows:10};
 const startedAt=new Date().toISOString();let response:Response;
 try{response=await (options.fetcher??fetch)('https://demandapi.booking.com/3.2/accommodations/search',{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${key}`,'X-Affiliate-Id':affiliate,'Content-Type':'application/json'},body:JSON.stringify(query),signal:AbortSignal.timeout(20000)});}catch{throw new Error('Booking.com search did not complete; check partner access and connectivity');}
 if(!response.ok)throw new Error('Booking.com search rejected (HTTP '+response.status+'); verify partner access');
 let data:unknown;try{const raw=await response.text();if(Buffer.byteLength(raw)>2*1024*1024)throw Error('Too large');data=JSON.parse(raw);}catch{throw new Error('Booking.com search returned an invalid response');}
 const parsed=z.object({request_id:z.string(),data:z.array(z.object({id:z.number().int().positive().safe()}).passthrough()).max(10),metadata:z.object({next_page:z.string().nullable().optional()}).passthrough()}).safeParse(data);
 if(!parsed.success)throw new Error('Booking.com search response does not match Demand 3.2');
 return {source:'Booking.com Demand API 3.2',startedAt,observedAt:new Date().toISOString(),query,observation:parsed.data,transactionEnabled:false,bookableQuote:false,limitations:['Raw provider observation; hotel identity and comparable product terms are not normalized or verified.','Search prices and inventory require fresh checkout verification.','No order, payment, cancellation or refund endpoint is called.']};
}
