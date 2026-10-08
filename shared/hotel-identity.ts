export function hotelAddressKey(address:string){
 // Remove an explicitly labelled nearby-attraction annotation, preserving all street and house numbers.
 return address.replace(/[，,](?:与|近|毗邻|邻近).*/,'').replace(/[\s（）()·,，]/g,'').toLowerCase();
}
export function sameHotelAddress(a:string,b:string){return !!a&&!!b&&a!=='地址未知'&&b!=='地址未提供'&&hotelAddressKey(a)===hotelAddressKey(b);}
