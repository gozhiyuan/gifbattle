import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SourceLimiter,retryAfterMs,sourceBucket,sourceRequest,sourceLimiter} from './source-requests.mjs';

test('source queue spaces concurrent callers, including Commons metadata and image hosts',async()=>{
 let now=1000;const starts=[],waits=[];
 const limiter=new SourceLimiter({statePath:null,now:()=>now,sleep:async ms=>{waits.push(ms);now+=ms;},intervalMs:()=>2000});
 await Promise.all(Array.from({length:3},()=>limiter.run('commons',async()=>{starts.push(now);})));
 assert.deepEqual(starts,[1000,3000,5000]);assert.deepEqual(waits,[2000,2000]);
 assert.equal(sourceBucket('https://commons.wikimedia.org/w/api.php'),'commons');
 assert.equal(sourceBucket('https://upload.wikimedia.org/a.jpg'),'commons');
});

test('long Retry-After survives restart and blocks requests without sleeping past the wait budget',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'gifbattle-source-limit-'));let now=1000,calls=0;
 const options={statePath:join(dir,'state.json'),now:()=>now,sleep:async()=>{throw Error('Must checkpoint instead of waiting');},intervalMs:()=>0};
 try{
  const first=new SourceLimiter(options);
  await assert.rejects(first.run('openverse',async()=>{calls++;throw Object.assign(Error('Limited'),{httpStatus:429,retryAfterMs:3600000});}),e=>e.httpStatus===429&&e.retryAfterMs===3600000);
  const second=new SourceLimiter(options);
  await assert.rejects(second.run('openverse',async()=>{calls++;}),e=>e.httpStatus===429);
  assert.equal(calls,1);now+=3600000;
  await second.run('openverse',async()=>{calls++;});assert.equal(calls,2);
 }finally{await rm(dir,{recursive:true});}
});

test('short Retry-After retries are bounded and source queues recover after rejection',async()=>{
 let now=1000,calls=0;const waits=[];
 const limiter=new SourceLimiter({statePath:null,now:()=>now,sleep:async ms=>{waits.push(ms);now+=ms;},intervalMs:()=>1000});
 await assert.rejects(limiter.run('commons',async()=>{calls++;throw Object.assign(Error('Limited'),{httpStatus:429,retryAfterMs:2000});}),e=>e.httpStatus===429);
 assert.equal(calls,3);assert.deepEqual(waits,[2000,2000]);
 const result=await limiter.run('commons',async()=>now);
 assert.equal(result,7000);
 assert.equal(retryAfterMs('2',0),2000);assert.equal(retryAfterMs('Thu, 01 Jan 1970 00:01:00 GMT',1000),59000);
});

test('Commons HTTP-200 maxlag errors are retried and all metadata requests set maxlag',async()=>{
 const fetcher=globalThis.fetch;let calls=0,now=1000;
 sourceLimiter.statePath=null;sourceLimiter.now=()=>now;sourceLimiter.sleep=async ms=>{now+=ms;};sourceLimiter.intervalMs=()=>0;
 try{
  globalThis.fetch=async url=>{assert.equal(new URL(url).searchParams.get('maxlag'),'5');calls++;return calls===1?Response.json({error:{code:'maxlag'}},{headers:{'Retry-After':'5'}}):Response.json({query:{pages:{}}});};
  const result=await sourceRequest('https://commons.wikimedia.org/w/api.php?action=query',{},true);
  assert.deepEqual(result,{query:{pages:{}}});assert.equal(calls,2);assert.equal(now,6000);
 }finally{globalThis.fetch=fetcher;}
});

test('normal source spacing persists across restarts, not only throttle errors',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'source-pace-'));let now=1000;const starts=[];
 const options={statePath:join(dir,'state.json'),now:()=>now,sleep:async ms=>{now+=ms;},intervalMs:()=>19000};
 try{await new SourceLimiter(options).run('api.pexels.com',async()=>starts.push(now));await new SourceLimiter(options).run('api.pexels.com',async()=>starts.push(now));assert.deepEqual(starts,[1000,20000]);}finally{await rm(dir,{recursive:true});}
});

test('separate importer instances share pacing and preserve other source checkpoints',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'source-shared-'));const starts=[];const statePath=join(dir,'state.json');
 const options={statePath,crossProcess:true,intervalMs:()=>30};
 try{const first=new SourceLimiter(options),second=new SourceLimiter(options);await Promise.all([first.run('commons',async()=>{starts.push(Date.now());await new Promise(r=>setTimeout(r,20));}),second.run('commons',async()=>starts.push(Date.now()))]);assert.ok(starts[1]-starts[0]>=25);await second.run('api.pexels.com',async()=>{});const {readFile}=await import('node:fs/promises');const saved=JSON.parse(await readFile(statePath,'utf8'));assert.ok(saved.commons.nextAt);assert.ok(saved['api.pexels.com'].nextAt);}finally{await rm(dir,{recursive:true});}
});
