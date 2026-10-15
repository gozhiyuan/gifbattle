import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { importCandidates, prepareImage, readOriginal, searchCandidates } from './library.mjs';
import {normalizeSafety,SAFETY_CATEGORIES} from '../../lib/media/safety-policy.cjs';
const safety=normalizeSafety({safeForChildren:true,safeForWork:true,checks:Object.fromEntries(SAFETY_CATEGORIES.map(key=>[key,'clear']))});
const fixture = {
  safety, id: 'cat-dinner', title: 'Cat waiting for dinner', description: 'A hungry cat', format: 'image',
  width: 40, height: 20, url: '/media/cat.webp', previewUrl: '/media/cat-preview.webp',
  categories: ['awkward'], tags: ['cat', 'hungry'], creator: 'Test creator', license: 'CC0',
  sourceUrl: 'https://example.com/cat', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  permissionRecord: 'Reviewed fixture', reviewStatus: 'approved',
  attribution: { label: 'Test creator · CC0', url: 'https://example.com/cat' },
  captionable: true, captionLayout: 'top-bottom', captionMaxLength: 120,
};

test('static import prepares approved local files, skips pending entries and prevents overwrite', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'gifbattle-stock-'));
  try {
    await mkdir(join(workspace, 'public/media'), { recursive: true });
    await writeFile(join(workspace, 'public/media/catalog.json'), '{"version":1,"assets":[]}');
    const png = await sharp({ create: { width: 1600, height: 800, channels: 3, background: '#663399' } }).png().toBuffer();
    await writeFile(join(workspace, 'cat.png'), png);
    const candidate = { ...fixture, localFile: 'cat.png' };
    assert.equal(await importCandidates({ candidates: [candidate, { ...candidate, id: 'pending', reviewStatus: 'pending' }] }, 'static', workspace), 1);
    const catalog = JSON.parse(await readFile(join(workspace, 'media-work/catalog.json'), 'utf8'));
    const asset = catalog.assets[0];
    assert.equal(asset.width, 1200); assert.equal(asset.height, 600); assert.equal(asset.captionable, true); assert.equal(asset.format, 'image');
    assert.equal(asset.localFile, undefined);
    const preview = await sharp(await readFile(join(workspace, `public${asset.previewUrl}`))).metadata();
    assert.equal(preview.width, 320);
    await assert.rejects(importCandidates({ candidates: [candidate] }, 'static', workspace), /already exists/);
  } finally { await rm(workspace, { recursive: true, force: true }); }
});

test('image preparation rejects executable/non-image data and downloader rejects untrusted hosts', async () => {
  await assert.rejects(prepareImage(Buffer.from('<svg><script>alert(1)</script></svg>')));
  await assert.rejects(readOriginal({ source: 'commons', downloadUrl: 'https://evil.example/photo.jpg' }), /Downloads only support/);
});

test('source search validates parameters before networking', async () => {
  await assert.rejects(searchCandidates('commons', 'cat', 100), /limit/);
  await assert.rejects(searchCandidates('unsplash', 'cat', 10), /Search source/);
});

test('animation preparation retains frames and generates a still preview', async () => {
  const original = await sharp('public/powered-by-giphy.gif', { animated: true, pages: 20 }).gif().toBuffer();
  const result = await prepareImage(original);
  assert.equal(result.format, 'animation');
  assert.equal((await sharp(result.full, { animated: true }).metadata()).pages, (await sharp(original, { animated: true }).metadata()).pages);
  assert.equal((await sharp(result.preview).metadata()).pages || 1, 1);
  assert.equal(result.height, 42);
});

test('Pexels search maps API response to pending candidates and keeps API key out of output', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.PEXELS_API_KEY;
  process.env.PEXELS_API_KEY = 'test-secret';
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(options.headers.Authorization, 'test-secret');
      assert.equal(url.searchParams.get('query'), 'cat & dog');
      assert.equal(url.searchParams.get('page'), '2');
      return Response.json({ photos: [{ id: 123, alt: 'Hungry cat', url: 'https://www.pexels.com/photo/123',
        photographer: 'Creator', src: { large2x: 'https://images.pexels.com/full.jpg', medium: 'https://images.pexels.com/preview.jpg' } }] });
    };
    const result = await searchCandidates('pexels', 'cat & dog', 20, 2);
    assert.equal(result[0].reviewStatus, 'pending');
    assert.equal(result[0].creator, 'Creator');
    assert.equal(result[0].downloadUrl, 'https://images.pexels.com/full.jpg');
    assert.equal(JSON.stringify(result).includes('test-secret'), false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.PEXELS_API_KEY; else process.env.PEXELS_API_KEY = originalKey;
  }
});

test('Commons search strips source HTML and rejects unsupported file formats from candidate batch', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ query: { pages: {
      1: { title: 'File:Cat.jpg', index: 1, imageinfo: [{ mime: 'image/jpeg', url: 'https://upload.wikimedia.org/cat.jpg',
        descriptionurl: 'https://commons.wikimedia.org/wiki/File:Cat.jpg', extmetadata: {
          Artist: { value: '<a href="/">Creator</a>' }, LicenseShortName: { value: 'CC0' },
          LicenseUrl: { value: 'https://creativecommons.org/publicdomain/zero/1.0/' }, ImageDescription: { value: '<p>Sleepy cat</p>' },
        } }] },
      2: { title: 'File:Cat.svg', index: 2, imageinfo: [{ mime: 'image/svg+xml' }] },
    } } });
    const result = await searchCandidates('commons', 'cat', 10);
    assert.equal(result.length, 1);
    assert.equal(result[0].creator, 'Creator');
    assert.equal(result[0].description, 'Sleepy cat');
    assert.equal(result[0].reviewStatus, 'pending');
  } finally { globalThis.fetch = originalFetch; }
});
