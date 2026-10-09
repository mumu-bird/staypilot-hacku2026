import type {FlyaiResult,FlyaiQuery} from './flyai';
export type MonitorState={enabled:boolean;query:FlyaiQuery|null;deadline:string|null;nextCheckAt:string|null;lastError:string|null;consecutiveFailures?:number};
export type RealState={monitor:MonitorState;snapshots:FlyaiResult[];events:{at:string;action:string;reason:string}[]};
export type ReviewIssue='noise'|'hygiene'|'smell'|'maintenance'|'service'|'space'|'security';
