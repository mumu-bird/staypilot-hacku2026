import {sessionCookie,sessionIdFromCookie} from './session-cookie.ts';
import {readiness} from './readiness.ts';
import {isPrivatePagePath} from './private-path.ts';
import {readJsonBody,RequestInputError,maxJsonBodyBytes} from './http-input.ts';
import http from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { createServer as createViteServer } from 'vite';
import { Engine } from './engine.ts';
import { BrowserAgent } from './browser-agent.ts';
import { interpretPreference, modelConfigured } from './model.ts';
import {findNearbyHotelLeads,findMapPlaces,mapRoutes,amapConfigured} from './amap.ts';
import { RealAgent } from './real-agent.ts';
import { fliggyEvidence,reviewAssessment } from './fliggy-evidence.ts';
import { providerStatus,discoverBookingTools } from './providers.ts';
import {RollinggoAgent,rollinggoConfigured} from './rollinggo.ts';
import {typesafeConfigured,typeSafeHttp} from './typesafe.ts';
import {LiveWorkflow} from './live-workflow.ts';
import type { Platform } from '../shared/types.ts';

const port=Number(process.env.PORT||4173),host=process.env.HOST||'127.0.0.1';
const origin=`http://127.0.0.1:${port}`;
// Validate configured deployment origin before accepting requests.
sessionCookie('0'.repeat(32),process.env.PUBLIC_ORIGIN);
mkdirSync('data',{recursive:true});
const sessions=new Map<string,{engine:Engine;agent:BrowserAgent}>();
const realSessions=new Map<string,RealAgent>();
const rollinggoSessions=new Map<string,RollinggoAgent>();
const workflowSessions=new Map<string,LiveWorkflow>();
function workflowSession(sid:string){let flow=workflowSessions.get(sid);if(!flow){flow=new LiveWorkflow(sid,{requireQueryConsent:true,nearbyHotels:findNearbyHotelLeads,flySearch:input=>realSession(sid).search(input),rollingSearch:input=>rollinggoSession(sid).search(input),rollingDetail:input=>rollinggoSession(sid).detail(input),rollingLookup:input=>rollinggoSession(sid).detailByName(input),places:findMapPlaces,routes:mapRoutes,jev:typeSafeHttp});workflowSessions.set(sid,flow);}return flow;}
function rollinggoSession(sid:string){let agent=rollinggoSessions.get(sid);if(!agent){agent=new RollinggoAgent(sid);rollinggoSessions.set(sid,agent);}return agent;}
function realSession(sid:string){let agent=realSessions.get(sid);if(!agent){agent=new RealAgent(sid);realSessions.set(sid,agent);}return agent;}
const scenarios=[
  {id:'baseline',label:'比价与换订',description:'三个平台不同取消条款，30分钟后竞品降价。'},
  {id:'tax_spike',label:'结算税费超额',description:'展示价格在预算内，结算复核税费后阻断。'},
  {id:'sold_out',label:'库存售罄',description:'意向报价下单前售罄，保留证据并重新筛选。'},
  {id:'no_solution',label:'截止无解',description:'所有可行报价超出预算，输出条件组合。'},
  {id:'cancel_failure',label:'旧单取消失败',description:'换订后旧订单取消失败，尝试补偿取消新单。'},
  {id:'refund_delay',label:'退款延迟',description:'取消后延迟到账，占款期间禁止重复换订。'},
  {id:'refund_failure',label:'退款失败',description:'退款失败冻结进一步交易，保留订单和资金记录。'},
  {id:'prompt_injection',label:'评论恶意指令',description:'评论包含越权指令，资金与授权规则仍生效。'},
];
const vite=process.env.NODE_ENV==='production'?null:await createViteServer({server:{middlewareMode:true},appType:'spa'});
function advance(engine:Engine,minutes:number){const s=engine.getState();const finalAt=s.mandate.firstDeadline-60000;const target=s.clock.now+minutes*60000;if(s.agent.monitoring&&!engine.lastOrder()&&s.clock.now<finalAt&&target>=finalAt){engine.tick((finalAt-s.clock.now)/60000);engine.log('deadline_guard','抵达最后核验节点','先执行截止前的最后一轮网页核验，结束后再继续推进仿真时间。');}else engine.tick(minutes);}
function shouldRun(engine:Engine){const s=engine.getState();const finalAt=s.mandate.firstDeadline-60000;return s.agent.monitoring&&(s.clock.now>=(s.agent.nextRunAt||0)||(!engine.lastOrder()&&s.clock.now>=finalAt&&(s.agent.lastRunAt===null||s.agent.lastRunAt<finalAt)));}
function json(res:http.ServerResponse,value:unknown,status=200){if(res.headersSent||res.writableEnded){res.destroy();return;}const encoded=JSON.stringify(value);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(encoded);}
async function body(req:http.IncomingMessage):Promise<any>{if(Number(req.headers['content-length'])>maxJsonBodyBytes)throw new RequestInputError('请求内容过大，请缩短输入后重试。',413);return readJsonBody(req);}
function session(req:http.IncomingMessage,res:http.ServerResponse){
  let sid=sessionIdFromCookie(req.headers.cookie);
  if(!sid){sid=randomBytes(16).toString('hex');res.setHeader('Set-Cookie',sessionCookie(sid,process.env.PUBLIC_ORIGIN));}
  let current=sessions.get(sid);
  if(!current){const engine=new Engine(resolve('data',`${sid}.sqlite`));engine.setAgent({running:false});current={engine,agent:new BrowserAgent(engine,origin,sid)};sessions.set(sid,current);}
  return {sid,...current};
}
const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.webm':'video/webm','.json':'application/json'};
let shuttingDown=false;
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url||'/',origin),path=url.pathname;
    if(isPrivatePagePath(path)){json(res,{error:'Not found'},404);return;}
    if(path==='/api/ready'&&req.method==='GET'){const result=readiness({production:process.env.NODE_ENV==='production',frontendExists:existsSync(resolve('dist/index.html')),shuttingDown});json(res,{...result,checkedAt:new Date().toISOString()},result.status==='ready'?200:503);return;}
    if(path==='/api/health'&&req.method==='GET'){json(res,{status:'ok',checkedAt:new Date().toISOString(),realTransactionEnabled:false});return;}
    if(path.startsWith('/api/')||path.startsWith('/evidence/')){
      const {sid,engine,agent}=session(req,res);
      if(path.startsWith('/evidence/')){
        if(!path.startsWith(`/evidence/${sid}/`)){json(res,{error:'页面证据属于其他演示会话。'},403);return;}
        const file=resolve('public',`.${path}`);if(!file.startsWith(resolve('public/evidence',sid)+'/')||!existsSync(file)){json(res,{error:'证据不存在'},404);return;}
        const contents=readFileSync(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});res.end(contents);return;
      }
      if(req.method==='POST'){
        if(req.headers.origin){const requestOrigin=new URL(req.headers.origin);if(requestOrigin.host!==req.headers.host&&req.headers.origin!==process.env.PUBLIC_ORIGIN){json(res,{error:'跨站写入被拒绝'},403);return;}}
        const payload=await body(req);
        if(path==='/api/live/workflow/authorize'){json(res,workflowSession(sid).authorizeQueries(payload));return;}
        if(path==='/api/live/workflow/expand'){json(res,await workflowSession(sid).expandNearby(payload));return;}
        if(path==='/api/live/workflow/refresh'){json(res,await workflowSession(sid).refreshCandidate(payload));return;}
        if(path==='/api/live/workflow/select'){json(res,workflowSession(sid).selectInspection(payload));return;}
        if(path==='/api/live/workflow/reevaluate'){json(res,await workflowSession(sid).reevaluate(payload));return;}
        if(path==='/api/live/workflow/recheck'){json(res,await workflowSession(sid).recheck(payload));return;}
        if(path==='/api/live/workflow/run'){if(payload.mode==='live'&&!process.env.FLYAI_API_KEY?.trim()&&!process.env.ROLLINGGO_API_KEY?.trim()){json(res,{error:'尚未配置酒店查询服务，请配置FlyAI或RollingGo服务端凭证；可继续使用明确标注的历史回放。'},503);return;}if(workflowSession(sid).state().running){json(res,{error:'本会话核验正在运行，请等待结束。'},409);return;}json(res,await workflowSession(sid).run(payload));return;}
        if(path==='/api/live/workflow/revoke'){json(res,workflowSession(sid).stopMonitor('consent_revoked'));return;}
        if(path==='/api/live/workflow/monitor'){if(payload.enabled===false){json(res,workflowSession(sid).stopMonitor());return;}const {enabled,...input}=payload;if(enabled!==true)throw new Error('请明确开启或停止监控');if(!process.env.FLYAI_API_KEY?.trim()&&!process.env.ROLLINGGO_API_KEY?.trim()){json(res,{error:'尚未配置酒店查询服务，不能启动实时监控。'},503);return;}json(res,await workflowSession(sid).startMonitor(input));return;}
        if(path==='/api/live/jev/assess'){json(res,await rollinggoSession(sid).assess(payload));return;}
        if(path==='/api/live/jev/models'){json(res,await typeSafeHttp('/v1/models'));return;}
        if(path==='/api/live/rollinggo/discover'){json(res,await rollinggoSession(sid).discover());return;}
        if(path==='/api/live/rollinggo/search'){json(res,await rollinggoSession(sid).search(payload));return;}
        if(path==='/api/live/rollinggo/detail'){json(res,await rollinggoSession(sid).detail(payload));return;}
        if(path==='/api/live/rollinggo/tags'){json(res,await rollinggoSession(sid).tags());return;}
        if(path==='/api/live/rollinggo/book'){json(res,rollinggoSession(sid).blockBooking(),403);return;}
        if(path==='/api/live/amap/places'){json(res,await findMapPlaces(payload));return;}
        if(path==='/api/live/amap/routes'){json(res,await mapRoutes(payload));return;}
        if(path==='/api/live/fliggy/search'){json(res,await realSession(sid).search(payload));return;}
        if(path==='/api/live/fliggy/monitor'){json(res,payload.enabled?await realSession(sid).startMonitor(payload):realSession(sid).stopMonitor());return;}
        if(path==='/api/live/fliggy/book'){json(res,realSession(sid).blockBooking(),403);return;}
        if(path==='/api/live/booking/discover'){json(res,await discoverBookingTools());return;}
        if(path==='/api/mandate'){if(agent.busy){json(res,{error:'浏览任务运行中，请等待本轮结束后修改授权。'},409);return;}json(res,engine.updateMandate(payload.patch||{},Boolean(payload.confirm)));return;}
        if(path==='/api/mandate/interpret'){json(res,await interpretPreference(String(payload.text||''),engine.getState().mandate));return;}
        if(path==='/api/revoke'){engine.revoke();await agent.stop();json(res,engine.getState());return;}
        if(path==='/api/wallet'){engine.addFunds(Number(payload.amountCents));json(res,engine.getState());return;}
        if(path==='/api/clock'){
          if(agent.busy&&payload.minutes!==undefined){json(res,{error:'网页决策运行中，仿真时钟暂缓。请待本轮完成再单步推进。'},409);return;}
          if(payload.minutes!==undefined)advance(engine,Number(payload.minutes));
          if(payload.running!==undefined)engine.setClock(Boolean(payload.running),payload.speed);
          else if(payload.speed!==undefined)engine.setClock(engine.getState().clock.running,Number(payload.speed));
          const s=engine.getState();
          if(!agent.busy&&shouldRun(engine))void agent.run();
          json(res,engine.getState());return;
        }
        if(path==='/api/reset'){if(agent.busy){json(res,{error:'浏览任务运行中，结束后才能重置。'},409);return;}if(!scenarios.some(s=>s.id===payload.scenario)){json(res,{error:'未知场景'},400);return;}engine.reset(payload.scenario);json(res,engine.getState());return;}
        if(path==='/api/agent/run'){if(agent.busy){json(res,{error:'本轮浏览仍在运行'},409);return;}void agent.run();json(res,{ok:true});return;}
        if(path==='/api/agent/monitor'){const s=engine.getState();if(payload.enabled&&(!s.mandate.confirmed||s.mandate.revoked||s.clock.now>=s.mandate.expiresAt)){json(res,{error:'先确认未到期的授权单才能持续监控。'},400);return;}engine.setAgent({monitoring:Boolean(payload.enabled)});if(payload.enabled&&!agent.busy)void agent.run();if(!payload.enabled)await agent.stop();json(res,engine.getState());return;}
        if(path==='/api/agent/mode'){if(payload.mode==='model'&&!modelConfigured()){json(res,{error:'尚未配置模型。当前可完整使用规则驱动模式；配置LLM_API_KEY、LLM_MODEL后再启用。'},400);return;}engine.setAgent({mode:payload.mode==='model'?'model':'deterministic'});json(res,engine.getState());return;}
        if(path==='/api/book'){json(res,engine.book(payload));return;}
        if(path==='/api/cancel'){json(res,engine.cancel(payload));return;}
        json(res,{error:'接口不存在'},404);return;
      }
      if(path==='/api/live/integrations'){json(res,{fliggy:{configured:Boolean(process.env.FLYAI_API_KEY?.trim())},model:{configured:modelConfigured(),name:modelConfigured()?process.env.LLM_MODEL:null},amap:{configured:amapConfigured()},rollinggo:{configured:rollinggoConfigured()},jev:{configured:typesafeConfigured(),model:process.env.TYPESAFE_MODEL||'jev-latest'},realBooking:false});return;}
      if(path==='/api/live/workflow/runs'){const runId=url.searchParams.get('runId');const flow=workflowSession(sid);const run=runId?flow.savedRun(runId):null;json(res,runId?(run?[run]:[]):flow.history());return;}
      if(path==='/api/live/workflow/rechecks'){const runId=url.searchParams.get('runId');json(res,workflowSession(sid).recheckHistory({runId,...(url.searchParams.has('candidateKey')?{candidateKey:url.searchParams.get('candidateKey')}:{}),...(url.searchParams.has('ratePlanId')?{ratePlanId:url.searchParams.get('ratePlanId')}:{} )}));return;}
      if(path==='/api/live/workflow/state'){json(res,workflowSession(sid).state());return;}
      if(path==='/api/live/rollinggo/state'){json(res,rollinggoSession(sid).state());return;}
      if(path==='/api/state'){json(res,{...engine.getState(),modelConfigured:modelConfigured()});return;}
      if(path==='/api/live/fliggy/state'){json(res,realSession(sid).state());return;}
      if(path==='/api/live/providers'){json(res,providerStatus());return;}
      if(path==='/api/live/fliggy/evidence/72547102'){json(res,{evidence:fliggyEvidence,assessment:reviewAssessment(url.searchParams.get('profile')==='flexible'?'flexible':'sensitive')});return;}
      if(path==='/api/scenarios'){json(res,scenarios);return;}
      const listing=/^\/api\/platform\/([abc])\/hotels$/.exec(path);
      if(listing){json(res,engine.list(listing[1] as Platform,{minScore:url.searchParams.has('minScore')?Number(url.searchParams.get('minScore')):undefined,maxPrice:url.searchParams.has('maxPrice')?Math.round(Number(url.searchParams.get('maxPrice'))*100):undefined,query:url.searchParams.get('query')||undefined}));return;}
      const detail=/^\/api\/platform\/([abc])\/hotel\/([^/]+)$/.exec(path);
      if(detail){const value=engine.detail(detail[1] as Platform,detail[2]);if(!value){json(res,{error:'酒店不存在'},404);return;}json(res,value);return;}
      if(path==='/api/audit/export'){
        const events=engine.getState().events;let previous='0'.repeat(64);let verified=true;
        for(const event of events){const {hash,...record}=event;if(record.previousHash!==previous||createHash('sha256').update(JSON.stringify(record)).digest('hex')!==hash)verified=false;previous=hash;}
        res.setHeader('Content-Disposition','attachment; filename="staypilot-audit.json"');json(res,{source:'模拟商户与测试资金，非真实酒店成交',exportedAt:new Date().toISOString(),hashChainVerified:verified,...engine.getState()});return;
      }
      json(res,{error:'接口不存在'},404);return;
    }
    if(vite){vite.middlewares(req,res,()=>{res.statusCode=404;res.end('Not found');});return;}
    const target=resolve('dist',`.${path}`);const safe=target.startsWith(resolve('dist')+'/')&&existsSync(target)&&extname(target);
    if(!safe&&(path.startsWith('/assets/')||extname(path))){json(res,{error:'Not found'},404);return;}
    const file=safe?target:resolve('dist/index.html');const contents=readFileSync(file);
    const cache=extname(file)==='.html'?'no-store':path.startsWith('/assets/')&&/-[A-Za-z0-9_-]{8,}\.(?:js|css)$/.test(path)?'public, max-age=31536000, immutable':'no-cache';
    res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':cache});res.end(contents);
  }catch(error){json(res,{error:error instanceof Error?error.message:'请求失败'},error instanceof RequestInputError?error.status:400);}
});
server.requestTimeout=30000;server.headersTimeout=15000;server.maxHeadersCount=100;
let lastTick=Date.now();
setInterval(()=>{
  const elapsed=Date.now()-lastTick;lastTick=Date.now();
  for(const {engine,agent} of sessions.values()){
    const state=engine.getState();if(state.clock.running&&!agent.busy)advance(engine,elapsed*state.clock.speed/60000);
    const fresh=engine.getState();
    if(!agent.busy&&shouldRun(engine))void agent.run();
  }
},1000).unref();
server.listen(port,host,()=>console.log(`StayPilot ready: http://${host}:${port}`));
async function shutdown(){if(shuttingDown)return;shuttingDown=true;for(const {agent} of sessions.values())await agent.stop();for(const agent of realSessions.values())agent.close();for(const agent of rollinggoSessions.values())agent.close();for(const flow of workflowSessions.values())flow.close();await vite?.close();server.close();server.closeAllConnections();}
process.on('SIGTERM',()=>void shutdown());process.on('SIGINT',()=>void shutdown());
