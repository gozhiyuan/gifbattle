import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {configureUploadBudget} from './upload-budget.mjs';
import {CandidateArchive} from './archive.mjs';
import {collectGrowth,growLibrary,growthReport} from './grow-library.mjs';
import {growthTasks} from './growth-plan.mjs';
import {inferDetail,diversityReason,photoSeriesMatch} from '../../lib/media/stock-diversity.cjs';
import {normalizeSafety,SAFETY_CATEGORIES} from '../../lib/media/safety-policy.cjs';
const safe=normalizeSafety({safeForChildren:true,safeForWork:true,checks:Object.fromEntries(SAFETY_CATEGORIES.map(k=>[k,'clear']))});
const c=id=>({id,source:'pexels',sourceUrl:`https://www.pexels.com/photo/${id}`,downloadUrl:`https://images.pexels.com/${id}.jpeg`,creator:'Photographer',license:'Pexels License',licenseUrl:'https://www.pexels.com/license/',attribution:{label:'Photo by Photographer',url:`https://www.pexels.com/photo/${id}`},width:1000,height:1000,mime:'image/jpeg',aiSuggestions:{safety:safe,model:'fixture',primarySubject:'food',subjectDetail:'cooking',title:'Kitchen mess',description:'A cook looking surprised at burnt food',tags:['cooking'],categories:['shocked'],reactionScore:85,riskFlags:[],captionable:true,captionLayout:'bottom'}});
test('detail quotas distinguish species and hold repetitive creators without grandfathered deletion',()=>{
 assert.equal(inferDetail({description:'Two geese honking'},'other-animals'),'geese');
 const counts={detailCounts:new Map([['other-animals:geese',30]]),creatorCounts:new Map(),nextTotal:153};
 assert.equal(diversityReason({description:'A goose honking',creator:'New'},'other-animals',counts),'detail_quota');
 assert.equal(diversityReason({description:'A penguin surprised',creator:'New'},'other-animals',counts),null);
 assert.equal(diversityReason({description:'A penguin surprised',creator:'Popular'},'other-animals',{...counts,creatorCounts:new Map([['popular',10]])}),'creator_quota');
});
test('same-photographer scene repetitions are held without equating different creators or scenes',()=>{
 const candidate={creator:'Photographer',description:'Businessman holding a birthday cake with colorful candles',aiSuggestions:{primarySubject:'situations',subjectDetail:'celebration'}};
 const refs=[{id:'one',creator:'Photographer',subject:'situations',detail:'celebration',scene:'Businessman holding birthday cake with colorful candles'}];
 assert.equal(photoSeriesMatch(candidate,refs,'situations').kind,'photo-series');
 assert.equal(photoSeriesMatch({...candidate,creator:'Someone else'},refs,'situations'),null);
 assert.equal(photoSeriesMatch({...candidate,description:'Friends dancing in the kitchen'},refs,'situations'),null);
});
test('growth collection persists global query checkpoints, skips archived IDs and respects request caps',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'growth-collect-'));let archive;
 try{archive=new CandidateArchive(join(dir,'archive.sqlite'));let calls=0;const search=async()=>{calls++;return [c('pexels-'+calls)];};
  const first=await collectGrowth(archive,{cohort:'one',target:2000,maxRequests:2,search});assert.equal(first.requests,2);assert.equal(first.added,2);
  await collectGrowth(archive,{cohort:'two',target:2000,maxRequests:1,search});assert.equal(calls,3);assert.equal(archive.stats().candidates,3);
  assert.ok(growthTasks().length>700);
 }finally{archive?.close();await rm(dir,{recursive:true});}
});
test('growth runner reaches published-template target and resumes without rescreening or overshooting',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'growth-job-'));let calls=0;
 try{await mkdir(join(dir,'public/media'),{recursive:true});await writeFile(join(dir,'public/media/catalog.json'),JSON.stringify({version:1,assets:[]}));
  const options={target:1,batchSize:10,maxUsd:1,maxCalls:10,maxBatches:1,gallery:async()=>{},collect:async(a,{cohort})=>{a.upsert({...c('one'),archiveCohort:cohort});return {eligible:1,added:1,requests:1};},screen:async(a,_w,{runId})=>{calls++;a.finish(runId,'complete');return {runId,evaluated:1,run:a.run(runId)};},publish:async(_input,_w,{limit})=>{assert.equal(limit,1);await writeFile(join(dir,'public/media/catalog.json'),JSON.stringify({version:1,assets:[{...c('one'),primarySubject:'food',tags:['cooking'],description:'Cooking mess',categories:['shocked'],captionable:true,format:'image'}]}));return 1;}};
  const result=await growLibrary(dir,options);assert.equal(result.published,1);assert.equal(result.remaining,0);
  const resumed=await growLibrary(dir,options);assert.equal(resumed.status,'target_reached');assert.equal(calls,1);
 }finally{await rm(dir,{recursive:true});}
});

