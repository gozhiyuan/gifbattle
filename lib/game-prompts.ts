export const promptIdentity = (text: string) => text.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

// Prefer editorial favorites on 70% of draws, without repeating a question in a game.
// Previously played questions are considered only after fresh questions are exhausted.
export const samplePrompts = (pool: string[], count: number, avoid: string[] = [], featured: string[] = [], random = Math.random) => {
  const unique = Array.from(new Map(pool.filter(Boolean).map(p => [promptIdentity(p), p])).values());
  const avoidSet = new Set(avoid.map(promptIdentity));
  const featuredSet = new Set(featured.map(promptIdentity));
  const picked: string[] = [];
  for (const candidates of [unique.filter(p => !avoidSet.has(promptIdentity(p))), unique.filter(p => avoidSet.has(promptIdentity(p)))]) {
    const favorites = candidates.filter(p => featuredSet.has(promptIdentity(p)));
    const others = candidates.filter(p => !featuredSet.has(promptIdentity(p)));
    while (picked.length < count && (favorites.length || others.length)) {
      const bucket = !others.length || (favorites.length && random() < 0.7) ? favorites : others;
      picked.push(bucket.splice(Math.floor(random() * bucket.length), 1)[0]);
    }
  }
  return picked;
};

const pickCycles = (rounds: number, namePromptRounds: number) => {
  const all = Array.from({ length: rounds }, (_, i) => i).sort(() => Math.random() - 0.5);
  return new Set(all.slice(0, Math.min(rounds, Math.max(0, namePromptRounds))));
};

const buildNamePrompts = (names: string[]) => {
  const uniq = Array.from(new Set(names.filter(Boolean))).slice(0, 3);
  const [a = "someone", b = "someone else", c = "the whole crew"] = uniq;
  const trio = uniq.length >= 3 ? `${a}, ${b}, and ${c}` : `${a} and ${b}`;
  const templates = [
    `When ${a} says "just one game"`,
    `When ${a} insists they know a shortcut`,
    `When ${trio} all forget why they entered the room`,
    `When ${a} and ${b} give opposite directions`,
    `Me waiting for ${trio} to choose where to eat`,
    `When ${a} blames ${b} for eating the last slice`,
    `When ${trio} assemble furniture without the instructions`,
    `Me after letting ${a} book the entire trip`,
  ];
  return templates;
};

export const buildPromptsForPlan = (
  pool: string[],
  plan: Array<{ cycle: number; participants: string[] }>,
  rounds: number,
  namePromptRounds: number,
  playerNameById: Map<string, string>,
  customPromptPool: string[] = [],
  recentPrompts: string[] = [],
  featuredPrompts: string[] = []
) => {
  const nameCycles = pickCycles(rounds, namePromptRounds);
  const nameSlots = plan.filter(p => nameCycles.has(p.cycle)).length;
  const standardPrompts = samplePrompts(pool, Math.max(0, plan.length - nameSlots), recentPrompts, featuredPrompts);
  if (standardPrompts.length < plan.length - nameSlots) throw new Error('Choose more question topics or fewer rounds to avoid repeats.');
  let standardIdx = 0;

  const used = new Set(standardPrompts.map(promptIdentity));
  const recent = new Set(recentPrompts.map(promptIdentity));
  const pickedPrompts = plan.map((entry) => {
    if (!nameCycles.has(entry.cycle)) {
      const picked = standardPrompts[standardIdx];
      standardIdx += 1;
      return picked;
    }
    const names = (entry.participants || [])
      .map((id) => playerNameById.get(id) || "")
      .filter(Boolean);
    const candidates = buildNamePrompts(names).filter(p => !used.has(promptIdentity(p)));
    const fresh = candidates.filter(p => !recent.has(promptIdentity(p)));
    const choices = fresh.length ? fresh : candidates;
    const picked = choices.length ? choices[Math.floor(Math.random() * choices.length)] : samplePrompts(pool.filter(p => !used.has(promptIdentity(p))), 1, recentPrompts, featuredPrompts)[0];
    if (!picked) throw new Error('Choose more question topics or fewer rounds to avoid repeats.');
    used.add(promptIdentity(picked));
    return picked;
  });

  if (customPromptPool.length === 0) return pickedPrompts;
  const customSet = new Set(customPromptPool.map(promptIdentity));
  if (pickedPrompts.some((p) => customSet.has(promptIdentity(p)))) return pickedPrompts;

  const standardIndex = plan.findIndex((entry) => !nameCycles.has(entry.cycle));
  const fallbackIndex = standardIndex >= 0 ? standardIndex : 0;
  const forcedCustom = customPromptPool[Math.floor(Math.random() * customPromptPool.length)];
  pickedPrompts[fallbackIndex] = forcedCustom;
  return pickedPrompts;
};

