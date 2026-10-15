import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { proposeTags, generateOriginal } from './ai.mjs';
import { generateMediaJson } from '../../lib/media/gemini-json.cjs';
const image = await sharp({ create: { width: 32, height: 32, channels: 3, background: 'red' } }).webp().toBuffer();
test('AI tagging preserves permission metadata and review state; only proposals are added', async () => {
  const candidate = { id: 'cat', reviewStatus: 'pending', license: 'CC BY-SA', sourceUrl: 'https://example.com', permissionRecord: '' };
  const result = await proposeTags(candidate, image, { key: 'test-secret', fetcher: async (_url, init) => {
    const body = JSON.parse(init.body); assert.equal(body.contents[0].parts[1].inlineData.mimeType, 'image/webp');
    assert.equal(init.headers['x-goog-api-key'], 'test-secret');
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ title: 'Cat', description: 'Red cat', tags: ['cat'], categories: ['awkward', 'madeup'], license: 'FAKE', reviewStatus: 'approved' }) }] } }] });
  } });
  assert.equal(result.reviewStatus, 'pending'); assert.equal(result.license, 'CC BY-SA'); assert.equal(result.permissionRecord, '');
  assert.deepEqual(result.aiSuggestions.categories, ['awkward']); assert.ok(!JSON.stringify(result).includes('test-secret'));
});
test('AI JSON errors are generic and malformed structured output is rejected', async () => {
  await assert.rejects(generateMediaJson({ key: 'secret', prompt: 'test', schema: {}, fetcher: async () => new Response('secret provider body', { status: 403 }) }), /AI request failed/);
  await assert.rejects(generateMediaJson({ key: 'secret', prompt: 'test', schema: {}, fetcher: async () => Response.json({ candidates: [] }) }), /invalid response/);
});
test('generated images become bounded pending files with provenance, never approved stock', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gifbattle-generated-'));
  try {
    const result = await generateOriginal('a confused cat', 'original-cat-001', directory, { key: 'secret', fetcher: async () => Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/webp', data: image.toString('base64') } }] } }] }) });
    assert.equal(result.reviewStatus, 'pending'); assert.equal(result.license, ''); assert.equal(result.provenance.prompt, 'a confused cat');
    assert.equal((await sharp(await readFile(result.localFile)).metadata()).format, 'webp');
    await assert.rejects(generateOriginal('x', '../unsafe', directory, { key: 'secret' }), /safe asset ID/);
  } finally { await rm(directory, { recursive: true }); }
});

test('humor assessments preserve interaction and caption-potential metadata without granting approval',async()=>{
 const candidate={id:'interaction',reviewStatus:'pending',license:'CC BY 4.0',permissionRecord:''};
 const result=await proposeTags(candidate,image,{key:'test-secret',fetcher:async(_url,init)=>{
  const body=JSON.parse(init.body);assert.ok(body.generationConfig.responseJsonSchema.required.includes('captionPotentialScore'));
  return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({title:'Two animals at dinner',description:'One watches another eat',primarySubject:'other-animals',sceneDescription:'Two animals, one bowl',interactionDescription:'One eats while the other waits',interactionScore:88,captionPotentialScore:90,captionAngles:['Me versus my roommate','The last slice'],tags:['dinner','waiting'],categories:['waiting'],reactionScore:85,riskFlags:[],captionable:true,captionLayout:'bottom'})}]}}]});
 }});
 assert.equal(result.reviewStatus,'pending');assert.equal(result.license,'CC BY 4.0');assert.equal(result.aiSuggestions.interactionScore,88);assert.equal(result.aiSuggestions.captionPotentialScore,90);assert.deepEqual(result.aiSuggestions.captionAngles,['Me versus my roommate','The last slice']);
});
