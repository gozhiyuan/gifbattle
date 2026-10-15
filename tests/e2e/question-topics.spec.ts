import { expect, test, Page } from '@playwright/test';
import { installGameApiMocks } from './helpers/mock-api';
import { questionsForTopics } from '../../lib/questions';

async function lobby(page: Page) {
  const store = new Map<string, string>();
  await installGameApiMocks(page.context(), store);
  await page.route('**/api/cleanup-memes', route => route.fulfill({ json: { deleted: 0 } }));
  await page.goto('/');
  await page.getByPlaceholder('Your nickname').fill('Host');
  await page.getByRole('button', { name: /create room/i }).click();
  await expect(page.getByText('LOBBY', { exact: true })).toBeVisible();
  const code = await page.evaluate(() => localStorage.getItem('gifbattle_last_room')!);
  const key = `gifbattle:room:${code}`, room = JSON.parse(store.get(key)!);
  Object.assign(room, { rounds: 3, namePromptRounds: 0, players: [...room.players, { id: 'guest', nickname: 'Guest', score: 0 }] });
  store.set(key, JSON.stringify(room));
  await expect(page.getByText('PLAYERS (2/12)', { exact: true })).toBeVisible();
  return { store, key, room, code };
}

test('host can combine topics, start with only matching questions, and retain topics on Play Again', async ({ page }) => {
  const { store, key } = await lobby(page);
  await expect(page.getByRole('button', { name: 'All topics', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('status').filter({ hasText: '1000 questions' })).toBeVisible();
  const food = page.getByRole('button', { name: 'Food', exact: true });
  const technology = page.getByRole('button', { name: 'Technology', exact: true });
  await food.click();
  await expect(food).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('status').filter({ hasText: '125 questions' })).toBeVisible();
  await technology.click();
  await expect(technology).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('status').filter({ hasText: '250 questions' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/gifbattle-question-topics.png', fullPage: true });
  await page.getByRole('button', { name: '🚀 Start Game', exact: true }).click();
  await expect.poll(() => JSON.parse(store.get(key)!).phase).toBe('submitting');
  const game = JSON.parse(store.get(key)!);
  const allowed = new Set(questionsForTopics(['food', 'technology']).map(q => q.text));
  expect(game.prompts).toHaveLength(3);
  expect(game.prompts.every(p => allowed.has(p))).toBe(true);
  expect(new Set(game.prompts).size).toBe(3);
  store.set(key, JSON.stringify({ ...game, phase: 'game_over' }));
  await expect(page.getByText('GAME SUMMARY', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '↺ Play Again', exact: true }).click();
  await expect(page.getByText('LOBBY', { exact: true })).toBeVisible();
  await expect(food).toHaveAttribute('aria-pressed', 'true');
  await expect(technology).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'All topics', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '1000 questions' })).toBeVisible();
  expect(JSON.parse(store.get(key)!).questionTopics).toEqual([]);
});

test('topic save failures keep the previous selection and allow retry', async ({ page }) => {
  const { store, key } = await lobby(page);
  await page.route('**/api/room/state', route => route.fulfill({ status: 503, json: { error: 'unavailable' } }));
  await page.getByRole('button', { name: 'Food', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Could not save question topics' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'All topics', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(JSON.parse(store.get(key)!).questionTopics || []).toEqual([]);
  await expect(page.getByRole('button', { name: 'Food', exact: true })).toBeEnabled();
});

test('guests see the room topic selection without editable controls', async ({ page }) => {
  const { store, key, room, code } = await lobby(page);
  store.set(key, JSON.stringify({ ...room, host: 'guest', questionTopics: ['food'] }));
  const food = page.getByRole('button', { name: 'Food', exact: true });
  await expect(food).toHaveAttribute('aria-pressed', 'true');
  await expect(food).toBeDisabled();
  await expect(page.getByRole('button', { name: 'All topics', exact: true })).toBeDisabled();
  const status = await page.evaluate(async ({ code, room }) => {
    const token = localStorage.getItem(`gifbattle_room_token:${code}`);
    return (await fetch('/api/room/state', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({code, pid:room.players[0].id, token, state:JSON.stringify({...room,host:'guest',questionTopics:['technology']})}) })).status;
  }, { code, room });
  expect(status).toBe(403);
  expect(JSON.parse(store.get(key)!).questionTopics).toEqual(['food']);
});
