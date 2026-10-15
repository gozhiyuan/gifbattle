import {commonsPriority} from './commons-priority.mjs';
import {catalogPath} from './catalog-store.mjs';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {commonsCandidates,jsonRequest} from './library.mjs';
import {metadataScreen,batchSummary} from './batch.mjs';
import {loadExclusions} from './stock-exclusions.mjs';
import {writeBatchReview} from './batch-review.mjs';
export const HUMOR_ROOTS=['Category:Humor photos','Category:Humorous animals','Category:Humor'];
async function save(path,data){await mkdir(dirname(path),{recursive:true});await writeFile(path+'.tmp',JSON.stringify(data,null,2)+'\n');await rename(path+'.tmp',path);}
export async function categoryPage(category,continuation={},limit=20){
 if(!/^Category:.{1,180}$/.test(category)||!Number.isInteger(limit)||limit<1||limit>20)throw new Error('Use a Commons category and page size 1–20');
 const url=new URL('https://commons.wikimedia.org/w/api.php');
 const params={action:'query',format:'json'};
 if(!continuation.filesDone)Object.assign(params,{generator:'categorymembers',gcmtitle:category,gcmtype:'file',gcmlimit:String(limit),prop:'imageinfo',iiprop:'url|size|mime|extmetadata',iiurlwidth:'400'});
 if(!continuation.subcategoriesDone)Object.assign(params,{list:'categorymembers',cmtitle:category,cmtype:'subcat',cmlimit:'500'});
 for(const key of ['continue','gcmcontinue','cmcontinue','iicontinue'])if(typeof continuation[key]==='string')params[key]=continuation[key];
 url.search=new URLSearchParams(params).toString();
 const data=await jsonRequest(url,{'User-Agent':'GIFBattlesAssetImporter/1.0 (offline catalog curation)'});
 const next=data.continue||{},filesDone=Boolean(continuation.filesDone||!next.gcmcontinue),subcategoriesDone=Boolean(continuation.subcategoriesDone||!next.cmcontinue);
 return {candidates:continuation.filesDone?[]:commonsCandidates(data,category),subcategories:[...(data.query?.categorymembers||[]),...Object.values(data.query?.pages||{})].filter(p=>p.ns===14&&p.title?.startsWith('Category:')).map(p=>p.title),continuation:filesDone&&subcategoriesDone?null:{filesDone,subcategoriesDone,...Object.fromEntries(['continue','gcmcontinue','cmcontinue','iicontinue'].filter(k=>typeof next[k]==='string').map(k=>[k,next[k]]))}};
}
const identity=c=>{try{return new URL(c.sourceUrl).href;}catch{return c.id;}};
export async function collectHumor({path,limit=120,depth=1,maxRequests=12,roots=HUMOR_ROOTS,exclude=[],read=categoryPage,delayMs=1000,grow=false,retrySources=false,autoResume=false,maxWaitMs=21600000,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
 if(!Number.isInteger(limit)||limit<1||limit>1000||!Number.isInteger(depth)||depth<0||depth>2||!Number.isInteger(maxRequests)||maxRequests<1||maxRequests>100||!roots.length||roots.length>10||roots.some(r=>!/^Category:.{1,180}$/.test(r)))throw new Error('Use limit 1–1000, depth 0–2, max-requests 1–100 and Commons category roots');
 const settings={policy:'commons-humor-v1',limit,depth,roots};let data;
 try{data=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(data){const old=data.collection?.settings;if(!old||old.policy!==settings.policy||JSON.stringify(old.roots)!==JSON.stringify(roots)||old.depth!==depth||(old.limit!==limit&&!(grow&&limit>=old.limit)))throw new Error('Humor resume settings differ; use --grow true for a larger limit or a new output file');data.collection.settings=settings;}
 data||={version:1,candidates:[],collection:{settings,requests:0,requestsBySource:{commons:0},queue:roots.map(category=>({category,root:category,depth:0,continuation:{}})),visited:[...roots],completed:[],exclusions:{}}};
 const waitUntil=async until=>{while(Date.now()<until)await sleep(Math.min(30000,until-Date.now()));};
 if(autoResume&&['rate_limited','temporarily_unavailable'].includes(data.collection.blockedReason)){const wait=Math.max(0,(data.collection.blockedUntil||0)-Date.now());if(wait<=maxWaitMs){if(wait)await waitUntil(Date.now()+wait);delete data.collection.blockedReason;delete data.collection.blockedUntil;}}
 if(retrySources)delete data.collection.blockedReason;
 if(data.collection.blockedReason){console.log(`Commons held: ${data.collection.blockedReason}; resume later with --retry-sources true`);return data;}
 const ids=new Set([...exclude,...data.candidates].map(c=>c.id)),origins=new Set([...exclude,...data.candidates].map(identity));
 let spent=0;
 while(data.collection.queue.length&&data.candidates.length<limit&&spent<maxRequests){
  data.collection.queue.sort((a,b)=>commonsPriority({humorSource:{category:b.category}}).score-commonsPriority({humorSource:{category:a.category}}).score);
  const item=data.collection.queue[0];spent++;data.collection.requests++;data.collection.requestsBySource.commons++;await save(path,data);
  let page;
  try{page=await read(item.category,item.continuation,Math.min(20,limit-data.candidates.length));}
  catch(error){const connectionFailure=error.name==='TimeoutError'||/fetch failed|timed? ?out/i.test(error.message||'');if([401,403,429,503].includes(error.httpStatus)||connectionFailure){
   data.collection.blockedReason=connectionFailure?'temporarily_unavailable':[429,503].includes(error.httpStatus)?'rate_limited':'source_rejected';
   const wait=Math.max(1000,error.retryAfterMs||60000);data.collection.blockedUntil=Date.now()+wait;await save(path,data);
   if(autoResume&&['rate_limited','temporarily_unavailable'].includes(data.collection.blockedReason)&&wait<=maxWaitMs&&spent<maxRequests){console.log(`Commons cooling down for ${Math.ceil(wait/1000)}s; will resume this category automatically`);await waitUntil(data.collection.blockedUntil);delete data.collection.blockedReason;delete data.collection.blockedUntil;await save(path,data);continue;}
   console.log(`Commons held: ${data.collection.blockedReason}; candidates/checkpoint preserved`);break;
  }throw error;}
  data.collection.fetchedCategories ||= []; if(!data.collection.fetchedCategories.includes(item.category))data.collection.fetchedCategories.push(item.category);
  for(const candidate of page.candidates){const screen=metadataScreen(candidate);if(!screen.passed){data.collection.rejectedCandidates ||= {};if(Object.keys(data.collection.rejectedCandidates).length<10000||data.collection.rejectedCandidates[candidate.id])data.collection.rejectedCandidates[candidate.id]={candidate,reasons:screen.reasons};else data.collection.rejectedEvidenceTruncated=true;for(const reason of screen.reasons)data.collection.exclusions[reason]=(data.collection.exclusions[reason]||0)+1;continue;}if(ids.has(candidate.id)||origins.has(identity(candidate)))continue;
   ids.add(candidate.id);origins.add(identity(candidate));data.candidates.push({...candidate,categories:[],collectionCategory:'humor',humorSource:{root:item.root,category:item.category,depth:item.depth},sourceScreen:screen,reviewStatus:'pending'});
  }
  data.collection.queue.shift();
  if(!page.continuation)data.collection.completed.push(item.category);
  for(const category of page.subcategories)if(item.depth<depth&&!data.collection.visited.includes(category)&&data.collection.visited.length<500){data.collection.visited.push(category);data.collection.queue.push({category,root:item.root,depth:item.depth+1,continuation:{}});}
  if(page.continuation)data.collection.queue.push({...item,continuation:page.continuation});
  await save(path,data);console.log(`${item.category}: ${data.candidates.length}/${limit} distinct permitted candidates`);
  if(delayMs)await new Promise(resolve=>setTimeout(resolve,delayMs));
 }
 await save(path,data);return data;
}
export async function collectHumorCommand(options,workspace){
 const path=resolve(workspace,options.out||'media-work/commons-humor/candidates.json');
 const {assets}=JSON.parse(await readFile(catalogPath(workspace),'utf8'));
 const data=await collectHumor({path,limit:Number(options.limit||120),depth:Number(options.depth||1),maxRequests:Number(options['max-requests']||12),roots:options.categories?options.categories.split(',').map(c=>c.trim().startsWith('Category:')?c.trim():'Category:'+c.trim()):HUMOR_ROOTS,exclude:[...assets,...await loadExclusions(workspace)],grow:options.grow==='true',retrySources:options['retry-sources']==='true',autoResume:options['auto-resume']==='true'});
 await writeBatchReview(path.replace(/\.json$/,'.html'),data);await save(path.replace(/\.json$/,'.summary.json'),{...batchSummary(data),humorCategoriesDiscovered:data.collection.visited.length,humorCategoriesFetched:data.collection.fetchedCategories?.length||0,remainingPages:data.collection.queue.length,blockedReason:data.collection.blockedReason||null});
 console.log(`Saved ${data.candidates.length} humor candidates. Next: batch-screen --input ${path}`);
}
