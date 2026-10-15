export const promptIdentity = (text: string) => text.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

const pickPrompts = (pool: string[], count: number, avoid: string[] = []) => {
  pool = Array.from(new Map(pool.filter(Boolean).map(p => [promptIdentity(p), p])).values());
  const avoidSet = new Set(avoid.filter(Boolean).map(promptIdentity));
  const preferred = pool.filter((p) => !avoidSet.has(promptIdentity(p)));
  const preferredShuffled = [...preferred].sort(() => Math.random() - 0.5);
  const allShuffled = [...pool].sort(() => Math.random() - 0.5);

  if (count <= preferredShuffled.length) return preferredShuffled.slice(0, count);

  const picked = [...preferredShuffled];
  for (const candidate of allShuffled) {
    if (picked.length >= count) break;
    if (!picked.includes(candidate)) picked.push(candidate);
  }
  while (picked.length < count && pool.length > 0) {
    picked.push(pool[Math.floor(Math.random() * pool.length)]);
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
    `Me watching ${a} and ${b} choose chaos`,
    `That moment when ${trio} share one brain cell`,
    `When ${a} and ${b} both think they're right`,
    `Me trying to keep up with ${trio}`,
    `That moment when ${a} starts and ${b} escalates`,
    `When ${trio} act like this was a good idea`,
    `Me after trusting ${a}'s "perfect" plan`,
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
  recentPrompts: string[] = []
) => {
  const nameCycles = pickCycles(rounds, namePromptRounds);
  const nameSlots = plan.filter(p => nameCycles.has(p.cycle)).length;
  const standardPrompts = pickPrompts(pool, Math.max(0, plan.length - nameSlots), recentPrompts);
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
    const picked = choices.length ? choices[Math.floor(Math.random() * choices.length)] : pickPrompts(pool.filter(p => !used.has(promptIdentity(p))), 1, recentPrompts)[0];
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

