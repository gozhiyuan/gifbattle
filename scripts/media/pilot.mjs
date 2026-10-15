import {resolve} from 'node:path';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {CandidateArchive} from './archive.mjs';
import {searchCandidates} from './library.mjs';
import {metadataScreen} from './batch.mjs';
import {STOCK_SUBJECTS} from '../../lib/media/stock-subjects.cjs';
import {SAFETY_POLICY} from '../../lib/media/safety-policy.cjs';
const situations=['funny interaction','humorous photo','absurd situation','forced perspective','animal interaction','unexpected object','visual joke','awkward situation'];
export async function collectPilot(archive,{cohort='family-pilot-1000',target=1000,maxRequests=100,sources=['commons','pexels','openverse'],search=searchCandidates,delayMs=1000}={}){
 if(!/^[a-z0-9-]{1,80}$/.test(cohort)||!Number.isInteger(target)||target<1||target>10000||!Number.isInteger(maxRequests)||maxRequests<1||maxRequests>200||sources.some(s=>!['commons','pexels','openverse'].includes(s)))throw new Error('Invalid pilot target, cohort or source request limit');
 const count=()=>archive.db.prepare("SELECT COUNT(*) AS n FROM candidates WHERE json_extract(data,'$.archiveCohort')=? AND json_extract(data,'$.archiveHold') IS NULL").get(cohort).n;
 let requests=0;const blocked=new Set();
 // Rotate subjects and situation queries, rather than fill all cats first.
 for(let page=1;page<=3;page++)for(let q=0;q<8;q++)for(const subject of STOCK_SUBJECTS)for(const source of sources){
  if(source==='commons'&&page>1||blocked.has(source))continue;
  const subjectCount=archive.db.prepare("SELECT COUNT(*) AS n FROM candidates WHERE json_extract(data,'$.archiveCohort')=? AND json_extract(data,'$.collectionSubject')=? AND json_extract(data,'$.archiveHold') IS NULL").get(cohort,subject.id).n;
  if(subjectCount>=Math.ceil(target/STOCK_SUBJECTS.length))continue;
  if(count()>=target||requests>=maxRequests)return {cohort,eligible:count(),requests,blocked:[...blocked]};
  const query=`${situations[q]} ${subject.queries[q%subject.queries.length]}`,task=`${source}:${q}:${subject.id}:${page}`;
  if(archive.db.prepare('SELECT 1 FROM discovery_tasks WHERE cohort=? AND task=? AND status=?').get(cohort,task,'complete'))continue;
  archive.db.prepare('INSERT INTO discovery_tasks VALUES(?,?,?) ON CONFLICT(cohort,task) DO UPDATE SET status=excluded.status').run(cohort,task,'requested');requests++;
  let candidates;
  try{candidates=await search(source,query,50,page);}catch(error){if([401,403,429,503].includes(error.httpStatus)){blocked.add(source);archive.db.prepare('UPDATE discovery_tasks SET status=? WHERE cohort=? AND task=?').run('source_limited',cohort,task);console.log(`${source} held${error.retryAfterMs?'; retry after '+Math.ceil(error.retryAfterMs/1000)+' seconds':''}; continuing other sources`);continue;}throw error;}
  for(const c of candidates){if(count()>=target)break;const filled=archive.db.prepare("SELECT COUNT(*) AS n FROM candidates WHERE json_extract(data,'$.archiveCohort')=? AND json_extract(data,'$.collectionSubject')=? AND json_extract(data,'$.archiveHold') IS NULL").get(cohort,subject.id).n;if(filled>=Math.ceil(target/STOCK_SUBJECTS.length))break;const old=archive.get(c.id)||archive.getBySource(c.sourceUrl);if(old)continue;const verified=metadataScreen(c).passed;
   archive.upsert({...c,archiveCohort:cohort,collectionSubject:subject.id,collectionCategory:'humor',...(verified?{}:{archiveHold:'source_verification_required'})});
  }
  archive.db.prepare('UPDATE discovery_tasks SET status=? WHERE cohort=? AND task=?').run('complete',cohort,task);
  console.log(`Pilot ${cohort}: ${count()}/${target} verified candidates (${requests}/${maxRequests} source searches)`);
  if(delayMs)await new Promise(resolve=>setTimeout(resolve,delayMs));
 }
 return {cohort,eligible:count(),requests,blocked:[...blocked]};
}
export async function pilotCommand(options,workspace){const archive=new CandidateArchive(resolve(workspace,options.db||'media-work/archive/candidates.sqlite'));try{const result=await collectPilot(archive,{cohort:options.cohort||'family-pilot-1000',target:Number(options.target||1000),maxRequests:Number(options['max-source-requests']||100),sources:(options.sources||'commons,pexels,openverse').split(',')});await mkdir(resolve(workspace,'media-work/archive'),{recursive:true});await writeFile(resolve(workspace,'media-work/archive/pilot-collection.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));}finally{archive.close();}}
