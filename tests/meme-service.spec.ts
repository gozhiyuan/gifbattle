import { expect, test } from '@playwright/test';
import { createMeme, MemeDependencies } from '../lib/media/meme-service';
import { captionLines, captionSvg, normalizeCaptions } from '../lib/media/meme-layout';
import { renderMeme } from '../lib/media/render-meme';
import { deleteTrackedMemes } from '../lib/media/meme-cleanup';
import { LocalAsset } from '../lib/media/catalog';
import manifest from '../public/media/catalog.json';
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
const template = manifest.assets[0] as LocalAsset;
function setup() {
  const gameId = Date.now() + 60000;
  const body = { code: 'ABC123', pid: 'player', token: 'secret', gameId, templateId: template.id, captions: ['Dinner is late'] };
  const room = { phase: 'submitting', submitDeadline: gameId, players: [{ id: 'player' }] };
  const writes: string[] = [];
  const deps: MemeDependencies = {
    getRoom: async () => room, validToken: async () => true, findTemplate: () => template,
    storageConfigured: () => true, rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
    render: async (asset, captions) => { expect(asset.url).toBe(template.url); expect(captions).toEqual(['Dinner is late']); return { image: Buffer.from('test'), width: 100, height: 100 }; },
    upload: async path => { writes.push(path); return `https://test.public.blob.vercel-storage.com/${path}`; },
    track: async () => { writes.push('tracked'); }, remove: async () => { writes.push('deleted'); },
  };
  return { body, room, deps, writes };
}
test('meme upload uses approved template metadata, temporary room path and retains license/captions', async () => {
  const { body, deps, writes } = setup();
  const result = await createMeme({ ...body, url: 'https://evil.example', attribution: { label: 'fake' } }, deps);
  expect(result).toMatchObject({ templateId: template.id, captions: body.captions, license: { label: 'CC BY-SA 4.0' } });
  expect(result.attribution.label).toContain('captions added by player');
  expect(writes[0]).toContain(`memes/ABC123/${body.gameId}/`);
  expect(writes[1]).toBe('tracked');
});
test('invalid tokens, expired rounds, unknown templates, malformed captions and missing storage cannot upload', async () => {
  for (const scenario of ['token', 'round', 'template', 'captions', 'storage', 'rate']) {
    const { body, room, deps, writes } = setup();
    if (scenario === 'token') deps.validToken = async () => false;
    if (scenario === 'round') room.phase = 'game_over';
    if (scenario === 'template') deps.findTemplate = () => undefined;
    if (scenario === 'captions') body.captions = ['x'.repeat(301)];
    if (scenario === 'storage') deps.storageConfigured = () => false;
    if (scenario === 'rate') deps.rateLimit = async () => ({ allowed: false, retryAfterSec: 60 });
    await expect(createMeme(body, deps)).rejects.toThrow();
    expect(writes).toEqual([]);
  }
});
test('render completion after a phase change does not upload; tracking failure removes the Blob', async () => {
  const first = setup();
  first.deps.render = async () => { first.room.phase = 'voting'; return { image: Buffer.alloc(0), width: 1, height: 1 }; };
  await expect(createMeme(first.body, first.deps)).rejects.toThrow('round_closed');
  expect(first.writes).toEqual([]);
  const second = setup(); second.deps.track = async () => { throw new Error('Redis unavailable'); };
  await expect(createMeme(second.body, second.deps)).rejects.toThrow('Redis unavailable');
  expect(second.writes.at(-1)).toBe('deleted');
});
test('captions normalize whitespace, escape SVG markup, wrap long words and stay within image bounds', () => {
  expect(normalizeCaptions(['  dinner\nnow '], 'bottom', 120)).toEqual(['dinner now']);
  expect(() => normalizeCaptions([''], 'bottom', 120)).toThrow();
  expect(() => normalizeCaptions(['a'], 'top-bottom', 120)).toThrow();
  const lines = captionLines(600, 400, ['X'.repeat(120), 'WHERE IS MY DINNER'], 'top-bottom');
  expect(lines.length).toBeGreaterThan(2);
  expect(lines.every(line => line.y > 0 && line.y < 400 && line.fontSize > 0)).toBe(true);
  expect(captionSvg(600, 400, ['<script>alert(1)</script> & "cat"'], 'bottom')).not.toContain('<script>');
});
test('server renders real captioned WebP from the licensed public test image', async () => {
  const result = await renderMeme(template, ['WHEN DINNER IS FIVE MINUTES LATE']);
  const metadata = await sharp(result.image).metadata();
  expect(metadata.format).toBe('webp');
  expect(metadata.width).toBe(template.width);
  expect(result.image.length).toBeGreaterThan(1000);
  await writeFile('/tmp/gifbattle-rendered-meme.webp', result.image);
});

test('meme cleanup preserves stock and other hosts; failed deletions keep expiry records for retry', async () => {
  const meme = 'https://test.public.blob.vercel-storage.com/memes/ABC123/123/file.webp';
  const calls: string[][] = [];
  expect(await deleteTrackedMemes([meme, 'https://test.public.blob.vercel-storage.com/stock/cat.webp',
    'https://evil.example/memes/ABC123/123/file.webp'], async urls => { calls.push(urls); }, async urls => { calls.push(urls); })).toBe(1);
  expect(calls).toEqual([[meme], [meme]]);
  let forgot = false;
  await expect(deleteTrackedMemes([meme], async () => { throw new Error('Blob unavailable'); }, async () => { forgot = true; })).rejects.toThrow();
  expect(forgot).toBe(false);
});

test('long captions render readable glyphs with the bundled font', async () => {
 const caption = 'When I said one more snack I meant the entire fridge and now the cat is judging my life choices from the kitchen counter';
 const lines = captionLines(template.width, template.height, [caption], 'bottom');
 expect(lines.length).toBeGreaterThan(1);
 expect(lines.every(line => line.fontSize >= template.width * 0.035)).toBe(true);
 const result = await renderMeme(template, [caption]);
 await writeFile('/tmp/gifbattle-long-meme.webp', result.image);
 const original = await sharp(`public${template.url}`).ensureAlpha().raw().toBuffer();
 const rendered = await sharp(result.image).ensureAlpha().raw().toBuffer();
 // The lower caption area must contain substantial white letter strokes.
 let white = 0, outline = 0;
 for(let i = Math.floor(rendered.length * 0.65 / 4) * 4; i < rendered.length; i += 4) {
  if(rendered[i]>235 && rendered[i+1]>235 && rendered[i+2]>235 && original[i]<210) white++;
  if(rendered[i]<35 && rendered[i+1]<35 && rendered[i+2]<35 && original[i]>100 && original[i+1]>100 && original[i+2]>100) outline++;
 }
 expect(white).toBeGreaterThan(1000);
 expect(outline).toBeGreaterThan(1000);
});
