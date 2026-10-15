import {createHash} from 'node:crypto';
import {assertUploadBudget,UploadBudgetError,uploadBudget} from './upload-budget.mjs';
import {catalogPath} from './catalog-store.mjs';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { STOCK_CATEGORIES } from '../../lib/media/stock-categories.cjs';
import { metadataScreen } from './batch.mjs';
import { catalogReferences } from './similarity-index.mjs';
import { loadExclusions } from './stock-exclusions.mjs';
import { fingerprint, findSimilar } from './similarity.mjs';
import {inferDetail,diversityReason,photoSeriesMatch,sceneText} from '../../lib/media/stock-diversity.cjs';
import { inferSubject } from '../../lib/media/stock-subjects.cjs';
import { reviewedMetadata, importCandidates, readOriginal } from './library.mjs';
export function subjectQuotaReason(subject, counts, nextTotal, maximum=0.25) {
 if(subject==='unknown')return 'subject_assessment_required';
 return (counts.get(subject)||0)+1 > Math.max(1,Math.floor(nextTotal*maximum)) ? 'subject_quota' : null;
}
import { safetyPassed } from '../../lib/media/safety-policy.cjs';
const categories = new Set(STOCK_CATEGORIES.map(category => category.id));
export function strictCandidate(candidate, minimum = 80) {
  const ai = candidate.aiSuggestions;
  if (!safetyPassed(candidate) || !metadataScreen(candidate).passed || !ai || !Number.isInteger(ai.reactionScore) || ai.reactionScore < minimum || !Array.isArray(ai.riskFlags) || ai.riskFlags.length || candidate.curatorFlags?.length || candidate.duplicateOf || candidate.retiredAsSimilarTo || (candidate.similarTo && candidate.similarityReview?.status !== 'distinct') || !['image/jpeg', 'image/png', 'image/webp'].includes(candidate.mime)) return null;
  if (candidate.width * candidate.height > 40000000) return null;
  const labels = Array.isArray(ai.categories) ? [...new Set(ai.categories.filter(category => categories.has(category)))] : [];
  if (!labels.length || typeof ai.title !== 'string' || !ai.title.trim() || typeof ai.description !== 'string' || !ai.description.trim() || !Array.isArray(ai.tags) || !ai.tags.length) return null;
  const captionable = ai.captionable === true && ['bottom', 'top-bottom'].includes(ai.captionLayout);
  const record = { ...candidate, safety:ai.safety, primarySubject: inferSubject(candidate), title: ai.title, description: ai.description, categories: labels, tags: ai.tags,
    captionable, ...(captionable ? { captionLayout: ai.captionLayout, captionMaxLength: 120 } : {}), reviewStatus: 'approved',
    permissionRecord: `Source API license/credit metadata screened under stock-source-metadata-v1 on ${candidate.sourceScreen?.checkedAt || new Date().toISOString()}. License: ${candidate.license} (${candidate.licenseUrl}); source: ${candidate.sourceUrl}. Automated visual screening: ${ai.model}, score ${ai.reactionScore}, no reported risk flags; strict shortlist policy v1. No license inferred by AI.` };
  if (!captionable) return null;
  record.diversity={subjectDetail:inferDetail(record,record.primarySubject)};
  reviewedMetadata(record); return record;
}
async function save(path, value) { await mkdir(dirname(path), { recursive: true }); await writeFile(path + '.tmp', JSON.stringify(value, null, 2) + '\n'); await rename(path + '.tmp', path); }
export async function publishShortlist(inputPath, workspace, { storage = 'blob', minimum = 80, limit = 50, sources = ['commons', 'pexels', 'met', 'flickr'], maxSubjectShare = 0.25 } = {}) {
  if (!Number.isInteger(minimum) || minimum < 80 || minimum > 100 || !Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('Use min-score 80–100 and limit 1–1000');
  if (!(maxSubjectShare >= 0.125 && maxSubjectShare <= 0.5)) throw new Error('Use max-subject-share between 0.125 and 0.5');
  const input = JSON.parse(await readFile(inputPath, 'utf8'));
  const manifestPath = catalogPath(workspace);
  const catalog = JSON.parse(await readFile(manifestPath, 'utf8'));
  const existing = new Set([...catalog.assets, ...await loadExclusions(workspace)].map(asset => asset.id));
  const selected = input.candidates.map(candidate => strictCandidate(candidate, minimum)).filter(candidate => candidate && sources.includes(candidate.source) && !existing.has(candidate.id)).sort((a, b) => b.aiSuggestions.reactionScore - a.aiSuggestions.reactionScore || a.id.localeCompare(b.id));
  const statusPath = resolve(dirname(inputPath), 'publication.json'); let status;
  try { status = JSON.parse(await readFile(statusPath, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  status ||= { policy: 'strict-shortlist-v1', minimumScore: minimum, published: [], failures: {} };
  if(storage==='blob'&&selected.length){const budget=await assertUploadBudget(workspace,3);limit=Math.min(limit,Math.floor((budget.available-1)/2));}
  const references = await catalogReferences(workspace);
  const subjectCounts = new Map(),detailCounts=new Map(),creatorCounts=new Map();
  for (const asset of catalog.assets) { const subject = inferSubject(asset); subjectCounts.set(subject, (subjectCounts.get(subject) || 0) + 1); const detail=subject+':'+inferDetail(asset,subject);detailCounts.set(detail,(detailCounts.get(detail)||0)+1);const creator=asset.creator.trim().toLowerCase();creatorCounts.set(creator,(creatorCounts.get(creator)||0)+1); }
  let count = 0; const blockedSources = new Set();
  // Commit each successful file individually. A failed original cannot orphan a whole batch.
  for (const candidate of selected) {
    if(count>=limit)break;
    if (blockedSources.has(candidate.source)) { status.failures[candidate.id] = { reason: 'source_rate_limited', attemptedAt: new Date().toISOString() }; await save(statusPath, status); continue; }
    if (!candidate.visualFingerprint) {
      try { candidate.visualFingerprint = await fingerprint(await readOriginal({...candidate,downloadUrl:candidate.thumbnailUrl||candidate.downloadUrl},workspace)); }
      catch(error) {
        if(error.httpStatus===429)blockedSources.add(candidate.source);
        status.failures[candidate.id]={reason:error.httpStatus===429?'source_rate_limited':'fingerprint_unavailable',attemptedAt:new Date().toISOString()};await save(statusPath,status);continue;
      }
    }
    const match = photoSeriesMatch(candidate,references,inferSubject(candidate)) || candidate.visualFingerprint && findSimilar(candidate.visualFingerprint, references.filter(r => r.id !== candidate.id), {creator:candidate.creator,subject:inferSubject(candidate)});
    // A model score cannot override a duplicate hold or the subject diversity budget.
    if (match && (match.kind === 'exact' || candidate.similarityReview?.status !== 'distinct' || candidate.similarityReview?.id !== match.id)) {
      status.failures[candidate.id] = { reason: match.kind === 'exact' ? 'duplicate_image' : 'similarity_review_required', referenceId: match.id, attemptedAt: new Date().toISOString() }; await save(statusPath,status); continue;
    }
    const subject = inferSubject(candidate);
    const nextTotal = catalog.assets.length + count + 1;
    const quotaReason = subjectQuotaReason(subject,subjectCounts,nextTotal,maxSubjectShare)||diversityReason(candidate,subject,{detailCounts,creatorCounts,nextTotal});
    if (quotaReason) {
      status.failures[candidate.id] = { reason: quotaReason, subject, attemptedAt: new Date().toISOString() }; await save(statusPath,status); continue;
    }
    if(storage==='blob')await assertUploadBudget(workspace,3);
    try {
      await importCandidates({ candidates: [candidate] }, storage, workspace, {sync:false});
      subjectCounts.set(subject,(subjectCounts.get(subject)||0)+1);
      const detail=subject+':'+inferDetail(candidate,subject);detailCounts.set(detail,(detailCounts.get(detail)||0)+1);const creator=candidate.creator.trim().toLowerCase();creatorCounts.set(creator,(creatorCounts.get(creator)||0)+1);
      if(candidate.visualFingerprint) references.push({id:candidate.id,fingerprint:candidate.visualFingerprint,creator:candidate.creator,subject,detail:inferDetail(candidate,subject),scene:sceneText(candidate)});
      status.published = [...new Set([...status.published, candidate.id])]; delete status.failures[candidate.id]; count++;
      console.log(`Published ${count}/${selected.length}: ${candidate.id}`);
    } catch (error) {
      if(error instanceof UploadBudgetError)throw error;
      if (error.httpStatus === 429) blockedSources.add(candidate.source);
      status.failures[candidate.id] = { reason: error.httpStatus === 429 ? 'source_rate_limited' : /20 MB|pixels|100 frames/.test(error.message) ? 'image_limits' : 'download_or_upload_failed', attemptedAt: new Date().toISOString() };
      console.log(`Held ${candidate.id}: preparation/upload failed`);
    }
    await save(statusPath, status);
  }
  if(storage==='blob'){const {syncCatalog}=await import('./catalog-publish.mjs');await syncCatalog(workspace);}
  console.log(`Published ${count} new assets. Failed records remain checkpointed; existing catalog IDs skipped on resume.`);
  return count;
}

// Local planning never downloads files, calls a model, reads Redis, or writes Blob.
export function planPublication(candidates,catalog,{minimum=80,limit=50,maxSubjectShare=.25,sources=['commons','pexels','met','flickr'],references=[],excluded=[]}={}){
 if(!Number.isInteger(limit)||limit<1||limit>1000||!Number.isInteger(minimum)||minimum<80||minimum>100||maxSubjectShare<.125||maxSubjectShare>.5)throw Error('Invalid publication plan limits');
 const existing=new Set([...catalog.assets,...excluded].map(c=>c.id)),sourceUrls=new Set([...catalog.assets,...excluded].map(c=>c.sourceUrl)),seen=new Set(),holds=[],ready=[];
 const refs=[...references],subjects=new Map(),details=new Map(),creators=new Map();
 const add=c=>{const subject=inferSubject(c),detail=subject+':'+inferDetail(c,subject),creator=c.creator.trim().toLowerCase();subjects.set(subject,(subjects.get(subject)||0)+1);details.set(detail,(details.get(detail)||0)+1);creators.set(creator,(creators.get(creator)||0)+1);};
 catalog.assets.forEach(add);
 const selected=candidates.map(c=>{try{return strictCandidate(c,minimum);}catch{return null;}}).filter(c=>c&&sources.includes(c.source)).sort((a,b)=>b.aiSuggestions.reactionScore-a.aiSuggestions.reactionScore||a.id.localeCompare(b.id));
 for(const c of selected){
  if(existing.has(c.id)||sourceUrls.has(c.sourceUrl)||seen.has(c.id))continue;seen.add(c.id);
  let reason,referenceId;
  if(!c.visualFingerprint)reason='fingerprint_required';
  const match=!reason&&(photoSeriesMatch(c,refs,inferSubject(c))||findSimilar(c.visualFingerprint,refs.filter(r=>r.id!==c.id),{creator:c.creator,subject:inferSubject(c)}));
  if(match&&(match.kind==='exact'||c.similarityReview?.status!=='distinct'||c.similarityReview?.id!==match.id)){reason=match.kind==='exact'?'duplicate_image':'similarity_review_required';referenceId=match.id;}
  const subject=inferSubject(c),nextTotal=catalog.assets.length+ready.length+1;
  reason ||= subjectQuotaReason(subject,subjects,nextTotal,maxSubjectShare)||diversityReason(c,subject,{detailCounts:details,creatorCounts:creators,nextTotal});
  if(!reason&&ready.length>=limit)reason='batch_limit';
  if(reason){holds.push({id:c.id,reason,subject,...(referenceId?{referenceId}:{})});continue;}
  ready.push(c);add(c);sourceUrls.add(c.sourceUrl);refs.push({id:c.id,fingerprint:c.visualFingerprint,creator:c.creator,subject,detail:inferDetail(c,subject),scene:sceneText(c)});
 }
 return {ready,holds};
}
export async function publicationDryRun(inputPath,workspace,options={}){
 const input=JSON.parse(await readFile(inputPath,'utf8')),catalog=JSON.parse(await readFile(catalogPath(workspace),'utf8'));
 let cache={assets:{}};try{cache=JSON.parse(await readFile(resolve(workspace,'media-work/catalog-fingerprints.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const references=catalog.assets.flatMap(c=>{const fp=c.visualFingerprint||(cache.assets[c.id]?.imageKey===(c.previewUrl||c.url)?cache.assets[c.id]?.fingerprint:null);return fp?[{id:c.id,fingerprint:fp,creator:c.creator,subject:inferSubject(c),detail:inferDetail(c,inferSubject(c)),scene:sceneText(c)}]:[];});
 const plan=planPublication(input.candidates,catalog,{...options,references,excluded:await loadExclusions(workspace)}),budget=await uploadBudget(workspace);
 let checkpoint;try{checkpoint=JSON.parse(await readFile(resolve(workspace,'media-work/live-catalog.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const snapshot={version:1,assets:catalog.assets.map(({visualFingerprint,...asset})=>asset)},snapshotPending=checkpoint?.revision!==createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
 const imageUploads=plan.ready.length*2,catalogUploads=plan.ready.length||snapshotPending?1:0;
 return {dryRun:true,canPublish:plan.ready.length>0&&references.length===catalog.assets.length&&imageUploads+catalogUploads<=budget.available,currentTemplates:catalog.assets.length,candidateRecords:input.candidates.length,fingerprintCoverage:{known:references.length,total:catalog.assets.length},ready:plan.ready.map(c=>c.id),holds:plan.holds,operations:{imageUploads,catalogUploads,total:imageUploads+catalogUploads,available:budget.available,reservedForGameplay:budget.reservedForGameplay??500,quotaStatus:budget.reason,fits:imageUploads+catalogUploads<=budget.available},note:'Upload counts are conservative attempts; existing immutable files may be reused. Missing fingerprint coverage requires verification at publication. No external services were called.'};
}
