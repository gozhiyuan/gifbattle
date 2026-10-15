import { test, expect } from '@playwright/test';
import { buildPromptsForPlan, promptIdentity } from '../lib/game-prompts';

const names = new Map([['a', 'Haris'], ['b', 'Dubala']]);
const plan = Array.from({ length: 12 }, (_, cycle) => ({ cycle, participants: ['a', 'b'] }));
const pool = Array.from({ length: 30 }, (_, i) => `When snack number ${i} disappears`);

test('personalized rounds stay unique even when random choices repeat and templates run out', () => {
  const random = Math.random;
  Math.random = () => 0;
  try {
    const prompts = buildPromptsForPlan(pool, plan, 12, 12, names);
    expect(prompts).toHaveLength(12);
    expect(new Set(prompts.map(promptIdentity)).size).toBe(12);
    expect(prompts.every(Boolean)).toBe(true);
  } finally { Math.random = random; }
});

test('standard questions deduplicate punctuation and case and avoid the previous game', () => {
  const prompts = buildPromptsForPlan([...pool, pool[0].toUpperCase() + '!'], plan.slice(0, 7), 7, 0, names, [], pool.slice(0, 7));
  expect(new Set(prompts.map(promptIdentity)).size).toBe(7);
  expect(prompts.some(p => pool.slice(0, 7).includes(p))).toBe(false);
});
