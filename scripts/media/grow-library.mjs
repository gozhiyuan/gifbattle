import {catalogPath} from './catalog-store.mjs';
import {resolve,dirname} from 'node:path';
import {readFile,writeFile,mkdir,rename,unlink} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {CandidateArchive} from './archive.mjs';
import {searchCandidates} from './library.mjs';
import {metadataScreen} from './batch.mjs';
import {writeGallery} from './gallery.mjs';
import {screenArchive} from './archive-runner.mjs';
import {publishShortlist,strictCandidate} from './publish-shortlist.mjs';
import {inferSubject} from '../../lib/media/stock-subjects.cjs';
import {inferDetail} from '../../lib/media/stock-diversity.cjs';
import {growthTasks,GROWTH_WEIGHTS,GROWTH_PLAN_VERSION} from './growth-plan.mjs';
async function save(path,data){await mkdir(dirname(path),{recursive:true});await writeFile(path+'.tmp',JSON.stringify(data,null,2)+'\n');await rename(path+'.tmp',path);}
const taskId=task=>createHash('sha256').update(JSON.stringify(task)).digest('hex');
export async function collectGrowth(archive,{cohort,target=2000,maxRequests=100,search=searchCandidates}={}){
 const counts=()=>archive.db.prepare("SELECT json_extract(data,'$.collectionSubject') AS subject,COUNT(*) AS n FROM candidates WHERE json_extract(data,'$.archiveCohort')=? AND json_extract(data,'$.archiveHold') IS NULL GROUP BY subject").all(cohort);
 let requests=0,added=0;const initial=counts().reduce((n,c)=>n+c.n,0);
 for(const task of growthTasks()){
  const current=new Map(counts().map(c=>[c.subject,c.n]));const total=[...current.values()].reduce((a,b)=>a+b,0);
  if(total>=target||requests>=maxRequests)return {eligible:total,added,requests};
  if((current.get(task.subject)||0)>=Math.ceil(target*GROWTH_WEIGHTS[task.subject]))continue;
  const id=taskId(task),scope=GROWTH_PLAN_VERSION;
  if(archive.db.prepare('SELECT status FROM discovery_tasks WHERE cohort=? AND task=?').get(scope,id)?.status==='complete')continue;
  archive.db.prepare('INSERT INTO discovery_tasks VALUES(?,?,?) ON CONFLICT(cohort,task) DO UPDATE SET status=excluded.status').run(scope,id,'requested');requests++;
  let candidates;try{candidates=await search('pexels',task.query,80,task.page);}catch(error){if([401,403,429,503].includes(error.httpStatus)){archive.db.prepare('UPDATE discovery_tasks SET status=? WHERE cohort=? AND task=?').run('source_limited',scope,id);return {eligible:total,added,requests,blocked:true,status:error.httpStatus,retryAfterMs:error.retryAfterMs||0};}throw error;}
  // Keep the entire bounded response so completing a task never loses overflow results.
  for(const c of candidates){if(archive.get(c.id)||archive.getBySource(c.sourceUrl))continue;const screen=metadataScreen(c);if(!screen.passed)continue;
   archive.upsert({...c,archiveCohort:cohort,collectionSubject:task.subject,collectionDetail:task.detail,collectionQuery:task.query,sourceScreen:screen});added++;
  }
  archive.db.prepare('UPDATE discovery_tasks SET status=? WHERE cohort=? AND task=?').run('complete',scope,id);
  console.log(`Collected ${initial+added}/${target} new-cohort candidates; ${requests} paced Pexels searches`);
 }
 return {eligible:initial+added,added,requests,exhausted:true};
}
export function growthReport(catalog,candidates,runs,target=10000){
 const subjects={},details={},categories={},queries={};let safeShortlist=0;
 for(const a of catalog.assets){const subject=inferSubject(a),detail=subject+':'+inferDetail(a,subject);subjects[subject]=(subjects[subject]||0)+1;details[detail]=(details[detail]||0)+1;for(const c of a.categories)categories[c]=(categories[c]||0)+1;}
 for(const c of candidates){let strict=false;try{strict=Boolean(strictCandidate(c));}catch{}if(strict)safeShortlist++;
  if(c.collectionQuery){const q=queries[c.collectionQuery]||={collected:0,assessed:0,strict:0};q.collected++;if(c.aiSuggestions?.safety)q.assessed++;if(strict)q.strict++;}
 }
 const published=catalog.assets.filter(a=>a.captionable&&a.format==='image').length;
 return {target,published,remaining:Math.max(0,target-published),archived:candidates.length,safeShortlist,subjects,details,categories,queries,modelCalls:runs.reduce((n,r)=>n+r.calls,0),estimatedUsd:runs.reduce((n,r)=>n+r.reserved_cost/1e6,0),updatedAt:new Date().toISOString()};
}
export async function growLibrary(workspace,{target=10000,batchSize=2000,maxUsd=100,maxCalls=100000,maxBatches=100,maxSourceRequests=100,stateFile='media-work/growth/state.json',collect=collectGrowth,screen=screenArchive,publish=publishShortlist,gallery=writeGallery}={}){
 if(!Number.isInteger(target)||target<1||target>10000||!Number.isInteger(batchSize)||batchSize<1||batchSize>5000||!(maxUsd>0&&maxUsd<=1000)||!Number.isInteger(maxCalls)||maxCalls<1||maxCalls>100000||!Number.isInteger(maxBatches)||maxBatches<1||maxBatches>100||!Number.isInteger(maxSourceRequests)||maxSourceRequests<1||maxSourceRequests>200)throw new Error('Invalid growth limits');
 const statePath=resolve(workspace,stateFile),lock=statePath+'.lock';await mkdir(dirname(lock),{recursive:true});
 try{await writeFile(lock,JSON.stringify({pid:process.pid}),{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;const owner=JSON.parse(await readFile(lock,'utf8'));try{process.kill(owner.pid,0);throw new Error('A growth process is already running');}catch(e){if(e.code!=='ESRCH')throw e;}await unlink(lock);await writeFile(lock,JSON.stringify({pid:process.pid}),{flag:'wx'});}
 const archive=new CandidateArchive(resolve(workspace,'media-work/archive/candidates.sqlite'));
 try{
 const settings={target,batchSize,maxUsd,maxCalls,plan:GROWTH_PLAN_VERSION};let state;try{state=JSON.parse(await readFile(statePath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(state&&JSON.stringify(state.settings)!==JSON.stringify(settings))throw new Error('Growth resume settings differ; retain the original settings or use a new state file');
 state||={settings,id:randomUUID(),batch:0,runs:[],phase:'collect',status:'running'};
 const report=async()=>{const catalog=JSON.parse(await readFile(catalogPath(workspace),'utf8'));const result=growthReport(catalog,[...archive.entries()],state.runs.map(id=>archive.run(id)),target);const output={...result,status:state.status};await save(resolve(dirname(statePath),'report.json'),output);return output;};
 state.status='running';await save(statePath,state);let batches=0;
 while(batches<maxBatches){
  let progress=await report();if(!progress.remaining){state.status='target_reached';break;}
  const cohort=`growth-${state.id}-${state.batch}`,leftUsd=maxUsd-progress.estimatedUsd,leftCalls=maxCalls-progress.modelCalls;
  if(leftUsd<.04||leftCalls<1){state.status='budget_limited';break;}
  if(state.phase==='collect'){
   const result=await collect(archive,{cohort,target:batchSize,maxRequests:maxSourceRequests});state.lastCollection=result;state.phase='screen';await save(statePath,state);
   if(!result.eligible){state.status=result.blocked?'source_limited':'sources_exhausted';state.phase='collect';break;}
  }
  if(state.phase==='screen'&&state.activeRun&&archive.run(state.activeRun)?.status!=='active'){state.lastScreen={runId:state.activeRun,evaluated:0,status:archive.run(state.activeRun)?.status};state.activeRun=null;state.phase='publish';await save(statePath,state);}
  if(state.phase==='screen'){
   if(!state.activeRun){state.activeRun=archive.createRun({maxCalls:Math.min(leftCalls,batchSize+160),maxUsd:leftUsd});state.runs.push(state.activeRun);await save(statePath,state);}
   const result=await screen(archive,workspace,{runId:state.activeRun,cohort,limit:Math.min(10000,batchSize+160),concurrency:4});state.lastScreen={runId:result.runId,evaluated:result.evaluated,status:result.run.status};state.activeRun=null;state.phase='publish';await save(statePath,state);
  }
  if(state.phase==='publish'){
   const candidates=[...archive.entries()].filter(c=>{try{return Boolean(strictCandidate(c));}catch{return false;}});const input=resolve(dirname(statePath),'shortlist.json');await save(input,{version:1,candidates});
   let count=0;while(true){progress=await report();if(!progress.remaining)break;const added=await publish(input,workspace,{storage:'blob',limit:Math.min(1000,progress.remaining)});count+=added;if(!added)break;}
   if(count)await gallery(workspace);
   state.lastPublished=count;state.batch++;batches++;state.phase='collect';await save(statePath,state);await report();
   console.log(`Growth batch ${state.batch}: ${count} published; catalog ${(await report()).published}/${target}`);
   if(state.lastCollection.blocked){state.status='source_limited';break;}
   if(state.lastCollection.exhausted){state.status='sources_exhausted';break;}
   if(!state.lastScreen.evaluated&&!count){state.status='no_progress';break;}
  }
 }
 if(!(await report()).remaining)state.status='target_reached';else if(state.status==='running')state.status='batch_limit';await save(statePath,state);return await report();
 }finally{archive.close();await unlink(lock);}
}
export async function growthCommand(options,workspace){for(const key of ['PEXELS_API_KEY','GEMINI_MEDIA_API_KEY','BLOB_READ_WRITE_TOKEN'])if(!process.env[key])throw new Error(`Set ${key} before starting growth`);const result=await growLibrary(workspace,{target:Number(options.target||10000),batchSize:Number(options['batch-size']||2000),maxUsd:Number(options['max-usd']||100),maxCalls:Number(options['max-calls']||100000),maxBatches:Number(options['max-batches']||100),maxSourceRequests:Number(options['max-source-requests']||100),stateFile:options.state||'media-work/growth/state.json'});console.log(JSON.stringify({...result,queries:Object.keys(result.queries).length}));}

export async function growthStatus(workspace,stateFile='media-work/growth/state.json'){
 const statePath=resolve(workspace,stateFile),state=JSON.parse(await readFile(statePath,'utf8'));
 const archive=new CandidateArchive(resolve(workspace,'media-work/archive/candidates.sqlite'));
 try{
  const catalog=JSON.parse(await readFile(catalogPath(workspace),'utf8'));
  const report=growthReport(catalog,[...archive.entries()],state.runs.map(id=>archive.run(id)),state.settings.target);
  const cohort=`growth-${state.id}-${state.batch}`;
  const current=archive.db.prepare("SELECT COUNT(*) AS n FROM candidates WHERE json_extract(data,'$.archiveCohort')=?").get(cohort).n;
  let running=false;try{const owner=JSON.parse(await readFile(statePath+'.lock','utf8'));process.kill(owner.pid,0);running=true;}catch{}
  return {...report,status:state.status,phase:state.phase,batch:state.batch,currentBatchCandidates:current,running};
 }finally{archive.close();}
}
