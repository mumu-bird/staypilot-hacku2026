// Coordinates from the same map provider only; straight distance is never travel time.
export function straightDistanceMeters(origin:string,destination:string):number|null{
 const coordinates=(s:string)=>{if(!/^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(s))return null;const pair=s.split(',').map(Number);return pair.length===2&&pair.every(Number.isFinite)&&Math.abs(pair[0])<=180&&Math.abs(pair[1])<=90?pair:null;};
 const a=coordinates(origin),b=coordinates(destination);if(!a||!b)return null;
 const rad=(x:number)=>x*Math.PI/180,lat=rad(b[1]-a[1]),lon=rad(b[0]-a[0]);
 const h=Math.sin(lat/2)**2+Math.cos(rad(a[1]))*Math.cos(rad(b[1]))*Math.sin(lon/2)**2;
 return Math.round(6371000*2*Math.atan2(Math.sqrt(Math.min(1,h)),Math.sqrt(Math.max(0,1-h))));
}
