import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {CandidateArchive} from './archive.mjs';import {normalizeSafety,SAFETY_CATEGORIES,safetyPassed} from '../../lib/media/safety-policy.cjs';
const c={id:'pexels-test',source:'pexels',sourceUrl:'https://www.pexels.com/photo/test',curatorFlags:['review_face'],aiSuggestions:{model:'fixture',reactionScore:50}};
const safe=normalizeSafety({safeForChildren:true,safeForWork:true,checks:Object.fromEntries(SAFETY_CATEGORIES.map(key=>[key,'clear']))});
test('archive persists assessments, deduplicates sources and preserves curator decisions across reopen',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'gifbattle-archive-'));let a;
 try{const path=join(dir,'c.sqlite');a=new CandidateArchive(path);a.upsert(c);a.upsert({...c,aiSuggestions:{model:'fixture',safety:safe,reactionScore:80}});a.upsert({...c,id:'alias',curatorFlags:[],aiSuggestions:{model:'old'}});assert.equal(a.stats().candidates,1);assert.equal(a.stats().assessments,3);assert.equal(a.get(c.id).aiSuggestions.safety.status,'safe');assert.deepEqual(a.get(c.id).curatorFlags,['review_face']);a.close();a=new CandidateArchive(path);assert.equal(a.get(c.id).aiSuggestions.reactionScore,80);assert.equal(a.pending(10).length,0);}finally{a?.close();await rm(dir,{recursive:true});}
});
test('every API reservation consumes a durable request and conservative spend allowance, including failures',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'gifbattle-archive-'));let a;
 try{a=new CandidateArchive(join(dir,'c.sqlite'));a.upsert(c);const id=a.createRun({maxCalls:3,maxUsd:0.02,costPerCall:0.01});const first=a.reserve(id,c.id);assert.ok(first);a.completeAttempt(first,'http_429');assert.ok(a.reserve(id,c.id));assert.equal(a.reserve(id,c.id),null);assert.equal(a.run(id).calls,2);assert.equal(a.run(id).reserved_cost,20000);assert.throws(()=>a.completeAttempt(first,'success'));assert.equal(a.acquireLock('one'),true);assert.equal(a.acquireLock('two'),false);a.releaseLock('one');assert.equal(a.acquireLock('two'),true);}finally{a?.close();await rm(dir,{recursive:true});}
});
test('known token usage reconciles reservation using input, output and thinking tokens',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'gifbattle-archive-'));let a;
 try{a=new CandidateArchive(join(dir,'c.sqlite'));a.upsert(c);const id=a.createRun({maxCalls:2,maxUsd:0.01,costPerCall:0.01});const first=a.reserve(id,c.id);a.completeAttempt(first,'success',{model:'gemini-3.5-flash-lite',promptTokenCount:1000,candidatesTokenCount:200,thoughtsTokenCount:100});assert.equal(a.run(id).reserved_cost,1050);assert.equal(a.reserve(id,c.id),null);assert.equal(a.run(id).calls,1);}finally{a?.close();await rm(dir,{recursive:true});}
});
test('safety fails closed for missing checks, uncertainty and unsafe content',()=>{
 assert.equal(safetyPassed({aiSuggestions:{safety:safe}}),true);assert.equal(safetyPassed({}),false);
 for(const key of SAFETY_CATEGORIES){const value=structuredClone(safe);value.checks[key]='review';assert.equal(safetyPassed({safety:value}),false);value.checks[key]='unsafe';assert.equal(normalizeSafety(value).status,'unsafe');}
 assert.equal(normalizeSafety({safeForChildren:true,safeForWork:true,checks:{}}).status,'review');
});
