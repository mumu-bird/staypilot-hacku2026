export type Platform = 'a' | 'b' | 'c';
export type Issue = 'hygiene' | 'noise' | 'smell' | 'maintenance' | 'service' | 'breakfast';
export const ISSUE_LABELS: Record<Issue,string> = {hygiene:'卫生',noise:'隔音',smell:'装修气味',maintenance:'设施维护',service:'服务',breakfast:'早餐'};
export const PLATFORM_LABELS: Record<Platform,string> = {a:'栖途旅行',b:'住好 Staywell',c:'泊客精选'};
export interface Review {id:string; platform:Platform; hotelId:string; author:string; date:string; score:number; text:string; issues:Issue[]; positive:string[];}
export interface Hotel {id:string; name:string; address:string; district:string; openingYear:number|null; renovatedYear:number|null; walkMinutes:number; metroMinutes:number; metroDirect:boolean; capacity:number; roomType:string; breakfast:boolean; image:string; description:string; amenities:string[];}
export interface Quote {id:string; platform:Platform; hotelId:string; checkIn:string; checkOut:string; guests:number; rooms:number; roomType:string; breakfast:boolean; score:number; scoreMax:number; reviewCount:number; baseCents:number; taxCents:number; totalCents:number; inventory:number; cancellation:'free_until'|'nonrefundable'; cancelUntil:number|null; observedAt:number; expiresAt:number; source:'simulated';}
export type Downgrade = 'distance'|'opening'|'rating';
export interface Mandate {id:string; version:number; confirmed:boolean; revoked:boolean; destination:string; checkIn:string; checkOut:string; guests:number; rooms:number; roomType:string; budgetCents:number; peakCents:number; firstDeadline:number; optimizeUntil:number; expiresAt:number; allowNonrefundable:boolean; walkMax:number; metroMax:number; minScore:number; floorScore:number; openingMin:number; downgradeOrder:Downgrade[]; forbiddenIssues:Issue[]; issueWeights:Record<Issue,number>; minSavingsCents:number; minSavingsPercent:number;}
export interface Evaluation {quote:Quote; hotel:Hotel; eligible:boolean; tier:number; risk:number; reasons:string[]; conflicts:string[]; evidence:Review[];}
export interface Order {id:string; platform:Platform; hotelId:string; hotelName:string; quote:Quote; status:'confirmed'|'cancelled'|'refund_pending'|'refunded'|'cancel_failed'; paidCents:number; refundCents:number; createdAt:number; refundDueAt:number|null; mandateVersion:number; tier:number; risk:number; replacementFor:string|null;}
export interface AuditEvent {id:string; sequence:number; time:number; realTime:string; type:string; title:string; detail:string; data?:unknown; screenshot?:string; previousHash:string; hash:string;}
export interface Alternative {hotelId:string; hotelName:string; platform:Platform; totalCents:number; changes:string[]; reasons:string[];}
export interface Clock {now:number; running:boolean; speed:number; startedAt:number;}
export interface State {clock:Clock; scenario:string; scenarioLabel:string; mandate:Mandate; wallet:{initialCents:number; availableCents:number; exposureCents:number; realizedCostCents:number; refundPendingCents:number}; orders:Order[]; events:AuditEvent[]; candidates:Evaluation[]; alternatives:Alternative[]; agent:{running:boolean; monitoring:boolean; phase:string; error:string|null; lastRunAt:number|null; nextRunAt:number|null; mode:'deterministic'|'model';}; hotels:Hotel[]; observationCount:number;}
export interface BookingRequest {quoteId:string; idempotencyKey:string; mandateVersion:number; replacementFor?:string;}
export interface CancelRequest {orderId:string; idempotencyKey:string; compensation?:boolean;}
export interface TradeResult {ok:boolean; order?:Order; reason?:string; code?:string;}
export const money = (cents:number) => new Intl.NumberFormat('zh-CN',{style:'currency',currency:'CNY',minimumFractionDigits:0,maximumFractionDigits:2}).format(cents/100);
export const simTime = (ms:number) => new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(ms));
