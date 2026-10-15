import { expect, test, Page } from '@playwright/test';
import { installGameApiMocks } from './helpers/mock-api';
import manifest from '../../public/media/catalog.json';
async function openEditor(page: Page, aiEnabled = false) {
  const store = new Map<string, string>();
  await installGameApiMocks(page.context(), store);
  if (aiEnabled) await page.route("**/api/gemini-key?**", route => route.fulfill({json:{exists:true}}));
  await page.route('**/api/media/events', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/gif-events', route => route.fulfill({ json: { ok: true } }));
  await page.goto('/'); await page.getByPlaceholder('Your nickname').fill('Host');
  await page.getByRole('button', { name: /create room/i }).click();
  await expect(page.getByText('LOBBY', { exact: true })).toBeVisible();
  const code = await page.evaluate(() => localStorage.getItem('gifbattle_last_room')!);
  const key = `gifbattle:room:${code}`; const room = JSON.parse(store.get(key)!);
  Object.assign(room, { phase: 'submitting', prompts: ['When dinner arrives'], rounds: 1, answerModeOverrides: {0:'meme'},
    players: [...room.players, { id: 'guest', nickname: 'Guest', score: 0 }], submitDeadline: Date.now() + 180000 });
  store.set(key, JSON.stringify(room));
  await expect(page.getByPlaceholder('Your answer or meme idea…')).toBeVisible();
  await page.getByRole('button', { name: 'Select When the meeting keeps going' }).click();
  return { store, key, room, code };
}
test('caption preview and submission retain text, template and license; temporary memes cleanup on Play Again', async ({ page }) => {
  let uploaded: any; let cleaned: any;
  const asset = manifest.assets[0];
  await page.route('**/api/memes', route => {
    uploaded = route.request().postDataJSON();
    return route.fulfill({ json: { url: asset.url, templateId: asset.id, captions: uploaded.captions,
      width: asset.width, height: asset.height, attribution: asset.attribution, license: { label: asset.license, url: asset.licenseUrl } } });
  });
  await page.route('**/api/cleanup-memes', route => { cleaned = route.request().postDataJSON(); return route.fulfill({ json: { deleted: 1 } }); });
  await page.route('**/media/catalog.json', route => route.abort()); // clients must use server pages
  const { store, key, room, code } = await openEditor(page);
  const submit = page.getByRole('button', { name: 'Submit', exact: true });
  await expect(submit).toBeDisabled();
  await page.getByPlaceholder('Your answer or meme idea…', { exact: true }).fill('WHERE IS MY DINNER');
  await expect(submit).toBeEnabled();
  await expect(page.getByRole('img', { name: 'Meme preview' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/gifbattle-meme-editor.png', fullPage: true });
  await submit.click();
  await expect.poll(() => JSON.parse(store.get(key)!).submissions?.[room.host]?.[0]?.type).toBe('meme');
  expect(uploaded).toMatchObject({ code, pid: room.host, gameId: room.submitDeadline, templateId: asset.id, captions: ['WHERE IS MY DINNER'] });
  expect(uploaded.token).toBeTruthy(); expect(uploaded).not.toHaveProperty('url');
  const saved = JSON.parse(store.get(key)!);
  expect(saved.submissions[room.host][0]).toMatchObject({ type: 'meme', templateId: asset.id, captions: ['WHERE IS MY DINNER'], source: 'local' });
  saved.phase = 'game_over'; store.set(key, JSON.stringify(saved));
  await expect(page.getByText('GAME SUMMARY', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '↺ Play Again', exact: true }).click();
  await expect(page.getByText('LOBBY', { exact: true })).toBeVisible();
  expect(cleaned).toMatchObject({ code, pid: room.host, gameId: room.submitDeadline });
  expect(cleaned.token).toBeTruthy();
});
test('storage failure keeps captions editable and allows a retry', async ({ page }) => {
  await page.route('**/api/memes', route => route.fulfill({ status: 503, json: { error: 'storage_not_configured' } }));
  await openEditor(page);
  const input = page.getByPlaceholder('Your answer or meme idea…', { exact: true });
  await input.fill('Dinner please');
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Meme storage is unavailable' })).toBeVisible();
  await expect(input).toHaveValue('Dinner please'); await expect(input).toBeEnabled();
  await expect(page.getByPlaceholder('Your answer or meme idea…')).toBeVisible();
});
test('catalog API limits payloads, filters templates and rejects oversized pages; cleanup rejects unauthenticated calls', async ({ request }) => {
  const response = await request.get('/api/media/catalog?captionable=true&category=awkward&limit=1');
  expect(response.status()).toBe(200);
  const result = await response.json(); expect(result.items).toHaveLength(1);
  expect(result.items[0]).not.toHaveProperty('permissionRecord');
  expect((await request.get('/api/media/catalog?limit=10000')).status()).toBe(400);
  expect((await request.post('/api/memes', { data: {} })).status()).toBe(400);
  expect((await request.get('/api/cleanup-memes')).status()).toBe(403);
});

test('AI suggestions stay optional and editable; contributions require an explicit checkbox and can fail without losing the meme', async ({ page }) => {
  const asset = manifest.assets[0]; let contributionCalls = 0, uploads = 0;
  await page.route('**/api/meme-answers', route => {
    expect(route.request().postDataJSON()).toMatchObject({ roundIndex: 0, draft: 'My own joke' });
    return route.fulfill({ json: { suggestions: ['WHERE IS DINNER', 'I HAVE BEEN PATIENT'] } });
  });
  await page.route('**/api/memes', route => {
    uploads++; return route.fulfill({ json: { url: asset.url, templateId: asset.id, captions: route.request().postDataJSON().captions,
      width: asset.width, height: asset.height, attribution: asset.attribution, license: { label: asset.license, url: asset.licenseUrl } } });
  });
  await page.route('**/api/meme-contributions', route => { contributionCalls++; expect(route.request().postDataJSON().consent).toBe(true); return route.fulfill({ status: 503, json: { error: 'unavailable' } }); });
  const { store, key, room } = await openEditor(page, true);
  const input = page.getByPlaceholder('Your answer or meme idea…', { exact: true }); await input.fill('My own joke');
  await page.getByRole('button', { name: 'Make it funnier with AI' }).click();
  await expect(page.getByRole('button', { name: 'WHERE IS DINNER', exact: true })).toBeVisible();
  await expect(input).toHaveValue('My own joke');
  await page.getByRole('button', { name: 'WHERE IS DINNER', exact: true }).click(); await input.fill('WHERE IS MY DINNER');
  const checkbox = page.getByRole('checkbox'); await expect(checkbox).not.toBeChecked(); await checkbox.check();
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Could not share for review' })).toBeVisible();
  await expect(input).toHaveValue('WHERE IS MY DINNER'); expect(contributionCalls).toBe(1);
  await checkbox.uncheck(); await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect.poll(() => JSON.parse(store.get(key)!).submissions?.[room.host]?.[0]?.type).toBe('meme');
  expect(uploads).toBe(1); expect(contributionCalls).toBe(1);
});
test('new APIs reject malformed bodies and moderation endpoints require server-only admin credentials', async ({ request }) => {
  expect((await request.post('/api/meme-captions', { data: {} })).status()).toBe(400);
  expect((await request.post('/api/meme-contributions', { data: {} })).status()).toBe(400);
  expect((await request.post('/api/media/events', { data: {} })).status()).toBe(400);
  expect((await request.get('/api/media/moderation')).status()).toBe(403);
  expect((await request.get('/api/media/stats')).status()).toBe(403);
});

test('Meme mode preserves drafts while AI revises, then creates and submits an AI meme',async({page})=>{
  const asset=manifest.assets[0];let request:any;
  await page.route('**/api/meme-answers',route=>{expect(route.request().postDataJSON().draft).toBe('My original joke');return route.fulfill({json:{suggestions:['My funnier joke','Another joke']}});});
  await page.route('**/api/generate-image',route=>{request=route.request().postDataJSON();return route.fulfill({json:{url:asset.url}});});
  const {store,key,room}=await openEditor(page,true);
  const input=page.getByPlaceholder('Your answer or meme idea…');await input.fill('My original joke');
  await page.getByRole('button',{name:'Make it funnier with AI',exact:true}).click();
  await expect(page.getByRole('button',{name:'My funnier joke',exact:true})).toBeVisible();await expect(input).toHaveValue('My original joke');
  await page.getByRole('button',{name:'My funnier joke',exact:true}).click();await expect(input).toHaveValue('My funnier joke');
  await page.getByRole('button',{name:'Generate with AI using this idea',exact:true}).click();await expect(page.getByRole('button',{name:'Submit',exact:true})).toBeVisible();
  expect(request).toMatchObject({memeImage:true,textAnswer:'My funnier joke',roundIndex:0,gameId:room.submitDeadline});expect(request.token).toBeTruthy();
  await page.getByRole('button',{name:'Submit',exact:true}).click();
  await expect.poll(()=>JSON.parse(store.get(key)!).submissions?.[room.host]?.[0]?.type).toBe('ai');
});

test('one composer keeps the caption through AI rewriting, searching, template changes and text-only submission', async ({page}) => {
  const requests: URL[]=[];
  await page.route('**/api/media/catalog?**', async route => { requests.push(new URL(route.request().url())); await route.continue(); });
  await page.route('**/api/meme-answers', route => route.fulfill({json:{suggestions:['Hungry cat waiting for dinner']}}));
  const {store,key,room}=await openEditor(page,true);
  const input=page.getByPlaceholder('Your answer or meme idea…');
  await expect(page.locator('textarea')).toHaveCount(1);
  await input.fill('My original joke');
  await page.getByRole('button',{name:'Make it funnier with AI',exact:true}).click();
  await page.getByRole('button',{name:'Hungry cat waiting for dinner',exact:true}).click();
  await expect(input).toHaveValue('Hungry cat waiting for dinner');
  await expect(page.getByRole('img',{name:'Meme preview'})).toBeVisible();
  await page.getByRole('button',{name:'Search',exact:true}).click();
  await expect.poll(()=>requests.at(-1)?.searchParams.get('q')).toBe('Hungry cat waiting for dinner');
  await page.getByRole('button',{name:'Text only',exact:true}).click();
  await expect(page.getByRole('img',{name:'Meme preview'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Submit',exact:true})).toHaveCount(1);
  await page.getByRole('button',{name:'Submit',exact:true}).click();
  await expect.poll(()=>JSON.parse(store.get(key)!).submissions?.[room.host]?.[0]).toMatchObject({type:'text',textAnswer:'Hungry cat waiting for dinner'});
});

test('long captions are preserved and need shortening for templates, while text-only remains available',async({page})=>{
 await openEditor(page);
 const input=page.getByPlaceholder('Your answer or meme idea…');await input.fill('x'.repeat(150));
 await expect(page.getByRole('alert').filter({hasText:'Shorten your caption'})).toBeVisible();
 await expect(input).toHaveValue('x'.repeat(150));
 await expect(page.getByRole('button',{name:'Submit',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Text only',exact:true}).click();
 await expect(input).toHaveValue('x'.repeat(150));
 await expect(page.getByRole('button',{name:'Submit',exact:true})).toBeEnabled();
});
