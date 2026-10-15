import { expect, test, Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { installGameApiMocks } from './helpers/mock-api';

async function submissionScreen(page: Page) {
  const store = new Map<string, string>();
  await installGameApiMocks(page.context(), store);
  await page.route('**/api/gif-events', route => route.fulfill({ json: { ok: true } }));
  await page.goto('/');
  await page.getByPlaceholder('Your nickname').fill('Host');
  await page.getByRole('button', { name: /create room/i }).click();
  await expect(page.getByText('LOBBY', { exact: true })).toBeVisible();
  const code = await page.evaluate(() => localStorage.getItem('gifbattle_last_room')!);
  const key = `gifbattle:room:${code}`;
  const room = JSON.parse(store.get(key)!);
  Object.assign(room, { phase: 'submitting', prompts: ['When dinner arrives'], rounds: 1, answerModeOverrides: {0:'meme'},
    players: [...room.players, { id: 'guest', nickname: 'Guest', score: 0 }],
    submitDeadline: Date.now() + 180000 });
  store.set(key, JSON.stringify(room));
  await expect(page.getByText('"When dinner arrives"', { exact: true })).toBeVisible();
  await expect(page.getByText(/This question uses one answer mode/)).toBeVisible();
  return { store, key, room };
}

test('meme templates replace Our Picks, browse without provider quota, and warn before AI generation without a key', async ({ page }) => {
  let providerCalls = 0;
  await page.route('**/api/gif-search-budget', route => { providerCalls++; return route.fulfill({ status: 429 }); });
  const {store,key,room}=await submissionScreen(page);
  await expect(page.getByRole('button', { name: 'Our Picks', exact: true })).toHaveCount(0);
  await page.getByPlaceholder('Your answer or meme idea…').fill('zzzznonexistentpick');
  await page.getByRole('button', {name:'Search',exact:true}).click();
  await expect(page.getByText('No matching picks. Try another category or search.')).toBeVisible();
  await page.getByPlaceholder('Your answer or meme idea…').fill('cat');
  await page.getByRole('button', {name:'Search',exact:true}).click();
  await expect(page.getByRole('button', { name: 'Select When the meeting keeps going' })).toBeVisible();
  expect(providerCalls).toBe(0);
  await expect(page.getByLabel('Required answer mode')).toContainText('Meme answer');
  await expect(page.getByRole('status').filter({hasText:'Add a Gemini key'})).toContainText('Add a Gemini key');
  await page.getByPlaceholder('Your answer or meme idea…').fill('My answer');
  await expect(page.getByRole('button', { name: 'Generate image with AI', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Submit', exact: true })).toBeEnabled();
});

test('an empty meme catalog still permits written answers within Meme mode', async ({ page }) => {
  await page.route('**/api/media/catalog?**', route => route.fulfill({ json: { items: [] } }));
  const {store,key}=await submissionScreen(page);
  await expect(page.getByLabel('Required answer mode')).toContainText('Meme answer');
  await expect(page.getByPlaceholder('Your answer or meme idea…')).toBeVisible();
  expect(JSON.parse(store.get(key)!).answerModeOverrides['0']).toBe('meme');
});

test('catalog browsing appends bounded server pages and resets pagination on a new search', async ({ page }) => {
  const calls: URL[] = [];
  const exposures: any[] = [];
  await page.route('**/api/media/events', route => { exposures.push(route.request().postDataJSON()); return route.fulfill({ json: { ok: true } }); });
  await page.route('**/api/media/catalog?**', route => {
    const url = new URL(route.request().url()); calls.push(url);
    const offset = Number(url.searchParams.get('cursor') || 0);
    const count = url.searchParams.get('q') ? 1 : offset ? 1 : 24;
    return route.fulfill({ json: { items: Array.from({ length: count }, (_, index) => ({
      id: `local:test-${offset + index}`, providerId: `test-${offset + index}`, source: 'local', format: 'image',
      title: `Pick ${offset + index}`, previewUrl: '/powered-by-giphy.gif', displayUrl: '/powered-by-giphy.gif',
    })), nextCursor: !offset && !url.searchParams.get('q') ? '24' : undefined } });
  });
  await submissionScreen(page);
  await expect(page.getByRole('button', { name: /^Select Pick / })).toHaveCount(24);
  await page.getByRole('button', { name: /^Select Pick / }).first().scrollIntoViewIfNeeded();
  await expect.poll(() => exposures.filter(e => e.event === 'exposed').flatMap(e => e.assetIds).length).toBeGreaterThan(0);
  expect(exposures.flatMap(e => e.assetIds)).not.toContain('test-23');
  expect(exposures[0].token).toBeTruthy();
  await page.getByRole('button', { name: 'Load more picks', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Select Pick / })).toHaveCount(25);
  await page.getByPlaceholder('Your answer or meme idea…').fill('cat');
  await page.getByRole('button', {name:'Search',exact:true}).click();
  await expect(page.getByRole('button', { name: /^Select Pick / })).toHaveCount(1);
  expect(calls.every(url => url.searchParams.get('limit') === '24')).toBe(true);
  expect(calls.some(url => url.searchParams.get('cursor') === '24')).toBe(true);
  expect(calls.at(-1)?.searchParams.get('cursor')).toBeNull();
});

test('expired catalog pagination refreshes templates while preserving the caption draft and stable seed',async({page})=>{
 const calls:URL[]=[];let initial=0;
 await page.route('**/api/media/catalog?**',route=>{
  const url=new URL(route.request().url());calls.push(url);
  if(url.searchParams.has('cursor'))return route.fulfill({status:409,json:{error:'catalog_changed'}});
  initial++;
  return route.fulfill({json:{items:[{id:'local:refresh-test',providerId:'refresh-test',source:'local',format:'image',title:'Refresh test',previewUrl:'/powered-by-giphy.gif',displayUrl:'/powered-by-giphy.gif',captionable:true}],nextCursor:initial===1?'expired-cursor':undefined}});
 });
 await submissionScreen(page);
 await expect(page.getByRole('button',{name:'Select Refresh test'})).toBeVisible();
 const input=page.getByPlaceholder('Your answer or meme idea…');await input.fill('Keep my joke');
 await page.getByRole('button',{name:'Load more picks',exact:true}).click();
 await expect.poll(()=>initial).toBe(2);
 await expect(input).toHaveValue('Keep my joke');await expect(page.getByRole('button',{name:'Select Refresh test'})).toBeVisible();
 expect(calls.every(url=>url.searchParams.get('seed')===calls[0].searchParams.get('seed'))).toBe(true);
 expect(calls[0].searchParams.get('seed')).toMatch(/^[a-f0-9]{16}$/);
 expect(calls.at(-1)?.searchParams.has('cursor')).toBe(false);
});
