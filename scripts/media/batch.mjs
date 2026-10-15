import {catalogPath} from './catalog-store.mjs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { STOCK_CATEGORIES } from '../../lib/media/stock-categories.cjs';
import { safeHttps, validateCatalog } from '../../lib/media/catalog-schema.cjs';
import { searchCandidates, writeReview, readOriginal, importCandidates, reviewedMetadata } from './library.mjs';
import { writeBatchReview } from './batch-review.mjs';
import { proposeTags } from './ai.mjs';
import { fingerprint, findSimilar } from './similarity.mjs';
import { loadExclusions } from './stock-exclusions.mjs';
import { catalogReferences } from './similarity-index.mjs';
import { SUBJECT_IDS, inferSubject } from '../../lib/media/stock-subjects.cjs';
const allowedCommons = /^(CC BY(?:-SA)? (?:2\.0|2\.5|3\.0|4\.0)|CC0(?: 1\.0)?|Public domain)$/;
export function metadataScreen(candidate) {
  const reasons = [];
  if(candidate.metadataConflict)reasons.push('source_metadata_conflict');
  const host = value => { try { return new URL(value).hostname; } catch { return ''; } };
  if (!candidate.creator?.trim() || !candidate.attribution?.label?.trim()) reasons.push('missing_credit');
  if (!safeHttps(candidate.sourceUrl) || !safeHttps(candidate.licenseUrl)) reasons.push('missing_source_or_license_url');
  if (candidate.source === 'commons') {
    if (!allowedCommons.test(candidate.license || '')) reasons.push('license_not_allowlisted');
    if (host(candidate.sourceUrl) !== 'commons.wikimedia.org' || host(candidate.downloadUrl) !== 'upload.wikimedia.org') reasons.push('unexpected_source');
  } else if (candidate.source === 'pexels') {
    if (candidate.license !== 'Pexels License' || host(candidate.sourceUrl) !== 'www.pexels.com' || host(candidate.downloadUrl) !== 'images.pexels.com' || candidate.licenseUrl !== 'https://www.pexels.com/license/') reasons.push('unexpected_source_or_license');
  } else if(candidate.source==='flickr'){
    if(candidate.sourceVerification?.status!=='verified'||!allowedCommons.test(candidate.license||'')||!['www.flickr.com','flickr.com'].includes(host(candidate.sourceUrl))||!/^(live|farm[0-9]+|c[0-9]+)\.staticflickr\.com$/.test(host(candidate.downloadUrl))||host(candidate.licenseUrl)!=='creativecommons.org')reasons.push('unexpected_source_or_license');
  } else if(candidate.source==='met'){
    if(candidate.sourceVerification?.status!=='verified'||candidate.license!=='CC0'||host(candidate.sourceUrl)!=='www.metmuseum.org'||host(candidate.downloadUrl)!=='images.metmuseum.org'||candidate.licenseUrl!=='https://creativecommons.org/publicdomain/zero/1.0/')reasons.push('unexpected_source_or_license');
  } else reasons.push(candidate.source==='openverse'?'original_source_verification_required':'unsupported_source');
  if (!Number.isInteger(candidate.width) || !Number.isInteger(candidate.height) || candidate.width < 480 || candidate.height < 480) reasons.push('too_small_or_unknown_dimensions');
  if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(candidate.mime)) reasons.push('unsupported_format');
  return { passed: !reasons.length, reasons, checkedAt: new Date().toISOString(), policy: 'stock-source-metadata-v1' };
}
const sourceIdentity = candidate => { try { const url=new URL(candidate.sourceUrl);return url.hostname+decodeURIComponent(url.pathname).replace(/\/$/, ''); } catch { return candidate.id; } };
async function save(path, value) { await mkdir(dirname(path), { recursive: true }); await writeFile(path + '.tmp', JSON.stringify(value, null, 2) + '\n'); await rename(path + '.tmp', path); }
export async function collectBatch({ path, perCategory = 50, sources = ['commons'], maxRequests = 120, delayMs = 1000, search = searchCandidates, categories = STOCK_CATEGORIES, exclude = [], retrySources = false, grow = false }) {
  if (!Number.isInteger(perCategory) || perCategory < 1 || perCategory > 500 || !Number.isInteger(maxRequests) || maxRequests < 1 || maxRequests > 200 || !sources.length || sources.some(source => !['commons', 'pexels', 'openverse'].includes(source))) throw new Error('Use per-category 1–500, max-requests 1–200 and sources commons,pexels');
  const diverse = categories.some(c => c.subjectQueries);
  const settings = { perCategory, sources, categoryIds: categories.map(c => c.id), ...(diverse ? { sourcingPolicy: 'subject-balanced-v1' } : {}) };
  let data;
  try { data = JSON.parse(await readFile(path, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (data && (!Array.isArray(data.candidates) || !data.collection?.settings || !Array.isArray(data.collection.completedTasks))) throw new Error('Existing file is not a batch checkpoint; use a new output path');
  if (data && JSON.stringify(data.collection.settings) !== JSON.stringify(settings)) {
    const old = data.collection.settings;
    if (grow && perCategory >= old.perCategory && JSON.stringify(sources) === JSON.stringify(old.sources) && JSON.stringify(settings.categoryIds) === JSON.stringify(old.categoryIds) && settings.sourcingPolicy === old.sourcingPolicy) data.collection.settings = settings;
    else throw new Error('Resume settings differ; use --grow true for a larger target or a different output path');
  }
  data ||= { version: 1, candidates: [], collection: { settings, completedTasks: [], requests: 0, exclusions: {} } };
  if (retrySources) data.collection.disabledSources = {};
  const ids = new Set([...data.candidates, ...exclude].map(c => c.id));
  const origins = new Set([...data.candidates, ...exclude].map(sourceIdentity));
  let spent = 0;
  for (const category of categories) {
    const count = () => data.candidates.filter(c => c.collectionCategory === category.id).length;
    // Alternate sources within each query; Pexels pages add variety without repeating completed searches.
    const groups = category.subjectQueries || [{ subject: null, queries: category.queries }];
    for (const [groupIndex, group] of groups.entries()) {
      const quota = Math.floor(perCategory / groups.length) + (groupIndex < perCategory % groups.length ? 1 : 0);
      const groupCount = () => data.candidates.filter(c => c.collectionCategory === category.id && (!group.subject || c.collectionSubject === group.subject)).length;
      for (let q = 0; q < group.queries.length && count() < perCategory && groupCount() < quota; q++) {
        for (let page = 1; page <= 4 && count() < perCategory && groupCount() < quota; page++) for (const source of sources) {
          if (count() >= perCategory || groupCount() >= quota || (source === 'commons' && page > 1)) continue;
          const task = `${category.id}:${group.subject ? group.subject + ':' : ''}${q}:${source}:${page}`;
          if (data.collection.disabledSources?.[source]) continue;
          if (data.collection.completedTasks.includes(task)) continue;
          if (spent >= maxRequests) { await save(path, data); return data; }
          // Record request before dispatch so crashes/timeouts cannot disappear from usage accounting.
          spent++; data.collection.requests++; data.collection.requestsBySource ||= {}; data.collection.requestsBySource[source] = (data.collection.requestsBySource[source] || 0) + 1; await save(path, data);
          let candidates;
          try { candidates = await search(source, group.queries[q], 50, page); }
          catch (error) {
            if (/\(401\)|\(403\)|\(429\)/.test(error.message)) {
              data.collection.disabledSources ||= {}; data.collection.disabledSources[source] = /\(429\)/.test(error.message) ? 'rate_limited' : 'credential_rejected';
              await save(path, data); console.log(`${source}: ${data.collection.disabledSources[source]}; continuing other configured sources`); continue;
            }
            throw error;
          }
          for (const candidate of candidates) {
            const check = metadataScreen(candidate);
            if (!check.passed) { for (const reason of check.reasons) data.collection.exclusions[reason] = (data.collection.exclusions[reason] || 0) + 1; continue; }
            if (ids.has(candidate.id) || origins.has(sourceIdentity(candidate))) continue;
            if (count() >= perCategory || groupCount() >= quota) break;
            ids.add(candidate.id); origins.add(sourceIdentity(candidate));
            data.candidates.push({ ...candidate, categories: [], collectionCategory: category.id, ...(group.subject ? { collectionSubject: group.subject } : {}), suggestedCategories: [category.id], sourceScreen: check, reviewStatus: 'pending' });
          }
          data.collection.completedTasks.push(task); await save(path, data);
          console.log(`${category.id}: ${count()}/${perCategory}; collected ${data.candidates.length} distinct candidates`);
          if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }
  }
  return data;
}
export async function screenBatch(data, { limit = 20, concurrency = 2, propose = proposeTags, read = readOriginal, checkpoint = async () => {}, references = [], retryFailed = false, cachePreview = async () => undefined } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000 || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) throw new Error('Use limit 1–1000 and concurrency 1–4');
  // Round-robin buckets so even a quota-limited partial run covers multiple categories.
  const groups = new Map();
  data.candidates.forEach((candidate, index) => {
    if (candidate.aiSuggestions || candidate.reviewStatus !== 'pending' || (candidate.screeningFailure && !retryFailed)) return;
    const category = candidate.collectionCategory || 'other';
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(index);
  });
  const queue = [];
  while ([...groups.values()].some(group => group.length)) for (const group of groups.values()) if (group.length) queue.push(group.shift());
  const work = queue.slice(0, limit); let position = 0, processed = 0, failure;
  let saving = Promise.resolve();
  const hashes = new Map(data.candidates.filter(c => c.thumbnailHash && c.aiSuggestions?.model !== 'duplicate-filter').map(c => [c.thumbnailHash, c.id]));
  const visualReferences = [...references, ...data.candidates.filter(c => c.visualFingerprint && !c.duplicateOf && !c.similarTo).map(c => ({id:c.id,fingerprint:c.visualFingerprint,creator:c.creator,subject:inferSubject(c)}))];
  const worker = async () => {
    while (!failure && position < work.length) {
      const index = work[position++], candidate = data.candidates[index];
      try {
        const bytes = await read({ ...candidate, ...(candidate.localPreviewFile ? {localFile:candidate.localPreviewFile} : {}), downloadUrl: candidate.thumbnailUrl || candidate.downloadUrl });
        const cached = await cachePreview(candidate,bytes); if(cached)candidate.localPreviewFile=cached;
        const normalized = await sharp(bytes, { limitInputPixels: 40000000 }).rotate().resize({ width: 128, height: 128, fit: 'inside' }).webp().toBuffer();
        const hash = createHash('sha256').update(normalized).digest('hex');
        const visualFingerprint = await fingerprint(bytes);
        const visualMatch = findSimilar(visualFingerprint, visualReferences.filter(c => c.id !== candidate.id), {creator:candidate.creator,subject:inferSubject(candidate)});
        const duplicate = hashes.get(hash) || (visualMatch?.kind === 'exact' ? visualMatch.id : null);
        if (!duplicate) hashes.set(hash, candidate.id);
        if (!visualMatch && !duplicate) visualReferences.push({id:candidate.id,fingerprint:visualFingerprint,creator:candidate.creator,subject:inferSubject(candidate)});
        const result = duplicate ? { ...candidate, thumbnailHash: hash, visualFingerprint, duplicateOf: duplicate,
          aiSuggestions: { reactionScore: 0, riskFlags: ['duplicate_image'], categories: [], model: 'duplicate-filter' } } :
          { ...await propose(candidate, bytes), thumbnailHash: hash, visualFingerprint, ...(visualMatch ? { similarTo: visualMatch.id, similarityReview: { ...visualMatch, status: 'pending' } } : {}) };
        if (!duplicate) {
          const assessed = findSimilar(visualFingerprint, visualReferences.filter(c => c.id !== candidate.id), {creator:candidate.creator,subject:inferSubject(result)});
          if (assessed) { result.similarTo=assessed.id; result.similarityReview={...assessed,status:'pending'}; }
          const registered=visualReferences.find(c=>c.id===candidate.id);
          if(registered)registered.subject=inferSubject(result);
        }
        delete result.screeningFailure;
        data.candidates[index] = result;
        saving = saving.then(() => checkpoint(data)); await saving; processed++;
        if (processed % 10 === 0) console.log(`Screened ${processed}/${work.length} this run`);
      } catch (error) {
        if (/^AI returned an invalid response$|^Invalid tagging response$/.test(error.message)) {
          // A refused/malformed answer belongs to this image; it cannot approve the image or block the rest of the batch.
          data.candidates[index]={...candidate,screeningFailure:{reason:'invalid_model_response',attempts:(candidate.screeningFailure?.attempts||0)+1,attemptedAt:new Date().toISOString()}};
          saving=saving.then(()=>checkpoint(data));await saving;processed++;
        } else failure ||= error;
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  await saving;
  if (failure) throw failure;
  return processed;
}
export function batchSummary(data) {
  return { candidates: data.candidates.length, published: false, screened: data.candidates.filter(c => c.aiSuggestions).length,
    approved: data.candidates.filter(c => c.reviewStatus === 'approved').length,
    subjectCounts: Object.fromEntries([...SUBJECT_IDS, 'unknown'].map(id => [id, data.candidates.filter(c => inferSubject(c) === id).length])),
    curatorHolds: data.candidates.filter(c=>c.curatorFlags?.length).length,
    screeningFailures: data.candidates.filter(c=>c.screeningFailure&&!c.aiSuggestions).length,
    duplicateCount: data.candidates.filter(c => c.duplicateOf).length, similarityHolds: data.candidates.filter(c => c.similarTo && c.similarityReview?.status !== 'distinct').length, requests: data.collection?.requests || 0,
    categories: STOCK_CATEGORIES.map(c => ({ id: c.id, target: data.collection?.settings.perCategory,
      candidates: data.candidates.filter(asset => asset.collectionCategory === c.id).length,
      strongUnflagged: data.candidates.filter(asset => asset.aiSuggestions?.reactionScore >= 70 && !asset.aiSuggestions.riskFlags?.length && !asset.curatorFlags?.length && !asset.duplicateOf && !asset.retiredAsSimilarTo && (!asset.similarTo || asset.similarityReview?.status === 'distinct') && asset.aiSuggestions.categories?.includes(c.id)).length })),
    disabledSources: data.collection?.disabledSources || {}, exclusions: data.collection?.exclusions || {} };
}
export async function batchCommand(command, options, workspace) {
  const path = resolve(workspace, options.input || options.out || 'media-work/stock-diverse/candidates.json');
  let data, failure;
  if (command === 'batch-collect') {
    const catalog = JSON.parse(await readFile(catalogPath(workspace), 'utf8'));
    data = await collectBatch({ path, perCategory: Number(options['per-category'] || 50), sources: (options.sources || 'commons').split(','), maxRequests: Number(options['max-requests'] || 120), exclude: [...catalog.assets, ...await loadExclusions(workspace)], retrySources: options['retry-sources'] === 'true', grow: options.grow === 'true' });
  } else {
    data = JSON.parse(await readFile(path, 'utf8'));
    if (command === 'batch-screen') {
      if (!process.env.GEMINI_MEDIA_API_KEY) throw new Error('Set GEMINI_MEDIA_API_KEY for vision screening');
      const references = await catalogReferences(workspace);
      const cachePreview = options['cache-previews'] === 'true' ? async (candidate,bytes) => {
        if(!/^[a-z0-9][a-z0-9-]{0,99}$/.test(candidate.id))throw new Error('Invalid preview cache ID');
        const directory=resolve(dirname(path),'previews');await mkdir(directory,{recursive:true});
        const cached=resolve(directory,candidate.id+'.webp');
        await writeFile(cached,await sharp(bytes,{limitInputPixels:40000000}).rotate().resize({width:640,height:640,fit:'inside',withoutEnlargement:true}).webp().toBuffer());return cached;
      } : undefined;
      try { await screenBatch(data, { references, cachePreview, retryFailed: options['retry-failed'] === 'true', limit: Number(options.limit || 20), concurrency: Number(options.concurrency || 2), checkpoint: value => save(path, value) }); }
      catch (error) { failure = error; }
    } else {
      const limit = Number(options.limit || 50);
      if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('Use import limit 1–1000');
      const catalog = JSON.parse(await readFile(catalogPath(workspace), 'utf8'));
      const existing = new Set(catalog.assets.map(asset => asset.id));
      const approved = data.candidates.filter(c => c.reviewStatus === 'approved' && !existing.has(c.id)).slice(0, limit);
      validateCatalog({ version: 1, assets: approved.map(reviewedMetadata) });
      for (let offset = 0; offset < approved.length; offset += 50) await importCandidates({ candidates: approved.slice(offset, offset + 50) }, options.storage || 'blob', workspace);
      console.log(`Imported ${approved.length} approved assets; existing IDs skipped on resume`);
    }
  }
  await writeBatchReview(path.replace(/\.json$/, '') + '.html', data);
  await save(path.replace(/\.json$/, '') + '.summary.json', batchSummary(data));
  console.log(`Saved ${data.candidates.length} candidates, review sheet and coverage summary. Only approved imports become game inventory.`);
  if (failure) throw failure;
}
