#!/usr/bin/env node
import { readFile, writeFile, mkdir, rename, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {storeStock} from './stock-storage.mjs';
import { loadExclusions } from './stock-exclusions.mjs';
import { safetyPassed } from '../../lib/media/safety-policy.cjs';
import nextEnv from '@next/env';
import {sourceRequest} from './source-requests.mjs';
import { validateCatalog, safeHttps } from '../../lib/media/catalog-schema.cjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MAX_BYTES = 20 * 1024 * 1024;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plain = value => String(value ?? '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').trim();
const licenseLink = value => {
  try { const url = new URL(value); if (url.hostname === 'creativecommons.org' && url.protocol === 'http:') url.protocol = 'https:'; return url.href; } catch { return value || ''; }
};
const identifier = value => `commons-${createHash('sha256').update(value).digest('hex').slice(0, 16)}`;
const baseCandidate = (id, query) => ({ id, title: '', description: '', categories: [], tags: [query],
  reviewStatus: 'pending', permissionRecord: '', captionable: false });

export async function jsonRequest(url, headers = {}) {
  return sourceRequest(url,headers,true);
}
export async function searchCandidates(source, query, limit, page = 1) {
  if (!query?.trim() || !Number.isInteger(limit) || limit < 1 || limit > (source === 'pexels' ? 80 : 50) || !Number.isInteger(page) || page < 1) throw new Error('Use a query, limit 1–80 for Pexels or 1–50 for other sources, and positive page');
  if(source==='openverse'){const {searchOpenverse}=await import('./openverse.mjs');return searchOpenverse(query,limit,page);}
  if (source === 'pexels') {
    if (!process.env.PEXELS_API_KEY) throw new Error('Set server-only PEXELS_API_KEY in .env.local');
    const url = new URL('https://api.pexels.com/v1/search');
    url.search = new URLSearchParams({ query, per_page: String(limit), page: String(page) }).toString();
    const data = await jsonRequest(url, { Authorization: process.env.PEXELS_API_KEY });
    return data.photos.map(photo => ({ ...baseCandidate(`pexels-${photo.id}`, query), source: 'pexels',
      title: photo.alt || `Pexels photo ${photo.id}`, description: photo.alt || '', sourceUrl: photo.url,
      creator: photo.photographer, license: 'Pexels License', licenseUrl: 'https://www.pexels.com/license/',
      attribution: { label: `Photo by ${photo.photographer} on Pexels`, url: photo.url },
      width: photo.width, height: photo.height, mime: "image/jpeg", downloadUrl: photo.src.large2x, thumbnailUrl: photo.src.medium }));
  }
  if (source === 'commons') {
    if (page !== 1) throw new Error('Commons uses one bounded search batch; refine the query for more results');
    const url = new URL('https://commons.wikimedia.org/w/api.php');
    url.search = new URLSearchParams({ action: 'query', format: 'json', generator: 'search',
      gsrsearch: query, gsrnamespace: '6', gsrlimit: String(limit), prop: 'imageinfo',
      iiprop: 'url|size|mime|extmetadata', iiurlwidth: '400' }).toString();
    const data = await jsonRequest(url, { 'User-Agent': 'GIFBattlesAssetImporter/1.0 (offline catalog curation)' });
    return commonsCandidates(data, query);
  }
  throw new Error('Search source must be pexels or commons. Other licensed/original files can be imported with localFile.');
}

export function commonsCandidates(data, query) {
  return Object.values(data.query?.pages || {}).sort((a, b) => (a.index ?? Infinity) - (b.index ?? Infinity) || a.title.localeCompare(b.title)).flatMap(file => {
      const info = file.imageinfo?.[0];
      if (!info || !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(info.mime)) return [];
      const meta = info.extmetadata || {};
      return [{ ...baseCandidate(identifier(file.title), query), source: 'commons',
        title: file.title.replace(/^File:/, ''), description: plain(meta.ImageDescription?.value),
        sourceUrl: info.descriptionurl, creator: plain(meta.Artist?.value),
        license: plain(meta.LicenseShortName?.value), licenseUrl: licenseLink(meta.LicenseUrl?.value),
        attribution: { label: `${plain(meta.Artist?.value)} · ${plain(meta.LicenseShortName?.value)}`, url: info.descriptionurl },
        width: info.width, height: info.height, mime: info.mime, downloadUrl: info.url, thumbnailUrl: info.thumburl || info.url }];
    });
}

export async function readOriginal(candidate, workspace = ROOT) {
  if (candidate.localFile) {
    const path = resolve(workspace, candidate.localFile);
    if ((await stat(path)).size > MAX_BYTES) throw new Error(`${candidate.id}: original exceeds 20 MB`);
    return readFile(path);
  }
  const url = new URL(candidate.downloadUrl);
  const hosts = { pexels: ['images.pexels.com'], commons: ['upload.wikimedia.org', 'thumb.wikimedia.org'], met:['images.metmuseum.org'] };
  if (!safeHttps(url.href) || !(hosts[candidate.source]?.includes(url.hostname)||(candidate.source==='flickr'&&/^(live|farm[0-9]+|c[0-9]+)\.staticflickr\.com$/.test(url.hostname)))) throw new Error('Downloads only support Pexels/Commons hosts; use localFile for other approved sources');
  const response = await sourceRequest(url, { 'User-Agent': 'GIFBattlesAssetImporter/1.0 (offline catalog curation)' });
  if (!response.ok) {
    await response.body?.cancel();
    const error = new Error(`${candidate.id}: source download failed (${response.status})`); error.httpStatus = response.status; throw error;
  }
  if (!/^image\/(jpeg|png|gif|webp)(;|$)/i.test(response.headers.get('content-type') || '')) throw new Error(`${candidate.id}: invalid image response`);
  if (Number(response.headers.get('content-length')) > MAX_BYTES) { await response.body?.cancel(); throw new Error('Image exceeds 20 MB'); }
  const chunks = []; let size = 0;
  try {
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > MAX_BYTES) throw new Error('Image exceeds 20 MB');
      chunks.push(chunk);
    }
  } catch (error) { throw new Error(`${candidate.id}: download failed: ${error.message}`); }
  return Buffer.concat(chunks);
}

