import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {searchFlyai,validateFlyaiQuery} from './flyai.ts';
import type {FlyaiResult} from '../shared/flyai.ts';
import type {RealState,MonitorState} from '../shared/real-agent.ts';
export class RealAgent{
 private db:DatabaseSync;private timer:ReturnType<typeof setInterval>;private busy=false;private closed=false;private generation=0;private searchSource:typeof searchFlyai;
 private monitor:MonitorState={enabled:false,query:null,deadline:null,nextCheckAt:null,lastError:null};
 constructor(id:string,options:{directory?:string;search?:typeof searchFlyai}={}){
  this.searchSource=options.search??searchFlyai;
  if(!/^[a-zA-Z0-9_-]+$/.test(id))throw new Error('Invalid real session');mkdirSync(options.directory??'data/real',{recursive:true});
  this.db=new DatabaseSync(resolve(options.directory??'data/real',id+'.sqlite'));
  this.db.exec('CREATE TABLE IF NOT EXISTS snapshots(id INTEGER PRIMARY KEY,payload TEXT NOT NULL);CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,at TEXT,action TEXT,reason TEXT)');
  this.timer=setInterval(()=>{if(this.monitor.enabled&&!this.busy&&this.monitor.nextCheckAt&&Date.now()>=Date.parse(this.monitor.nextCheckAt))void this.poll();},1000);this.timer.unref();
 }
 private log(action:string,reason:string){if(this.closed)return;this.db.prepare('INSERT INTO events(at,action,reason) VALUES(?,?,?)').run(new Date().toISOString(),action,reason);}
 state():RealState{return {monitor:{...this.monitor},snapshots:(this.db.prepare('SELECT payload FROM snapshots ORDER BY id DESC LIMIT 50').all() as {payload:string}[]).map(r=>JSON.parse(r.payload)),events:this.db.prepare('SELECT at,action,reason FROM events ORDER BY id DESC LIMIT 100').all() as RealState['events']};}
 async search(input:Record<string,unknown>):Promise<FlyaiResult>{
  if(this.closed)throw new Error('此会话已关闭');if(this.busy)throw new Error('此会话正在执行真实查询');this.busy=true;
  try{const result=await this.searchSource(validateFlyaiQuery(input));if(this.closed)throw new Error('此会话已关闭');this.db.prepare('INSERT INTO snapshots(payload) VALUES(?)').run(JSON.stringify(result));this.log('网页/API观察',`飞猪返回 ${result.hotels.length} 家酒店；搜索价不视为含税总价。`);this.log('规则阻断','缺少最终房型报价、餐食、评论核验与完整成交授权，禁止创建真实订单。');return result;}
  catch(e){this.log('查询失败','未获得新报价；历史观察不视为当前库存或当前成交价。');throw e;}finally{this.busy=false;}
 }
 async startMonitor(input:Record<string,unknown>){
  const query=validateFlyaiQuery(input);const deadline=typeof input.deadline==='string'?input.deadline:'';
  if(!/(Z|[+-]\d\d:\d\d)$/.test(deadline)||!Number.isFinite(Date.parse(deadline))||Date.parse(deadline)<=Date.now()||Date.parse(deadline)>Date.now()+24*60*60*1000)throw new Error('监控截止须带时区、晚于当前时间且在24小时内');
  if(this.closed||this.busy)throw new Error('请等待当前查询完成再启动监控');if(this.monitor.enabled)throw new Error('监控已启动，请先停止再修改条件');
  this.generation++;this.monitor={enabled:true,query,deadline,nextCheckAt:new Date().toISOString(),lastError:null};this.log('启动监控','每30真实分钟检查一次，仅查询；不消耗测试钱包或创建真实订单。');await this.poll();return this.state();
 }
 stopMonitor(){this.generation++;this.monitor.enabled=false;this.monitor.nextCheckAt=null;this.log('停止监控','停止后不再安排新查询；进行中的查询可完成，始终不执行交易。');return this.state();}
 private async poll(){
  const deadline=this.monitor.deadline,generation=this.generation;
  if(!this.monitor.enabled||!deadline||!this.monitor.query)return;
  if(Date.now()>=Date.parse(deadline)){this.stopMonitor();this.log('截止仍未完成成交核验','未创建订单。条件组合：保留预算并核验具体房型与税费；确认可接受的通勤和历史评论问题；取得可取消报价及退款规则。预算差额未知，不能建议具体涨价金额。');return;}
  try{validateFlyaiQuery(this.monitor.query);}catch{this.stopMonitor();this.monitor.lastError='入住日期或查询条件已失效，监控已停止；请更新行程后重新启动。';this.log('行程失效',this.monitor.lastError);return;}
  try{await this.search(this.monitor.query);if(generation===this.generation)this.monitor.lastError=null;}catch{if(generation===this.generation)this.monitor.lastError='查询未完成，等待下一轮；不据历史价格进行交易。';}
  if(!this.closed&&generation===this.generation&&this.monitor.enabled)this.monitor.nextCheckAt=new Date(Math.min(Date.now()+30*60000,Date.parse(deadline))).toISOString();
 }
 blockBooking(){const reasons=['没有用户确认的真实购买授权','尚未获得绑定房型、人数、餐食的最终含税报价','商户订单、取消与退款接口尚未获准并验证'];this.log('真实下单阻断',reasons.join('；'));return {ok:false,transactionEnabled:false,orderCreated:false,reasons};}
 close(){if(this.closed)return;this.closed=true;this.generation++;this.monitor.enabled=false;clearInterval(this.timer);this.db.close();}
}
