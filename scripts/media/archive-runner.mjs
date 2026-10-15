import {catalogPath} from './catalog-store.mjs';
import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import sharp from 'sharp';
import {CandidateArchive} from './archive.mjs';
import {proposeTags} from './ai.mjs';
import {readOriginal} from './library.mjs';
import {metadataScreen} from './batch.mjs';
import {readCatalogImage,catalogReferences} from './similarity-index.mjs';
import {fingerprint,findSimilar} from './similarity.mjs';
import {safetyPassed,SAFETY_POLICY,familyMetadataHold} from '../../lib/media/safety-policy.cjs';
import {inferDetail,photoSeriesMatch,sceneText} from '../../lib/media/stock-diversity.cjs';
import {inferSubject} from '../../lib/media/stock-subjects.cjs';
import {writeBatchReview} from './batch-review.mjs';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function queuedCandidates(archive,ids,limit){
 if(!Array.isArray(ids)||ids.length>10000||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(id)))throw Error('Invalid screening queue');
 const rows=ids.map(id=>{const c=archive.get(id);if(!c)throw Error('Queue candidate missing from archive; archive-import the screening queue first');return c;});
 return rows.filter(c=>c.aiSuggestions?.safety?.policy!==SAFETY_POLICY&&!c.duplicateOf&&['commons','pexels','met','flickr'].includes(c.source)).slice(0,limit);
}
export async function screenArchive(archive,workspace,{limit=1000,maxCalls=1000,maxUsd=5,costPerCall=0.01,runId,catalogOnly=false,cohort,candidateIds,retries=2,delayMs=500,concurrency=2,propose=proposeTags,read=readOriginal,sleep=pause}={}){
 if(!Number.isInteger(limit)||limit<1||limit>10000||!Number.isInteger(retries)||retries<0||retries>3)throw new Error('Use limit 1–10000, retries 0–3');
 if(!Number.isInteger(concurrency)||concurrency<1||concurrency>4)throw new Error('Use concurrency 1–4');
 const model=process.env.GEMINI_MEDIA_MODEL||'gemini-3.5-flash-lite';
 if(model!=='gemini-3.5-flash-lite')throw new Error('Archive budget pricing supports gemini-3.5-flash-lite; update configured rates before changing model');
 const id=runId||archive.createRun({maxCalls,maxUsd,costPerCall});if(archive.run(id)?.status!=='active')throw new Error('Run is not active');
 if(!archive.acquireLock(id))throw new Error('An archive screening worker is already active');
 try {
 const refs=await catalogReferences(workspace);const blockedSources=new Set();let evaluated=0,budgetHit=false;
 const exactImages=new Map([...refs.map(r=>[r.fingerprint.exactHash,r.id]),...[...archive.entries()].filter(c=>c.visualFingerprint?.exactHash).map(c=>[c.visualFingerprint.exactHash,c.id])]);
 const pending=candidateIds?queuedCandidates(archive,candidateIds,limit):archive.pending(limit,{catalogOnly,cohort});let position=0,fatal;
 const process=async initial=>{
  archive.heartbeat(id);const candidate=archive.get(initial.id);if(blockedSources.has(candidate.source))return;
  if(!candidate.catalogAsset&&!metadataScreen(candidate).passed){archive.upsert({...candidate,archiveHold:'source_verification_required'});return;}
  const familyHold=familyMetadataHold(candidate);if(familyHold&&!candidate.catalogAsset){archive.upsert({...candidate,archiveHold:familyHold});return;}
  let bytes;
  try{bytes=candidate.catalogAsset?await readCatalogImage(candidate.catalogAsset,workspace):await read({...candidate,...(candidate.localPreviewFile?{localFile:candidate.localPreviewFile}:{}),downloadUrl:candidate.thumbnailUrl||candidate.downloadUrl},workspace);}
  catch(error){if(error.httpStatus===429)blockedSources.add(candidate.source);archive.upsert({...candidate,archiveHold:error.httpStatus===429?'source_rate_limited':'preview_unavailable'});return;}
  const fp=await fingerprint(bytes),match=findSimilar(fp,refs.filter(r=>r.id!==candidate.id),{creator:candidate.creator,subject:inferSubject(candidate)});
  const exactId=exactImages.get(fp.exactHash);
  if(exactId&&exactId!==candidate.id&&!candidate.catalogAsset){archive.upsert({...candidate,duplicateOf:exactId,archiveHold:'duplicate_image',visualFingerprint:fp});return;}
  exactImages.set(fp.exactHash,candidate.id);
  if(match?.kind==='exact'&&!candidate.catalogAsset){archive.upsert({...candidate,duplicateOf:match.id,archiveHold:'duplicate_image',visualFingerprint:fp});return;}
  if(!match)refs.push({id:candidate.id,fingerprint:fp,creator:candidate.creator,subject:inferSubject(candidate)});
  let result;
  for(let attempt=0;attempt<=retries;attempt++){
   archive.heartbeat(id);const reservation=archive.reserve(id,candidate.id);if(!reservation){budgetHit=true;break;}
   let usage={model};
   try{result=await propose(candidate,bytes,{onUsage:value=>{usage={...value,model};}});archive.completeAttempt(reservation,'success',usage);break;}
   catch(error){archive.completeAttempt(reservation,error.httpStatus?`http_${error.httpStatus}`:'failed',usage);
    const retryable=[429,500,502,503,504].includes(error.httpStatus)||/^AI returned an invalid response$/.test(error.message)||error.name==='TimeoutError';
    if(!retryable||attempt===retries){archive.upsert({...candidate,screeningFailure:{reason:'model_assessment_failed',attemptedAt:new Date().toISOString()}});if([401,403].includes(error.httpStatus))throw new Error('AI credentials rejected; run checkpoint preserved');if(error.httpStatus===429)throw new Error('AI rate limited; run checkpoint preserved for a later resume');break;}
    await sleep(Math.min(60000,Math.max(error.retryAfterMs||0,1000*2**attempt)));
   }
  }
  if(!result)return;
  result.visualFingerprint=fp;
  const assessed=photoSeriesMatch(result,refs,inferSubject(result))||findSimilar(fp,refs.filter(r=>r.id!==candidate.id),{creator:candidate.creator,subject:inferSubject(result),detail:inferDetail(result,inferSubject(result)),scene:sceneText(result)});
  if(assessed&&!candidate.catalogAsset){result.similarTo=assessed.id;result.similarityReview={...assessed,status:'pending'};}
  const cachePath=resolve(workspace,'media-work/archive/previews',candidate.id+'.webp');
  if(result.aiSuggestions.safety.status==='unsafe'){
   for(const path of [candidate.localPreviewFile,cachePath])if(path&&resolve(path).startsWith(resolve(workspace,'media-work')+'/'))await unlink(path).catch(error=>{if(error.code!=='ENOENT')throw error;});result.localPreviewFile=null;
  }else{await mkdir(dirname(cachePath),{recursive:true});await writeFile(cachePath,await sharp(bytes,{limitInputPixels:40000000}).rotate().resize({width:640,height:640,fit:'inside',withoutEnlargement:true}).webp().toBuffer());result.localPreviewFile=cachePath;}
  result.screeningFailure=null;result.archiveHold=null;archive.upsert(result);evaluated++;
  const registered=refs.find(r=>r.id===candidate.id);if(registered){registered.subject=inferSubject(result);registered.detail=inferDetail(result,inferSubject(result));registered.scene=sceneText(result);}else if(!assessed)refs.push({id:candidate.id,fingerprint:fp,creator:result.creator,subject:inferSubject(result),detail:inferDetail(result,inferSubject(result)),scene:sceneText(result)});
  if(evaluated%10===0)console.log(`Assessed ${evaluated}; run ${id}, ${archive.run(id).calls}/${archive.run(id).max_calls} API attempts`);
  if(delayMs)await sleep(delayMs);
 };
 await Promise.all(Array.from({length:concurrency},async()=>{while(!budgetHit&&!fatal&&position<pending.length){const initial=pending[position++];try{await process(initial);}catch(error){fatal ||= error;}}}));
 if(fatal)throw fatal;
 archive.finish(id,budgetHit?'budget_limited':blockedSources.size?'source_limited':'complete');
 return {runId:id,evaluated,run:archive.run(id),blockedSources:[...blockedSources]};
 }finally{archive.releaseLock(id);}
}
export async function exportArchive(archive,path,{limit=100000}={}){
 const candidates=[];for(const c of archive.entries()){if(candidates.length>=limit)break;candidates.push(c);}
 await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify({version:1,candidates},null,2)+'\n');await writeBatchReview(path.replace(/\.json$/,'.html'),{version:1,candidates});return candidates.length;
}
export async function applyCatalogSafety(archive,workspace){
 const path=catalogPath(workspace),catalog=JSON.parse(await readFile(path,'utf8'));
 const records=new Map();for(const c of archive.entries())if(c.catalogAsset)records.set(c.catalogAsset.id,c);
 const missing=catalog.assets.filter(a=>records.get(a.id)?.aiSuggestions?.safety?.policy!==SAFETY_POLICY);
 if(missing.length)throw new Error(`${missing.length} catalog assets still need current safety assessments; catalog unchanged`);
 const held=[];catalog.assets=catalog.assets.filter(a=>{const c=records.get(a.id);if(!safetyPassed(c)||c.curatorFlags?.length||c.aiSuggestions.riskFlags?.length){held.push(a);return false;}a.safety=c.aiSuggestions.safety;return true;});
 const directory=resolve(workspace,'media-work/archive');await mkdir(directory,{recursive:true});await writeFile(resolve(directory,'catalog-safety-held.json'),JSON.stringify({version:1,assets:held},null,2)+'\n');
 await writeFile(path+'.tmp',JSON.stringify(catalog,null,2)+'\n');const {rename}=await import('node:fs/promises');await rename(path+'.tmp',path);return {kept:catalog.assets.length,held:held.length};
}
export async function archiveCommand(command,options,workspace){
 const archive=new CandidateArchive(resolve(workspace,options.db||'media-work/archive/candidates.sqlite'));
 try{
 if(command==='archive-import'){
  if(!options.input)throw new Error('Use --input candidate JSON');const data=JSON.parse(await readFile(resolve(workspace,options.input),'utf8'));for(const c of data.candidates||[])archive.upsert(c);console.log(JSON.stringify(archive.stats()));
 }else if(command==='archive-catalog'){
  const {assets}=JSON.parse(await readFile(catalogPath(workspace),'utf8'));
  for(const a of assets){const old=archive.get(a.id)||archive.getBySource(a.sourceUrl);archive.upsert({...old,...(!old?{id:a.id,sourceUrl:a.sourceUrl,source:a.id.startsWith('pexels-')?'pexels':'commons'}:{}),catalogAsset:a,creator:a.creator,reviewStatus:'approved',title:a.title,tags:a.tags,license:a.license,licenseUrl:a.licenseUrl});}console.log(`Archived ${assets.length} catalog records for safety review`);
 }else if(command==='archive-screen'){
  const queue=options.queue?JSON.parse(await readFile(resolve(workspace,options.queue),'utf8')):null;
  if(options.queue&&!Array.isArray(queue?.candidates))throw Error('Invalid queue file');
  const result=await screenArchive(archive,workspace,{candidateIds:queue?.candidates?.map(c=>c.id),limit:Number(options.limit||1000),maxCalls:Number(options['max-calls']||1000),maxUsd:Number(options['max-usd']||5),costPerCall:Number(options['reserve-usd-per-call']||0.01),runId:options['run-id'],catalogOnly:options['catalog-only']==='true',cohort:options.cohort,concurrency:Number(options.concurrency||2)});console.log(JSON.stringify(result));
 }else if(command==='archive-export'){const path=resolve(workspace,options.out||'media-work/archive/candidates.json');console.log(`Exported ${await exportArchive(archive,path,{limit:Number(options.limit||100000)})} candidates to ${path}`);
 }else if(command==='archive-apply-safety')console.log(JSON.stringify(await applyCatalogSafety(archive,workspace)));
 else if(command==='archive-backup'){
  if(!process.env.MEDIA_ARCHIVE_BLOB_READ_WRITE_TOKEN)throw new Error('Configure a separate private Blob store token: MEDIA_ARCHIVE_BLOB_READ_WRITE_TOKEN');
  const {put}=await import('@vercel/blob');let count=0;
  for(const c of archive.entries())if(safetyPassed(c)&&c.localPreviewFile&&metadataScreen(c).passed){const bytes=await readFile(c.localPreviewFile);await put(`review/${c.id}.webp`,bytes,{access:'private',token:process.env.MEDIA_ARCHIVE_BLOB_READ_WRITE_TOKEN,contentType:'image/webp',allowOverwrite:true,addRandomSuffix:false});count++;}
  // SQLite's VACUUM INTO produces a consistent snapshot while avoiding a live WAL file copy.
  const snapshot=resolve(workspace,'media-work/archive/backup.sqlite');await unlink(snapshot).catch(e=>{if(e.code!=='ENOENT')throw e;});archive.db.prepare('VACUUM INTO ?').run(snapshot);
  await put('archive/candidates.sqlite',await readFile(snapshot),{access:'private',token:process.env.MEDIA_ARCHIVE_BLOB_READ_WRITE_TOKEN,allowOverwrite:true,addRandomSuffix:false});console.log(`Backed up metadata and ${count} safe previews to private Blob`);
 }else console.log(JSON.stringify(archive.stats()));
 }finally{archive.close();}
}
