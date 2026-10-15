import { test } from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSafety,SAFETY_CATEGORIES} from '../../lib/media/safety-policy.cjs';
const safe=normalizeSafety({safeForChildren:true,safeForWork:true,checks:Object.fromEntries(SAFETY_CATEGORIES.map(key=>[key,'clear']))});
import { strictCandidate } from './publish-shortlist.mjs';
const candidate = {
  id: 'pexels-test', source: 'pexels', sourceUrl: 'https://www.pexels.com/photo/test', creator: 'Creator',
  license: 'Pexels License', licenseUrl: 'https://www.pexels.com/license/', attribution: { label: 'Photo by Creator on Pexels', url: 'https://www.pexels.com/photo/test' },
  width: 1200, height: 1000, mime: 'image/jpeg', downloadUrl: 'https://images.pexels.com/photos/test.jpeg', reviewStatus: 'pending',
  aiSuggestions: { safety:safe, title: 'Suspicious cat', description: 'A cat giving a side eye', categories: ['suspicious'], tags: ['cat', 'side-eye'],
    captionable: true, captionLayout: 'bottom', reactionScore: 85, riskFlags: [], model: 'fixture' }
};
test('strict publication accepts only strong unflagged permitted stills and retains credits and license evidence', () => {
  const record = strictCandidate(candidate);
  assert.equal(record.reviewStatus, 'approved'); assert.equal(record.captionable, true); assert.equal(record.captionMaxLength, 120);
  assert.equal(record.sourceUrl, candidate.sourceUrl); assert.equal(record.creator, candidate.creator); assert.equal(record.license, candidate.license);
  assert.match(record.permissionRecord, /No license inferred by AI/);
  for (const patch of [ { license: 'unknown' }, { mime: 'image/gif' }, { width: 10000, height: 10000 }, { duplicateOf: 'other' }, { curatorFlags: ['recognizable_person_requires_review'] }, { retiredAsSimilarTo:'other' },
    { aiSuggestions: { ...candidate.aiSuggestions, reactionScore: 79 } }, { aiSuggestions: { ...candidate.aiSuggestions, riskFlags: ['brand'] } },
    { aiSuggestions: { ...candidate.aiSuggestions, categories: ['madeup'] } } ]) assert.equal(strictCandidate({ ...candidate, ...patch }), null);
});

test('publication stops adding to an overrepresented subject and holds unknown subjects', async()=>{
 const {subjectQuotaReason}=await import('./publish-shortlist.mjs');
 const counts=new Map([['cats',40],['dogs',15],['food',1]]);
 assert.equal(subjectQuotaReason('cats',counts,68),'subject_quota');
 assert.equal(subjectQuotaReason('food',counts,68),null);
 assert.equal(subjectQuotaReason('unknown',counts,68),'subject_assessment_required');
 assert.equal(subjectQuotaReason('art',new Map(),1),null);
});

test('sensitive source metadata holds a candidate even if its visual model marked it safe',()=>{
 assert.equal(strictCandidate({...candidate,title:'Taxidermy animals playing cards'}),null);
 assert.equal(strictCandidate({...candidate,description:'Historical antisemitic caricature'}),null);
 assert.equal(strictCandidate({...candidate,aiSuggestions:{...candidate.aiSuggestions,captionable:false}}),null);
});

test('offline publication dry run counts image/preview/catalog uploads without calling any services',async()=>{
 const {mkdtemp,mkdir,writeFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const {publicationDryRun}=await import('./publish-shortlist.mjs');const {fingerprint}=await import('./similarity.mjs');const sharp=(await import('sharp')).default;
 const dir=await mkdtemp(join(tmpdir(),'shortlist-plan-')),originalFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Dry run must be offline');};
 try{await mkdir(join(dir,'media-work'),{recursive:true});await writeFile(join(dir,'media-work/catalog.json'),JSON.stringify({version:1,assets:[]}));
 const fp=await fingerprint(await sharp({create:{width:32,height:32,channels:3,background:'#0088ff'}}).png().toBuffer());
 await writeFile(join(dir,'input.json'),JSON.stringify({candidates:[{...candidate,visualFingerprint:fp}]}));const result=await publicationDryRun(join(dir,'input.json'),dir);
 assert.equal(result.ready.length,1);assert.equal(result.operations.imageUploads,2);assert.equal(result.operations.catalogUploads,1);assert.equal(result.operations.total,3);assert.equal(result.operations.fits,false);assert.equal(result.operations.quotaStatus,'not_configured');
 }finally{globalThis.fetch=originalFetch;await rm(dir,{recursive:true,force:true});}
});

test('real publisher refuses an unconfigured upload budget before any source or Blob requests',async()=>{
 const {mkdtemp,mkdir,writeFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');const {publishShortlist}=await import('./publish-shortlist.mjs');
 const dir=await mkdtemp(join(tmpdir(),'shortlist-block-')),originalFetch=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('No network expected');};
 try{await mkdir(join(dir,'media-work'),{recursive:true});await writeFile(join(dir,'media-work/catalog.json'),JSON.stringify({version:1,assets:[]}));await writeFile(join(dir,'input.json'),JSON.stringify({candidates:[candidate]}));
 await assert.rejects(publishShortlist(join(dir,'input.json'),dir),/Stock upload budget blocked/);assert.equal(calls,0);
 }finally{globalThis.fetch=originalFetch;await rm(dir,{recursive:true,force:true});}
});
