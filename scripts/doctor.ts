import {existsSync,readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {chromium} from 'playwright';
const checks:{name:string;status:'ok'|'missing'|'error';required:boolean}[]=[];
checks.push({name:'Node.js 24 or newer',status:Number(process.versions.node.split('.')[0])>=24?'ok':'error',required:true});
try{const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE readiness(value TEXT)');db.close();checks.push({name:'SQLite runtime',status:'ok',required:true});}catch{checks.push({name:'SQLite runtime',status:'error',required:true});}
for(const path of ['docs/cases/yonghegong-20261009.json','docs/cases/timewalk-review-evidence-20261008.json']){
 try{JSON.parse(readFileSync(path,'utf8'));checks.push({name:path,status:'ok',required:true});}catch{checks.push({name:path,status:existsSync(path)?'error':'missing',required:true});}
}
checks.push({name:'Production frontend (dist/index.html)',status:existsSync('dist/index.html')?'ok':'missing',required:false});
const chrome=process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
checks.push({name:'Browser executable for simulation',status:existsSync(chrome)||existsSync(chromium.executablePath())?'ok':'missing',required:false});
const credentialPresence=Object.fromEntries(['FLYAI_API_KEY','ROLLINGGO_API_KEY','AMAP_WEB_SERVICE_KEY','TYPESAFE_API_KEY'].map(name=>[name,Boolean(process.env[name]?.trim())]));
const ready=checks.filter(c=>c.required).every(c=>c.status==='ok');
console.log(JSON.stringify({checkedAt:new Date().toISOString(),localRuntimeReady:ready,checks,credentialPresence,notes:['Credential presence does not verify provider permissions or connectivity.','A missing production frontend requires npm run build; development mode uses Vite.','A missing browser affects simulation/browser checks; real API queries use server connectors.','Real create-order, payment, cancellation and refund capabilities remain unverified and disabled.'],realTransactionEnabled:false},null,2));
if(!ready)process.exitCode=1;