export async function prepareImage(bytes) {
  const options = { animated: true, limitInputPixels: 40000000 };
  const metadata = await sharp(bytes, options).metadata();
  if (!['jpeg', 'png', 'gif', 'webp'].includes(metadata.format)) throw new Error('Only JPEG, PNG, GIF and WebP imports are supported');
  if ((metadata.pages || 1) > 100) throw new Error('Animation exceeds 100 frames; trim it before importing');
  // rotate applies EXIF orientation; default output strips EXIF/location metadata.
  const full = await sharp(bytes, options).rotate().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  const preview = await sharp(bytes, { limitInputPixels: 40000000 }).rotate().resize({ width: 320, height: 320, fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();
  const output = await sharp(full, options).metadata();
  if (full.length > MAX_BYTES) throw new Error('Prepared asset exceeds 20 MB');
  return { full, preview, width: output.width, height: output.pageHeight || output.height,
    format: (output.pages || 1) > 1 ? 'animation' : 'image' };
}

export function reviewedMetadata(candidate) {
  if (candidate.reviewStatus !== 'approved') return null;
  if(candidate.curatorFlags?.length) throw new Error(`${candidate.id}: resolve curator concerns before importing`);
  if(candidate.duplicateOf || candidate.retiredAsSimilarTo || (candidate.similarTo && candidate.similarityReview?.status !== 'distinct')) throw new Error(`${candidate.id}: resolve duplicate/similarity hold before importing`);
  // Reuse the published schema to check review fields before any downloads/uploads.
  const { id, title, description, categories, tags, sourceUrl, creator, license, licenseUrl,
    permissionRecord, attribution, captionable, captionLayout, captionMaxLength, visualFingerprint, primarySubject, diversity, safety } = candidate;
  const safetyAssessment=safety||candidate.aiSuggestions?.safety;
  const asset = { id, title, description, categories, tags, sourceUrl, creator, license, licenseUrl,
    permissionRecord, attribution, captionable, ...(captionable ? { captionLayout, captionMaxLength } : {}),
    ...(safetyAssessment ? {safety:safetyAssessment} : {}), ...(visualFingerprint ? { visualFingerprint } : {}), ...(primarySubject ? { primarySubject } : {}),
    ...(diversity ? {diversity} : {}),
    reviewStatus: 'approved', format: 'image', width: 1, height: 1,
    url: '/media/placeholder.webp', previewUrl: '/media/placeholder-preview.webp' };
  validateCatalog({ version: 1, assets: [asset] });
  return asset;
}

async function saveJson(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, JSON.stringify(data, null, 2) + '\n');
  await rename(`${path}.tmp`, path);
}
export async function importCandidates(input, storage = 'static', workspace = ROOT) {
  if (!['static', 'blob'].includes(storage)) throw new Error('Storage must be static or blob');
  if (storage === 'blob' && !process.env.BLOB_READ_WRITE_TOKEN) throw new Error('Set BLOB_READ_WRITE_TOKEN for Blob imports');
  if (!Array.isArray(input.candidates) || input.candidates.length > 50) throw new Error('Expected up to 50 candidates');
  const approved = input.candidates.map(reviewedMetadata).filter(Boolean);
  validateCatalog({ version: 1, assets: approved }); // catches duplicate IDs before writes
  if (!approved.length) throw new Error('No approved candidates. Review candidates and record permission first.');
  const manifestPath = resolve(workspace, 'public/media/catalog.json');
  const catalog = validateCatalog(JSON.parse(await readFile(manifestPath, 'utf8')));
  for (const asset of approved) {
    if (catalog.assets.some(existing => existing.id === asset.id)) throw new Error(`${asset.id} already exists; use a new version ID for a replacement`);
  }
  if(input.candidates.some(c=>c.reviewStatus==='approved' && !safetyPassed(c)))throw new Error('Approved stock needs a current safe family/work assessment before import');
  const exclusions = await loadExclusions(workspace);
  if(approved.some(asset=>exclusions.some(excluded=>excluded.id===asset.id||excluded.sourceUrl===asset.sourceUrl))) throw new Error('Import includes retired repetitive stock; use a different asset');
  const additions = [];
  for (const asset of approved) {
    const candidate = input.candidates.find(c => c.id === asset.id);
    const image = await prepareImage(await readOriginal(candidate, workspace));
    if (image.format === 'animation' && asset.captionable) throw new Error('Animated templates are not captionable yet');
    const hash = createHash('sha256').update(image.full).digest('hex').slice(0, 16);
    const store = async (suffix, bytes) => {
      const name = `${asset.id}-${hash}${suffix}.webp`;
      if (storage === 'blob') {
        const { put,head } = await import('@vercel/blob');
        return storeStock(`stock/${name}`,bytes,{put,head});
      }
      const path = resolve(workspace, 'public/media', name);
      await writeFile(path, bytes, { flag: 'wx' });
      return `/media/${name}`;
    };
    const url = await store('', image.full);
    const previewUrl = await store('-preview', image.preview);
    additions.push({ ...asset, attribution: { ...asset.attribution, label: `${asset.attribution.label} · resized / converted to WebP` }, url, previewUrl, width: image.width, height: image.height, format: image.format });
  }
  const published = validateCatalog({ version: 1, assets: [...catalog.assets, ...additions] });
  await saveJson(manifestPath, published);
  return additions.length;
}

export async function writeReview(path, candidates) {
  const cards = candidates.map(c => `<article><h2>${escape(c.id)}</h2><img loading="lazy" src="${safeHttps(c.thumbnailUrl) ? escape(c.thumbnailUrl) : ''}" alt="${escape(c.title)}"><p>${escape(c.title)}</p><p>${escape(c.creator)} · ${escape(c.license)}</p><a href="${safeHttps(c.sourceUrl) ? escape(c.sourceUrl) : '#'}" target="_blank" rel="noreferrer">Check source and license</a></article>`).join('');
  await writeFile(path, `<!doctype html><html><head><meta charset="utf-8"><title>GIF Battles candidate review</title><style>body{font-family:system-ui;margin:24px;background:#eee}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}article{background:white;padding:16px}img{width:100%;height:220px;object-fit:contain}h2{font-size:16px;overflow-wrap:anywhere}</style></head><body><h1>Candidate review</h1><p>These are candidates, not approved inventory. Preview images load from their source. Edit the companion JSON with categories, tags, permission record and approval after reviewing each source.</p><main>${cards}</main></body></html>`);
}

async function main() {
  nextEnv.loadEnvConfig(ROOT);
  const [command, ...args] = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i].startsWith('--') || !args[i + 1]) throw new Error('Use --option value pairs');
    options[args[i].slice(2)] = args[i + 1];
  }
  if(command==='growth-status'){const {growthStatus}=await import('./grow-library.mjs');const result=await growthStatus(ROOT,options.state);console.log(JSON.stringify({...result,queries:Object.keys(result.queries).length},null,2));
  } else if(command==='grow-library'){const {growthCommand}=await import('./grow-library.mjs');await growthCommand(options,ROOT);
  } else if(command==='pilot-collect'){const {pilotCommand}=await import('./pilot.mjs');await pilotCommand(options,ROOT);
  } else if(command?.startsWith('archive-')){const {archiveCommand}=await import('./archive-runner.mjs');await archiveCommand(command,options,ROOT);
  } else if (command === 'collect-humor') {
    const { collectHumorCommand } = await import('./commons-humor.mjs');
    await collectHumorCommand(options,ROOT);
  } else if (command === 'gallery') {
    const { writeGallery } = await import('./gallery.mjs');
    await writeGallery(ROOT);
  } else if (command === 'audit-similarity') {
    const { auditCatalog } = await import('./similarity-index.mjs');
    await auditCatalog(ROOT);
  } else if (command === 'search') {
    const candidates = await searchCandidates(options.source, options.query, Number(options.limit || 20), Number(options.page || 1));
    const path = resolve(ROOT, options.out || 'media-work/candidates.json');
    await saveJson(path, { version: 1, candidates });
    await writeReview(path.replace(/\.json$/, '') + '.html', candidates);
    console.log(`Saved ${candidates.length} pending candidates to ${path} and companion HTML review.`);
  } else if (command === 'publish-shortlist') {
    if (!options.input) throw new Error('Use --input reviewed/screened candidate JSON');
    const { publishShortlist } = await import('./publish-shortlist.mjs');
    await publishShortlist(resolve(ROOT, options.input), ROOT, { storage: options.storage || 'blob', minimum: Number(options['min-score'] || 80), maxSubjectShare: Number(options['max-subject-share'] || 0.25), limit: Number(options.limit || 50), sources: (options.sources || 'commons,pexels,met,flickr').split(',') });
  } else if (command === 'batch-collect' || command === 'batch-screen' || command === 'batch-import') {
    const { batchCommand } = await import('./batch.mjs');
    await batchCommand(command, options, ROOT);
  } else if (command === 'collect') {
    const queries = ['cat yawning', 'dog expression', 'cat surprised', 'dog sleeping', 'cat hiding', 'dog jumping'];
    const source = options.source || 'commons';
    const limit = Number(options.limit || 8);
    if (!Number.isInteger(limit) || limit < 1 || limit > 8) throw new Error('Use limit 1–8 per query (at most 48 candidates)');
    const candidates = new Map();
    const path = resolve(ROOT, options.out || 'media-work/first-stock.json');
    for (const query of queries) {
      for (const candidate of await searchCandidates(source, query, limit)) if (!candidates.has(candidate.id)) candidates.set(candidate.id, candidate);
      await saveJson(path, { version: 1, candidates: [...candidates.values()] });
    }
    await writeReview(path.replace(/\.json$/, '') + '.html', [...candidates.values()]);
    console.log(`Saved ${candidates.size} pending candidates. Review the contact sheet before downloading or publishing.`);
  } else if (command === 'tag') {
    if (!options.input) throw new Error('Use --input candidate JSON');
    const { proposeTags } = await import('./ai.mjs');
    const input = JSON.parse(await readFile(resolve(ROOT, options.input), 'utf8'));
    const limit = Number(options.limit || 10);
    if (!Array.isArray(input.candidates) || !Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error('Use limit 1–20');
    const path = resolve(ROOT, options.out || 'media-work/tagged.json');
    for (let i = 0; i < Math.min(limit, input.candidates.length); i++) {
      const candidate = input.candidates[i];
      input.candidates[i] = await proposeTags(candidate, await readOriginal(candidate));
      await saveJson(path, input);
    }
    console.log(`Saved AI proposals to ${path}. Review and copy useful proposals into metadata; rights and approval are unchanged.`);
  } else if (command === 'generate') {
    if (!options.input && (!options.prompt || !options.id)) throw new Error('Use --prompt "expressive cat" --id original-cat-001');
    const { generateOriginal } = await import('./ai.mjs');
    const path = resolve(ROOT, options.out || 'media-work/generated.json');
    const prompts = options.input ? JSON.parse(await readFile(resolve(ROOT, options.input), 'utf8')).prompts : [{ prompt: options.prompt, id: options.id }];
    if (!Array.isArray(prompts) || !prompts.length || prompts.length > 10 || prompts.some(p => typeof p.prompt !== 'string' || !p.prompt.trim() || p.prompt.length > 2000 || !/^[a-z0-9][a-z0-9-]{2,79}$/.test(p.id)) || new Set(prompts.map(p => p.id)).size !== prompts.length) throw new Error('Use 1–10 distinct safe IDs and nonempty prompts up to 2000 characters');
    const candidates = [];
    for (const entry of prompts) {
      candidates.push(await generateOriginal(entry.prompt, entry.id, dirname(path)));
      await saveJson(path, { version: 1, candidates });
    }
    console.log(`Saved original draft to ${path}. Review the image and provider terms, assign metadata/license, then import.`);
  } else if (command === 'moderate') {
    const { moderationCommand } = await import('./moderate.mjs');
    await moderationCommand(options, ROOT);
  } else if (command === 'import') {
    if (!options.input) throw new Error('Use --input path/to/reviewed.json');
    const count = await importCandidates(JSON.parse(await readFile(resolve(ROOT, options.input), 'utf8')), options.storage || 'static');
    console.log(`Published ${count} assets. Commit the catalog and static assets, then redeploy.`);
  } else if (command === 'validate') {
    const catalog = validateCatalog(JSON.parse(await readFile(resolve(ROOT, 'public/media/catalog.json'), 'utf8')));
    for (const asset of catalog.assets) for (const url of [asset.url, asset.previewUrl]) {
      if (url.startsWith('/media/')) await stat(resolve(ROOT, `public${url}`));
    }
    console.log(`Catalog valid: ${catalog.assets.length} assets. External Blob availability is checked by deployment/playtest.`);
  } else {
    console.log('Commands: collect-humor --limit 120 --depth 1 --max-requests 12 --out media-work/commons-humor/candidates.json\ngallery\naudit-similarity\nbatch-collect --sources commons,pexels --per-category 50 --out media-work/stock-diverse/candidates.json\nbatch-screen --input media-work/stock-diverse/candidates.json --limit 20\nbatch-import --input media-work/approved.json --storage blob --limit 50\ncollect --source commons|pexels --limit 8 --out media-work/first-stock.json\ntag --input media-work/cats.json --limit 10 --out media-work/tagged.json\ngenerate --prompt \"an expressive confused cat\" --id original-cat-001\nmoderate --site https://gifbattles.com --action list|approve|reject|export|stats --id ID\nsearch --source pexels|commons --query "angry cat" --limit 20 --out media-work/cats.json\nimport --input media-work/cats.json --storage static|blob\nvalidate');
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.message + (error.httpStatus ? ` (HTTP ${error.httpStatus})` : '')); process.exitCode = 1; });
