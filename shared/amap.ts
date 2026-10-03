export interface MapPlace {id:string;name:string;address:string;location:string;city:string;source:'poi'|'geocode';}
export interface TransitLine {name:string;type:string;departure:string;arrival:string;metro:boolean;}
export interface MapRoutes {source:'高德地图 Web 服务';observedAt:string;origin:string;destination:string;city:string;walking:{minutes:number;meters:number}|null;transits:{minutes:number;meters:number;walkingMeters:number|null;lines:TransitLine[];transfers:number|null;metroDirect:boolean;classification:string}[];warnings:string[];}
