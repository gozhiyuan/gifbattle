import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import sharp from 'sharp';
import {CandidateArchive} from './archive.mjs';import {screenArchive} from './archive-runner.mjs';import {normalizeSafety,SAFETY_CATEGORIES} from '../../lib/media/safety-policy.cjs';
const safe=normalizeSafety({safeForChildren:true,safeForWork:true,checks:Object.fromEntries(SAFETY_CATEGORIES.map(key=>[key,'clear']))});
const c=id=>({id,source:'pexels',sourceUrl:`https://www.pexels.com/photo/${id}`,downloadUrl:`https://images.pexels.com/${id}.jpg`,width:1000,height:1000,mime:'image/jpeg',creator:'Creator',attribution:{label:'Creator'},license:'Pexels License',licenseUrl:'https://www.pexels.com/license/',reviewStatus:'pending'});
test('archive runner reserves retries, enforces request cap, checkpoints assessments and does not retain unsafe pixels',async()=>{
 const workspace=await mkdtemp(join(tmpdir(),'gifbattle-runner-'));let a;
 try{await mkdir(join(workspace,'public/media'),{recursive:true});await writeFile(join(workspace,'public/media/catalog.json'),'{"version":1,"assets":[]}');a=new CandidateArchive(join(workspace,'media-work/archive/a.sqlite'));a.upsert(c('a'));a.upsert(c('b'));let calls=0;
  const bytes=await sharp({create:{width:40,height:40,channels:3,background:'red'}}).png().toBuffer();const unsafe=structuredClone(safe);unsafe.checks.nudity='unsafe';unsafe.status='unsafe';
  const result=await screenArchive(a,workspace,{limit:2,maxCalls:2,maxUsd:1,retries:1,concurrency:1,delayMs:0,sleep:async()=>{},read:async candidate=>candidate.id==='a'?bytes:sharp({create:{width:40,height:40,channels:3,background:'blue'}}).png().toBuffer(),propose:async(candidate,{},{onUsage})=>{calls++;if(calls===1)throw Object.assign(new Error('Unavailable'),{httpStatus:503});onUsage({promptTokenCount:100,candidatesTokenCount:100});return {...candidate,aiSuggestions:{safety:unsafe,primarySubject:'objects',riskFlags:[]}};}});
  assert.equal(calls,2);assert.equal(result.run.status,'budget_limited');assert.equal(a.get('a').aiSuggestions.safety.status,'unsafe');assert.equal(a.get('a').localPreviewFile,null);assert.equal(a.get('b').aiSuggestions,undefined);assert.equal(a.db.prepare('SELECT COUNT(*) AS n FROM attempts').get().n,2);assert.equal(a.acquireLock('next'),true);
 }finally{a?.close();await rm(workspace,{recursive:true});}
});

test('concurrent cap exhaustion preserves an already paid in-flight assessment',async()=>{
 const workspace=await mkdtemp(join(tmpdir(),'gifbattle-inflight-'));let a;
 try{await mkdir(join(workspace,'public/media'),{recursive:true});await writeFile(join(workspace,'public/media/catalog.json'),'{"version":1,"assets":[]}');a=new CandidateArchive(join(workspace,'media-work/archive/a.sqlite'));a.upsert(c('a'));a.upsert(c('b'));let calls=0;
  const result=await screenArchive(a,workspace,{limit:2,maxCalls:1,maxUsd:1,concurrency:2,delayMs:0,read:async candidate=>sharp({create:{width:40,height:40,channels:3,background:candidate.id==='a'?'red':'blue'}}).png().toBuffer(),propose:async candidate=>{calls++;await new Promise(r=>setTimeout(r,20));return {...candidate,aiSuggestions:{safety:safe,primarySubject:'objects',riskFlags:[]}};}});
  assert.equal(calls,1);assert.equal(result.evaluated,1);assert.equal(result.run.status,'budget_limited');assert.equal([...a.entries()].filter(x=>x.aiSuggestions?.safety).length,1);
 }finally{a?.close();await rm(workspace,{recursive:true});}
});

test('exact image fingerprints from an earlier archive cohort suppress another paid assessment',async()=>{
 const workspace=await mkdtemp(join(tmpdir(),'archive-global-duplicate-'));let a;
 try{
 await mkdir(join(workspace,'public/media'),{recursive:true});await writeFile(join(workspace,'public/media/catalog.json'),'{"version":1,"assets":[]}');
 a=new CandidateArchive(join(workspace,'media-work/archive/a.sqlite'));
 const bytes=await sharp({create:{width:40,height:40,channels:3,background:'red'}}).png().toBuffer();
 const {fingerprint}=await import('./similarity.mjs');
 a.upsert({...c('old'),visualFingerprint:await fingerprint(bytes),aiSuggestions:{safety:safe}});a.upsert({...c('new'),archiveCohort:'new-batch'});
 let calls=0;const result=await screenArchive(a,workspace,{cohort:'new-batch',limit:10,maxCalls:10,maxUsd:1,read:async()=>bytes,propose:async()=>{calls++;throw Error('Must not pay');}});
 assert.equal(calls,0);assert.equal(result.run.calls,0);assert.equal(a.get('new').duplicateOf,'old');
 }finally{a?.close();await rm(workspace,{recursive:true});}
});
