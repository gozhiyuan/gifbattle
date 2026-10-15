import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { metadataScreen, collectBatch, screenBatch, batchSummary } from './batch.mjs';
const photo = id => ({ id, source: 'pexels', sourceUrl: `https://www.pexels.com/photo/${id}`, creator: 'Photographer', attribution: { label: 'Credit' },
  license: 'Pexels License', licenseUrl: 'https://www.pexels.com/license/', width: 1200, height: 1000, mime: 'image/jpeg',
  downloadUrl: `https://images.pexels.com/photos/${id}.jpg`, thumbnailUrl: `https://images.pexels.com/photos/${id}.jpg`, reviewStatus: 'pending' });
test('metadata filter rejects incomplete credit, unsupported licenses, wrong hosts and tiny images', () => {
  assert.equal(metadataScreen(photo('a')).passed, true);
  for (const patch of [{ creator: '' }, { width: 200 }, { source: 'commons', license: 'CC BY-NC 4.0' }, { sourceUrl: 'https://evil.example' }]) assert.equal(metadataScreen({ ...photo('a'), ...patch }).passed, false);
});
test('collection checkpoints, deduplicates across buckets, respects budget and resumes without repeating completed searches', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gifbattle-batch-')); const path = join(dir, 'candidates.json'); let calls = 0;
  const categories = [{ id: 'awkward', queries: ['cat'] }, { id: 'panic', queries: ['dog'] }];
  const search = async (_source, query) => { calls++; return [photo('duplicate'), photo(query)]; };
  try {
    const first = await collectBatch({ path, categories, sources: ['pexels'], perCategory: 2, maxRequests: 1, delayMs: 0, search });
    assert.equal(first.candidates.length, 2); assert.equal(calls, 1);
    const next = await collectBatch({ path, categories, sources: ['pexels'], perCategory: 2, maxRequests: 3, delayMs: 0, search });
    assert.equal(next.candidates.length, 3); assert.equal(new Set(next.candidates.map(c => c.id)).size, 3); assert.equal(calls, 4);
    assert.ok(next.candidates.every(c => c.reviewStatus === 'pending' && c.categories.length === 0));
    assert.equal(JSON.parse(await readFile(path, 'utf8')).candidates.length, 3);
    await assert.rejects(collectBatch({ path, categories, sources: ['pexels'], perCategory: 3, search }), /settings differ/);
    const grown = await collectBatch({ path, categories, sources: ['pexels'], perCategory: 3, grow: true, maxRequests: 1, delayMs: 0, search });
    assert.equal(grown.collection.settings.perCategory, 3); assert.ok(grown.candidates.some(c => c.id === 'cat'));
  } finally { await rm(dir, { recursive: true }); }
});
test('a source authentication failure is checkpointed and other sources continue', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gifbattle-batch-'));
  try {
    const data = await collectBatch({ path: join(dir, 'c.json'), categories: [{ id: 'a', queries: ['cat'] }], sources: ['commons', 'pexels'], perCategory: 1, delayMs: 0,
      search: async source => { if (source === 'commons') throw new Error('Source request failed (401)'); return [photo('a')]; } });
    assert.equal(data.candidates.length, 1); assert.equal(data.collection.disabledSources.commons, 'credential_rejected');
  } finally { await rm(dir, { recursive: true }); }
});
test('screening deduplicates thumbnail content, checkpoints proposals and keeps review/rights metadata unchanged', async () => {
  const image = await sharp({ create: { width: 32, height: 32, channels: 3, background: 'red' } }).jpeg().toBuffer();
  const data = { candidates: [photo('a'), photo('b')] }; let calls = 0, saved = 0;
  await screenBatch(data, { concurrency: 2, limit: 2, read: async () => image,
    propose: async c => { calls++; return { ...c, aiSuggestions: { reactionScore: 80, riskFlags: [], categories: ['panic'] } }; }, checkpoint: async () => { saved++; } });
  assert.equal(calls, 1); assert.equal(saved, 2); const duplicates = data.candidates.filter(c => c.duplicateOf); assert.equal(duplicates.length, 1);
  assert.ok(data.candidates.some(c => c.id === duplicates[0].duplicateOf && !c.duplicateOf));
  assert.equal(data.candidates[0].license, 'Pexels License'); assert.equal(data.candidates[0].reviewStatus, 'pending');
  assert.equal(batchSummary(data).approved, 0);
  await screenBatch(data, { limit: 2, propose: async () => { throw new Error('already screened'); } });
});

