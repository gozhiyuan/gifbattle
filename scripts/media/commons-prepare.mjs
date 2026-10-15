import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {catalogPath} from './catalog-store.mjs';
import {repairCommonsMetadata} from './commons-metadata.mjs';
import {prioritizeCommons,commonsPriority} from './commons-priority.mjs';
import {metadataScreen} from './batch.mjs';
import {SAFETY_POLICY,familyMetadataHold} from '../../lib/media/safety-policy.cjs';
import {strictCandidate,publicationDryRun} from './publish-shortlist.mjs';
import {loadExclusions} from './stock-exclusions.mjs';
async function save(path,data){await mkdir(dirname(path),{recursive:true});await writeFile(path+'.tmp',JSON.stringify(data,null,2)+'\n');await rename(path+'.tmp',path);}
export function buildCommonsQueues(input,{archived=[],catalog={assets:[]},excluded=[]}={}){
 const byId=new Map(archived.map(c=>[c.id,c])),bySource=new Map(archived.map(c=>[c.sourceUrl,c]));
 const published=new Set(catalog.assets.map(c=>c.id)),publishedSources=new Set(catalog.assets.map(c=>c.sourceUrl)),retired=new Set(excluded.flatMap(c=>[c.id,c.sourceUrl]));
 const exact=new Map();for(const c of [...catalog.assets,...archived.filter(c=>c.aiSuggestions?.safety?.policy===SAFETY_POLICY),...archived]){const hash=c.visualFingerprint?.exactHash;if(hash&&!exact.has(hash))exact.set(hash,c.id);}
 const screening=[],publication=[],holds=[],audit=[],seen=new Set(),counts={};let reusedAssessments=0;
 const raw=[...input.candidates,...Object.values(input.collection?.rejectedCandidates||{}).map(r=>r.candidate)];
 for(const rawCandidate of raw){
  const old=byId.get(rawCandidate.id)||bySource.get(rawCandidate.sourceUrl);
  const original={...rawCandidate,...old,humorSource:rawCandidate.humorSource||old?.humorSource};
  const c=repairCommonsMetadata(original),before=metadataScreen(original),after=metadataScreen(c);
  if(seen.has(c.id)||seen.has(c.sourceUrl))continue;seen.add(c.id);seen.add(c.sourceUrl);
  if(!before.passed||c.metadataRecovery||c.metadataConflict)audit.push({id:c.id,sourceUrl:c.sourceUrl,before:before.reasons,after:after.reasons,recovery:c.metadataRecovery,sourceMetadata:c.sourceMetadata,missingEvidence:!c.sourceMetadata});
  const assessed=c.aiSuggestions?.safety?.policy===SAFETY_POLICY;if(assessed)reusedAssessments++;
  let reason;
  if(published.has(c.id)||publishedSources.has(c.sourceUrl))reason='already_published';
  else if(retired.has(c.id)||retired.has(c.sourceUrl))reason='retired_stock';
  else if(!after.passed)reason='metadata_hold';
  else if(familyMetadataHold(c))reason='family_metadata_hold';
  else if(c.duplicateOf||c.retiredAsSimilarTo)reason='duplicate_or_retired';
  else if(c.visualFingerprint?.exactHash&&exact.get(c.visualFingerprint.exactHash)!==c.id)reason='exact_duplicate';
  else if(assessed){let strict;try{strict=strictCandidate(c);}catch{}if(strict){publication.push(strict);reason='publication_candidate';}else reason='assessed_policy_hold';}
  else if(c.curatorFlags?.length)reason='curator_hold';
  else if(c.similarTo&&c.similarityReview?.status!=='distinct')reason='similarity_hold';
  else {screening.push({...c,reviewStatus:'pending',discoveryPriority:commonsPriority(c)});reason='screening_candidate';}
  counts[reason]=(counts[reason]||0)+1;
  if(!['screening_candidate','publication_candidate'].includes(reason))holds.push({id:c.id,sourceUrl:c.sourceUrl,reason,metadataReasons:after.reasons,score:c.aiSuggestions?.reactionScore,priority:commonsPriority(c)});
 }
 return {screening:prioritizeCommons(screening),publication,holds,audit,summary:{collected:input.candidates.length,processedUnique:seen.size/2,reusedAssessments,counts,legacyExclusionEvents:input.collection?.exclusions||{},rejectedEvidenceRecords:Object.keys(input.collection?.rejectedCandidates||{}).length,note:'Legacy exclusion totals can overlap and lack per-file evidence. They cannot be reconstructed or automatically approved without refetching the source metadata.'}};
}
export async function prepareCommons(workspace,options={}){
 const input=JSON.parse(await readFile(resolve(workspace,options.input||'media-work/commons-humor-expanded/candidates.json'),'utf8'));
 const catalog=JSON.parse(await readFile(catalogPath(workspace),'utf8')),archivePath=resolve(workspace,'media-work/archive/candidates.sqlite');let archived=[];
 if(existsSync(archivePath)){const db=new DatabaseSync(archivePath,{readOnly:true});try{archived=db.prepare('SELECT data FROM candidates').all().map(r=>JSON.parse(r.data));}finally{db.close();}}
 const queues=buildCommonsQueues(input,{archived,catalog,excluded:await loadExclusions(workspace)}),out=resolve(workspace,options.out||'media-work/commons-ready');
 await save(resolve(out,'screening.json'),{version:1,candidates:queues.screening});
 await save(resolve(out,'publication-candidates.json'),{version:1,candidates:queues.publication});
 await save(resolve(out,'holds.json'),{version:1,records:queues.holds});
 await save(resolve(out,'metadata-audit.json'),{version:1,records:queues.audit,legacyExclusionEvents:queues.summary.legacyExclusionEvents,note:queues.summary.note});
 const plan=await publicationDryRun(resolve(out,'publication-candidates.json'),workspace,{limit:Number(options.limit||50),sources:['commons']});await save(resolve(out,'publication-plan.json'),plan);
 const summary={...queues.summary,priorityBands:Object.fromEntries([...new Set(queues.screening.map(c=>c.discoveryPriority.reason))].map(reason=>[reason,queues.screening.filter(c=>c.discoveryPriority.reason===reason).length])),publicationReady:plan.ready.length,publicationHeld:plan.holds.length,operations:plan.operations};
 await save(resolve(out,'summary.json'),summary);
 const lines=['# Commons preparation report','',`Collected: ${summary.collected}. Reused current assessments: ${summary.reusedAssessments}. Published library: ${catalog.assets.length}.`,'','No source requests, Gemini calls, Redis calls or Blob uploads were made.','','## Queues','',...Object.entries(summary.counts).map(([key,count])=>`- ${key}: ${count}`),'','## Screening priority','',...Object.entries(summary.priorityBands).map(([key,count])=>`- ${key}: ${count}`),'','## Metadata audit','',summary.note,'',...Object.entries(summary.legacyExclusionEvents).map(([key,count])=>`- ${key}: ${count} exclusion events`),'','## Publication dry run','',`Ready after duplicate/diversity checks: ${plan.ready.length}. Held: ${plan.holds.length}. Estimated uploads: ${plan.operations.total}. Available local stock allowance: ${plan.operations.available} (${plan.operations.quotaStatus}).`,'','The default gameplay reserve is 500 operations. A verified quota window and observed usage baseline must be configured before stock uploads. This local guard does not measure other applications or live gameplay usage.'];
 await writeFile(resolve(out,'report.md'),lines.join('\n')+'\n');console.log(JSON.stringify(summary,null,2));return summary;
}
