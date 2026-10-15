import { expect, test } from "@playwright/test";
import { searchMedia } from "../lib/media/search";
import { GifProvider, ProviderError } from "../lib/media/types";
const page = { items: [], nextCursor: "2" };
const providers: Record<"giphy" | "klipy", GifProvider> = {
  giphy: { id: "giphy", search: async () => page },
  klipy: { id: "klipy", search: async () => page },
};
const input = () => ({ provider: "giphy" as const, query: "cat", code: "ABC123", pid: "p",
  signal: new AbortController().signal, paused: {}, onCooldown: () => {} });

test("quota fallback reserves the alternate budget and returns a single provider", async () => {
  const original = globalThis.fetch;
  const budgets: string[] = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("gif-events")) return Response.json({ ok: true });
    const provider = JSON.parse(init!.body as string).provider; budgets.push(provider);
    return provider === "giphy" ? Response.json({ retryAfter: 120 }, { status: 429 }) : Response.json({ ok: true });
  };
  const cooldowns: string[] = [];
  try {
    const result = await searchMedia({ ...input(), onCooldown: id => { cooldowns.push(id); } }, { allowFallback: true, providers });
    expect(budgets).toEqual(["giphy", "klipy"]);
    expect(cooldowns).toEqual(["giphy"]);
    expect(result.provider).toBe("klipy");
  } finally { globalThis.fetch = original; }
});

for (const scenario of ["disabled", "forbidden"] as const) {
  test(`${scenario} never falls back to a different provider`, async () => {
    const original = globalThis.fetch;
    const budgets: string[] = [];
    globalThis.fetch = async (url, init) => {
      if (String(url).includes("gif-events")) return Response.json({ ok: true });
      budgets.push(JSON.parse(init!.body as string).provider);
      return Response.json({ retryAfter: 60 }, { status: scenario === "forbidden" ? 403 : 429 });
    };
    try {
      await expect(searchMedia({ ...input(), cursor: undefined },
        { allowFallback: scenario !== "disabled", providers })).rejects.toBeInstanceOf(ProviderError);
      expect(budgets).toEqual(["giphy"]);
    } finally { globalThis.fetch = original; }
  });
}

test("upstream 429 activates cooldown and can fall back", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ ok: true });
  let until = 0;
  try {
    const result = await searchMedia({ ...input(), onCooldown: (_, value) => { until = value; } },
      { allowFallback: true, providers: { ...providers, giphy: { id: "giphy", search: async () => { throw new ProviderError("limited", 429, 120); } } } });
    expect(result.provider).toBe("klipy");
    expect(until).toBeGreaterThan(Date.now() + 110000);
  } finally { globalThis.fetch = original; }
});

 test('pagination quota fallback starts the other provider without its predecessor cursor',async()=>{
 const original=globalThis.fetch;const budgets:string[]=[];
 globalThis.fetch=async(url,init)=>{if(String(url).includes('gif-events'))return Response.json({ok:true});const provider=JSON.parse(init!.body as string).provider;budgets.push(provider);return provider==='giphy'?Response.json({retryAfter:120},{status:429}):Response.json({ok:true});};
 try{const result=await searchMedia({...input(),cursor:'24'},{allowFallback:true,providers:{...providers,klipy:{id:'klipy',search:async request=>{expect(request.cursor).toBeUndefined();expect(request.query).toBe('cat');return page;}}}});expect(result.replaceResults).toBe(true);expect(result.provider).toBe('klipy');expect(budgets).toEqual(['giphy','klipy']);}finally{globalThis.fetch=original;}
 });
