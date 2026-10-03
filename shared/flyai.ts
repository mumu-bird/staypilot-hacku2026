export type FlyaiQuery = {destination:string;poi:string;checkIn:string;checkOut:string};
export type FlyaiHotel = {id:string;name:string;address:string;price:string;score:string|null;decorationTime:string|null;nearby:string|null;image:string|null;detailUrl:string|null};
export type FlyaiResult = {source:'飞猪 FlyAI';observedAt:string;query:FlyaiQuery;hotels:FlyaiHotel[];systemMessage:string|null;missingFields:string[];transactionEnabled:false};
