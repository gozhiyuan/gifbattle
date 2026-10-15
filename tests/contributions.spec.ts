import { test, expect } from '@playwright/test';
import { contributeMeme, ContributionDependencies, ContributionRecord } from '../lib/media/contribution-service';
import { suggestCaptions } from '../lib/media/caption-suggestions';
import { stockEventAssets } from '../lib/media/stock-metrics';
import manifest from '../public/media/catalog.json';
import { LocalAsset } from '../lib/media/catalog';
function setup() {
  const url = 'https://test.public.blob.vercel-storage.com/memes/ABC123/123/file.webp';
  const body = { code: 'ABC123', pid: 'owner', token: 'token', gameId: 123, url, consent: true };
  const receipt = { ...body, templateId: manifest.assets[0].id, captions: ['Dinner please'] };
  const writes: string[] = []; let record: ContributionRecord;
  const deps: ContributionDependencies = {
    authorized: async () => true, receipt: async () => receipt, template: () => manifest.assets[0] as LocalAsset,
    existing: async () => null, lock: async () => true, unlock: async () => { writes.push('unlocked'); }, limit: async () => true,
    copy: async (from, path) => { expect(from).toBe(url); writes.push(path); return `https://test.public.blob.vercel-storage.com/${path}`; },
    save: async value => { record = value; writes.push('saved'); }, remove: async () => { writes.push('removed'); },
  };
  return { body, receipt, deps, writes, record: () => record };
}
test('opt-in contribution copies only the owned receipt and keeps canonical credits, captions and consent', async () => {
  const s = setup(); const result = await contributeMeme({ ...s.body, captions: ['FAKE'], license: 'FAKE' }, s.deps);
  expect(result.status).toBe('pending'); expect(s.writes[0]).toMatch(/^contributions\/[a-f0-9]{32}\.webp$/);
  expect(s.record()).toMatchObject({ captions: ['Dinner please'], template: { license: 'CC BY-SA 4.0' }, consentVersion: 'caption-sharing-v1' });
  expect(s.record()).not.toHaveProperty('pid'); expect(s.record()).not.toHaveProperty('token');
});
test('missing consent, forged URLs, another owner, invalid token and missing receipts cannot create contributions', async () => {
  for (const scenario of ['consent', 'url', 'owner', 'auth', 'receipt']) {
    const s = setup();
    if (scenario === 'consent') s.body.consent = false;
    if (scenario === 'url') s.body.url = 'https://test.public.blob.vercel-storage.com/stock/file.webp';
    if (scenario === 'owner') s.receipt.pid = 'other';
    if (scenario === 'auth') s.deps.authorized = async () => false;
    if (scenario === 'receipt') s.deps.receipt = async () => null;
    await expect(contributeMeme(s.body, s.deps)).rejects.toThrow(); expect(s.writes).toEqual([]);
  }
});
test('retries deduplicate, rejected records cannot reappear, and queue failures remove the copied image', async () => {
  const first = setup(); first.deps.existing = async () => ({ id: 'existing', status: 'pending' });
  expect((await contributeMeme(first.body, first.deps)).status).toBe('pending'); expect(first.writes).toEqual([]);
  first.deps.existing = async () => ({ id: 'existing', status: 'rejected' });
  await expect(contributeMeme(first.body, first.deps)).rejects.toThrow('contribution_rejected');
  const second = setup(); second.deps.save = async () => { throw new Error('queue failed'); };
  await expect(contributeMeme(second.body, second.deps)).rejects.toThrow('queue failed');
  expect(second.writes.slice(-2)).toEqual(['removed', 'unlocked']);
});
test('stock metrics require canonical submissions and voter eligibility; each vote maps to its actual side', () => {
  const room = { phase: 'submitting', submitDeadline: Date.now() + 60000, submissions: {
    owner: [{ source: 'local', assetId: 'local:cat' }], other: [{ source: 'giphy', assetId: 'giphy:dog' }] },
    roundPlan: [{ participants: ['owner', 'other'] }], votingRound: 0, currentMatchup: 0, matchups: [['owner', 'other']] };
  expect(stockEventAssets(room, 'owner', 0, 0, 'exposed', ['cat'])).toEqual(['cat']);
  expect(stockEventAssets(room, 'viewer', 0, 0, 'exposed', ['cat'])).toEqual([]);
  expect(stockEventAssets(room, 'owner', 0, 0, 'selected', ['dog'])).toEqual([]);
  expect(stockEventAssets(room, 'owner', 0, 0, 'selected', ['cat'])).toEqual(['cat']);
  room.phase = 'voting';
  expect(stockEventAssets(room, 'viewer', 0, 0, 'vote_exposed', ['cat', 'dog'])).toEqual(['cat']);
  expect(stockEventAssets(room, 'owner', 0, 0, 'voted', ['cat'], 'left')).toEqual([]);
  expect(stockEventAssets(room, 'viewer', 0, 0, 'voted', ['cat'], 'right')).toEqual([]);
  expect(stockEventAssets(room, 'viewer', 0, 0, 'voted', ['cat'], 'left')).toEqual(['cat']);
});

test('caption suggestions use image and round context, filter malformed captions and preserve the required layout', async () => {
  const template = { ...manifest.assets[0], captionLayout: 'top-bottom', captionMaxLength: 30 } as LocalAsset;
  const fetcher: typeof fetch = async (_url, init) => {
    const request = JSON.parse(String(init.body));
    expect(request.contents[0].parts[0].text).toContain('When dinner arrives');
    expect(request.contents[0].parts[1].inlineData.data).toBe(Buffer.from('image').toString('base64'));
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ suggestions: [['WAITING FOR DINNER', 'STILL WAITING'], ['wrong layout'], ['x'.repeat(31), 'too long']] }) }] } }] });
  };
  expect(await suggestCaptions(template, 'When dinner arrives', 'secret', Buffer.from('image'), fetcher)).toEqual([['WAITING FOR DINNER', 'STILL WAITING']]);
});