test('growth checkpoints a throttled source without starting paid screening when it collected nothing',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'growth-limit-'));let screened=0;
 try{await mkdir(join(dir,'public/media'),{recursive:true});await writeFile(join(dir,'public/media/catalog.json'),'{"version":1,"assets":[]}');
 await configureUploadBudget(dir,{periodStart:new Date(Date.now()-1000).toISOString(),periodEnd:new Date(Date.now()+86400000).toISOString(),quota:2000,used:0,reserve:500});
 const result=await growLibrary(dir,{target:10,batchSize:10,maxUsd:1,maxCalls:10,maxBatches:1,collect:async()=>({eligible:0,added:0,requests:1,blocked:true,status:429}),screen:async()=>{screened++;throw Error('Should not screen');}});
 assert.equal(result.status,'source_limited');assert.equal(screened,0);assert.equal(result.published,0);
 const state=JSON.parse(await readFile(join(dir,'media-work/growth/state.json'),'utf8'));assert.equal(state.phase,'collect');assert.deepEqual(state.runs,[]);
 }finally{await rm(dir,{recursive:true});}
});

test('model attempt limits apply across growth batches, not independently per batch',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'growth-cumulative-'));let collections=0,publishes=0;
 try{
 await mkdir(join(dir,'public/media'),{recursive:true});await writeFile(join(dir,'public/media/catalog.json'),'{"version":1,"assets":[]}');
 const result=await growLibrary(dir,{target:2,batchSize:10,maxUsd:1,maxCalls:1,maxBatches:2,gallery:async()=>{},collect:async(a,{cohort})=>{collections++;a.upsert({...c('one'),archiveCohort:cohort});return {eligible:1};},screen:async(a,_w,{runId})=>{const attempt=a.reserve(runId,'one');a.completeAttempt(attempt,'success');a.finish(runId,'complete');return {runId,evaluated:1,run:a.run(runId)};},publish:async()=>{if(publishes++)return 0;await writeFile(join(dir,'public/media/catalog.json'),JSON.stringify({version:1,assets:[{...c('one'),primarySubject:'food',tags:['cooking'],categories:['shocked'],captionable:true,format:'image'}]}));return 1;}});
 assert.equal(result.status,'budget_limited');assert.equal(result.modelCalls,1);assert.equal(collections,1);assert.equal(result.published,1);
 }finally{await rm(dir,{recursive:true});}
});

test('growth stops before collection or paid screening when stock upload allowance is unavailable',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'growth-upload-block-'));
 try{await mkdir(join(dir,'public/media'),{recursive:true});await writeFile(join(dir,'public/media/catalog.json'),JSON.stringify({version:1,assets:[]}));
 const result=await growLibrary(dir,{target:2,batchSize:10,maxUsd:1,maxCalls:10,collect:async()=>{throw Error('Must not collect');},screen:async()=>{throw Error('Must not spend model quota');}});
 assert.equal(result.status,'upload_budget_limited');assert.equal(result.modelCalls,0);
 }finally{await rm(dir,{recursive:true,force:true});}
});
