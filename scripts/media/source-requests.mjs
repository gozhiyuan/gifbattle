import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {withProcessLock} from './process-lock.mjs';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const pause=ms=>new Promise(done=>setTimeout(done,ms));
export function retryAfterMs(value,now=Date.now()) {
 if(!value)return 0;
 const seconds=Number(value);
 return Number.isFinite(seconds)&&seconds>=0 ? seconds*1000 : Math.max(0,Date.parse(value)-now)||0;
}
export function sourceBucket(url) {
 const host=new URL(url).hostname;
 return ['commons.wikimedia.org','upload.wikimedia.org','thumb.wikimedia.org'].includes(host)?'commons':host==='api.openverse.org'?'openverse':host;
}
function interval(bucket) {
 const defaults={commons:5000,openverse:45000,'api.pexels.com':19000};
 const configured=process.env[bucket==='commons'?'COMMONS_REQUEST_INTERVAL_MS':bucket==='openverse'?'OPENVERSE_REQUEST_INTERVAL_MS':bucket==='api.pexels.com'?'PEXELS_REQUEST_INTERVAL_MS':''];
 if(configured===undefined)return defaults[bucket]||0;
 const value=Number(configured);
 if(!Number.isFinite(value)||value<1000||value>60000)throw new Error('Source request intervals must be 1000–60000 ms');
 return value;
}
function held(status,until,now) {
 return Object.assign(new Error('Source cooldown active; checkpoint preserved. Resume after the reported retry time.'),{httpStatus:status,retryAfterMs:Math.max(0,until-now)});
}

// Offline sourcing only. Run one importer at a time; this serializes each source
// within the process and persists provider cooldowns for the next invocation.
export class SourceLimiter {
 constructor({statePath=resolve(root,'media-work/source-rate-limits.json'),now=Date.now,sleep=pause,intervalMs=interval,maxCooldownWaitMs=30000,crossProcess=false}={}) {
  this.crossProcess=crossProcess;this.statePath=statePath;this.now=now;this.sleep=sleep;this.intervalMs=intervalMs;this.maxCooldownWaitMs=maxCooldownWaitMs;this.state={};this.next=new Map();this.queues=new Map();
 }
 async load(){if(!this.loaded)this.loaded=(async()=>{if(!this.statePath)return;try{this.state=JSON.parse(await readFile(this.statePath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}})();await this.loaded;}
 async reload(){if(!this.statePath)return;try{this.state=JSON.parse(await readFile(this.statePath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}}
 async save(bucket){if(!this.statePath)return;this.saving=(this.saving||Promise.resolve()).then(async()=>{
  const write=async()=>{await mkdir(dirname(this.statePath),{recursive:true});let latest={};try{latest=JSON.parse(await readFile(this.statePath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}latest[bucket]=this.state[bucket];const temporary=this.statePath+'.tmp-'+randomUUID();await writeFile(temporary,JSON.stringify(latest,null,2)+'\n');await rename(temporary,this.statePath);};
  if(this.crossProcess)await withProcessLock(this.statePath+'.write.lock',write);else await write();
 });await this.saving;}

 async run(bucket,operation,{retries=2}={}) {
  const previous=this.queues.get(bucket)||Promise.resolve();
  const execute=async()=>{
   await this.load();if(this.crossProcess)await this.reload();
   for(let attempt=0;attempt<=retries;attempt++) {
    const cooldown=this.state[bucket];
    if(cooldown?.until-this.now()>this.maxCooldownWaitMs)throw held(cooldown.status,cooldown.until,this.now());
    const wait=Math.max(0,(Math.max(this.next.get(bucket)||0,this.state[bucket]?.nextAt||0))-this.now(),(cooldown?.until||0)-this.now());
    if(wait)await this.sleep(wait);
    this.next.set(bucket,this.now()+this.intervalMs(bucket));
    this.state[bucket]={...this.state[bucket],nextAt:this.next.get(bucket)};await this.save(bucket);
    try{return await operation();}
    catch(error) {
     if(![429,503,500,502,504].includes(error.httpStatus))throw error;
     const delay=Math.max(error.retryAfterMs||0,error.httpStatus===429?60000:5000*2**attempt);
     // A provider-supplied short Retry-After is sufficient for 429; without it
     // retain a one-minute cooldown rather than retrying an exhausted quota.
     const effective=error.httpStatus===429&&error.retryAfterMs>0?error.retryAfterMs:delay;
     this.state[bucket]={...this.state[bucket],until:this.now()+effective,status:error.httpStatus};await this.save(bucket);
     if(attempt===retries||effective>this.maxCooldownWaitMs)throw held(error.httpStatus,this.state[bucket].until,this.now());
    }
   }
  };
  const task=previous.catch(()=>{}).then(()=>this.crossProcess&&this.statePath?withProcessLock(this.statePath+'.'+bucket.replace(/[^a-z0-9.-]/gi,'_')+'.lock',execute):execute());
  this.queues.set(bucket,task);return task;
 }
}
// Node test workers must never mutate the real importer cooldown checkpoint.
export const sourceLimiter=new SourceLimiter(process.env.NODE_TEST_CONTEXT?{statePath:null,intervalMs:()=>0}:{crossProcess:true});
export async function sourceRequest(input,headers={},json=false) {
 const url=new URL(input);
 if(url.hostname==='commons.wikimedia.org'&&url.pathname==='/w/api.php')url.searchParams.set('maxlag','5');
 return sourceLimiter.run(sourceBucket(url),async()=>{
  const response=await fetch(url,{headers,signal:AbortSignal.timeout(30000),redirect:'error'});
  if(!response.ok){await response.body?.cancel();throw Object.assign(new Error(`Source request failed (${response.status})`),{httpStatus:response.status,retryAfterMs:retryAfterMs(response.headers.get('retry-after'))});}
  if(!json)return response;
  const data=await response.json();
  if(data.error){const code=data.error.code;throw Object.assign(new Error(`Source API error: ${code||'unknown'}`),{...(['maxlag','ratelimited'].includes(code)?{httpStatus:code==='maxlag'?503:429,retryAfterMs:retryAfterMs(response.headers.get('retry-after'))}:{} )});}
  return data;
 });
}
