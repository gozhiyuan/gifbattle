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

import { samplePrompts } from '../lib/game-prompts';
import { QUESTIONS, QUESTION_TOPICS, normalizeQuestionTopics, questionTopicsRejection, questionsForTopics } from '../lib/questions';

function seededRandom(seed = 12345) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

test('reviewed catalog has unique short questions, eight balanced topics and 200 featured picks', () => {
  expect(QUESTIONS).toHaveLength(1000);
  expect(QUESTION_TOPICS).toHaveLength(8);
  expect(new Set(QUESTIONS.map(q => q.id)).size).toBe(QUESTIONS.length);
  expect(new Set(QUESTIONS.map(q => promptIdentity(q.text))).size).toBe(QUESTIONS.length);
  expect(QUESTIONS.every(q => q.text.length > 15 && q.text.length <= 120 && q.topics.length > 0)).toBe(true);
  expect(QUESTIONS.filter(q => q.featured)).toHaveLength(200);
  for (const topic of QUESTION_TOPICS) {
    const questions = questionsForTopics([topic.id]);
    expect(questions).toHaveLength(125);
    expect(questions.filter(q => q.featured)).toHaveLength(25);
    expect(questions.every(q => q.topics.includes(topic.id))).toBe(true);
    expect(questions.some(q => q.featured)).toBe(true);
    expect(questions.some(q => !q.featured)).toBe(true);
  }
});

test('topic unions are deduplicated and old rooms default to All topics', () => {
  expect(questionsForTopics(undefined)).toEqual(QUESTIONS);
  expect(questionsForTopics([])).toEqual(QUESTIONS);
  const selected = questionsForTopics(['food', 'technology', 'food']);
  expect(selected).toHaveLength(250);
  expect(selected.every(q => q.topics.some(id => id === 'food' || id === 'technology'))).toBe(true);
  expect(normalizeQuestionTopics(['bad', 'food', 'food'])).toEqual(['food']);
});

test('featured sampling is favored while recent questions and duplicates are avoided', () => {
  const questions = questionsForTopics(['food']);
  const pool = questions.map(q => q.text), featured = questions.filter(q => q.featured).map(q => q.text);
  const random = seededRandom();
  let favorites = 0;
  for (let i = 0; i < 5000; i++) if (featured.includes(samplePrompts(pool, 1, [], featured, random)[0])) favorites++;
  expect(favorites / 5000).toBeGreaterThan(0.67);
  expect(favorites / 5000).toBeLessThan(0.73);
  const picked = samplePrompts([...pool, pool[0].toUpperCase() + '!'], 10, featured, featured, seededRandom());
  expect(picked.some(p => featured.includes(p))).toBe(false);
  expect(new Set(picked.map(promptIdentity)).size).toBe(10);
  expect(samplePrompts(pool, 200, [], featured)).toHaveLength(125);
});

test('small pools ask for more topics instead of repeating or borrowing another category', () => {
  expect(() => buildPromptsForPlan(['Only one question'], plan.slice(0, 2), 2, 0, names)).toThrow('Choose more question topics');
  const food = questionsForTopics(['food']);
  const custom = 'My custom party question';
  const prompts = buildPromptsForPlan([...food.map(q => q.text), custom], plan.slice(0, 7), 7, 0, names, [custom], [], food.filter(q => q.featured).map(q => q.text));
  expect(prompts).toContain(custom);
  expect(prompts.every(p => p === custom || food.some(q => q.text === p))).toBe(true);
  expect(new Set(prompts.map(promptIdentity)).size).toBe(7);
});

test('only the host can change valid question topics in the lobby', () => {
  const room = { host: 'host', phase: 'lobby', questionTopics: ['food'] };
  expect(questionTopicsRejection(room, 'host', ['food', 'technology'])).toBeNull();
  expect(questionTopicsRejection(room, 'guest', ['technology'])).toBe('host_only_setting');
  expect(questionTopicsRejection(room, 'guest', ['food'])).toBeNull();
  expect(questionTopicsRejection(room, 'host', ['unknown'])).toBe('invalid_question_topics');
  expect(questionTopicsRejection(room, 'host', 'food')).toBe('invalid_question_topics');
  expect(questionTopicsRejection({...room, phase:'submitting'}, 'host', [])).toBe('question_topics_locked');
  expect(questionTopicsRejection({...room, phase:'submitting'}, 'guest', undefined)).toBeNull();
});

test('a single expanded topic supports sixty unique heat questions without borrowing other topics', () => {
  const food = questionsForTopics(['food']);
  const heatPlan = Array.from({ length: 60 }, (_, cycle) => ({ cycle, participants: ['a', 'b'] }));
  const questions = buildPromptsForPlan(food.map(q => q.text), heatPlan, 60, 0, names, [], [], food.filter(q => q.featured).map(q => q.text));
  expect(questions).toHaveLength(60);
  expect(new Set(questions.map(promptIdentity)).size).toBe(60);
  expect(questions.every(text => food.some(q => q.text === text))).toBe(true);
});