test('review output embeds metadata as inert escaped JSON and offers score/category filters', async () => {
  const { writeBatchReview } = await import('./batch-review.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'gifbattle-review-'));
  try {
    const path = join(dir, 'review.html');
    await writeBatchReview(path, { candidates: [{ ...photo('a'), title: '</script><script>alert(1)</script>' }] });
    const html = await readFile(path, 'utf8');
    assert.ok(!html.includes('</script><script>alert(1)</script>'));
    assert.ok(html.includes('\\u003c/script>')); assert.ok(html.includes('Minimum reaction score'));
    assert.ok(html.includes('Download approved candidate JSON'));
  } finally { await rm(dir, { recursive: true }); }
});

test('subject-balanced collection reserves slots even when cats return plentiful results', async () => {
 const dir=await mkdtemp(join(tmpdir(),'gifbattle-subjects-'));
 try {
  const categories=[{id:'awkward',queries:['legacy cat'],subjectQueries:[{subject:'cats',queries:['cat']},{subject:'food',queries:['cake']},{subject:'objects',queries:['umbrella']}]}];
  const search=async(_source,query)=>Array.from({length:20},(_,i)=>photo(`${query}-${i}`));
  const data=await collectBatch({path:join(dir,'c.json'),categories,sources:['pexels'],perCategory:6,maxRequests:3,delayMs:0,search});
  assert.equal(data.candidates.length,6);
  assert.deepEqual(data.candidates.map(c=>c.collectionSubject),['cats','cats','food','food','objects','objects']);
  assert.equal(data.collection.settings.sourcingPolicy,'subject-balanced-v1');
 }finally{await rm(dir,{recursive:true});}
});

test('screening compares new images with the published catalog and holds near matches without discarding AI metadata', async () => {
 const {fingerprint}=await import('./similarity.mjs');
 const bytes=await sharp(Buffer.from('<svg width="120" height="100"><rect width="120" height="100" fill="white"/><circle cx="30" cy="30" r="20" fill="red"/><rect x="60" y="20" width="30" height="60" fill="black"/></svg>')).png().toBuffer();
 const compressed=await sharp(bytes).resize(240,200).jpeg({quality:65}).toBuffer();
 const data={candidates:[photo('new')]};
 await screenBatch(data,{limit:1,references:[{id:'published',fingerprint:await fingerprint(bytes)}],read:async()=>compressed,
 propose:async c=>({...c,aiSuggestions:{reactionScore:90,categories:['awkward'],riskFlags:[],primarySubject:'objects'}})});
 assert.equal(data.candidates[0].similarTo,'published');
 assert.equal(data.candidates[0].similarityReview.status,'pending');
 assert.equal(data.candidates[0].aiSuggestions.reactionScore,90);
 assert.equal(data.candidates[0].reviewStatus,'pending');
});

test('an invalid model response holds its candidate, checkpoints it and lets other images finish',async()=>{
 const data={candidates:[photo('bad'),photo('good')]};let calls=0,saved=0;
 await screenBatch(data,{limit:2,concurrency:1,read:async c=>sharp({create:{width:20,height:20,channels:3,background:c.id==='bad'?'red':'blue'}}).png().toBuffer(),
 propose:async c=>{calls++;if(c.id==='bad')throw new Error('AI returned an invalid response');return {...c,aiSuggestions:{reactionScore:90,riskFlags:[],categories:['awkward'],primarySubject:'objects'}};},checkpoint:async()=>saved++});
 assert.equal(data.candidates[0].screeningFailure.reason,'invalid_model_response');assert.equal(data.candidates[0].aiSuggestions,undefined);
 assert.ok(data.candidates[1].aiSuggestions);assert.equal(saved,2);assert.equal(batchSummary(data).screeningFailures,1);
 await screenBatch(data,{limit:2,propose:async()=>{throw new Error('Must skip failed and successful records on normal resume');}});assert.equal(calls,2);
});
