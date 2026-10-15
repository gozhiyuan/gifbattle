import { expect, test } from "@playwright/test";
import { createGiphyProvider } from "../lib/media/providers/giphy";
import { createKlipyProvider } from "../lib/media/providers/klipy";
import { ProviderError } from "../lib/media/types";

test("GIPHY maps media and paginates using upstream total count", async () => {
  const original = globalThis.fetch;
  let url = "";
  globalThis.fetch = async input => {
    url = String(input);
    return Response.json({ data: Array.from({ length: 24 }, (_, id) => ({ id, images: {
      fixed_height: { url: `https://media.giphy.com/${id}.gif`, width: "200", height: "200" },
      fixed_height_small: { url: `https://media.giphy.com/${id}-small.gif` },
    } })), pagination: { total_count: 48 } });
  };
  try {
    const provider = createGiphyProvider("test");
    const first = await provider.search({ query: "cat & dog", pageSize: 24, customerId: "player" });
    expect(new URL(url).searchParams.get("q")).toBe("cat & dog");
    expect(new URL(url).searchParams.get("limit")).toBe("24");
    expect(first.items[0]).toMatchObject({ id: "giphy:0", source: "giphy", width: 200 });
    expect(first.nextCursor).toBe("24");
    const last = await provider.search({ query: "cat", pageSize: 24, cursor: first.nextCursor, customerId: "player" });
    expect(new URL(url).searchParams.get("offset")).toBe("24");
    expect(last.nextCursor).toBeUndefined();
  } finally { globalThis.fetch = original; }
});

test("KLIPY maps nested results, pages and sends the originating query in share reporting", async () => {
  const original = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return Response.json({ result: true, data: { has_next: true, data: [{ id: 123, slug: "happy-cat", file: {
      hd: { gif: { url: "https://static.klipy.com/full.gif", width: 200, height: 100 } },
      sm: { gif: { url: "https://static.klipy.com/small.gif" } },
    } }] } });
  };
  try {
    const provider = createKlipyProvider("test");
    const result = await provider.search({ query: "happy cat", pageSize: 24, customerId: "player", cursor: "2" });
    expect(result.items[0]).toMatchObject({ id: "klipy:123", providerId: "happy-cat", previewUrl: "https://static.klipy.com/small.gif" });
    expect(result.nextCursor).toBe("3");
    expect(new URL(calls[0].url).searchParams.get("page")).toBe("2");
    expect(new URL(calls[0].url).searchParams.get("content_filter")).toBe("high");
    await provider.reportSelection!(result.items[0], "player");
    expect(calls[1].url).toContain("/share/happy-cat");
    expect(JSON.parse(calls[1].init!.body as string)).toEqual({ customer_id: "player", q: "happy cat" });
  } finally { globalThis.fetch = original; }
});

test("provider 429 preserves retry duration", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response("", { status: 429, headers: { "Retry-After": "120" } });
  try {
    await expect(createGiphyProvider("test").search({ query: "cat", pageSize: 24, customerId: "p" }))
      .rejects.toMatchObject({ status: 429, retryAfter: 120 });
  } finally { globalThis.fetch = original; }
});

test("KLIPY does not silently remove ads from an unsupported ad integration", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ result: true, data: { data: [{ type: "ad" }] } });
  try {
    await expect(createKlipyProvider("test").search({ query: "cat", pageSize: 24, customerId: "p" })).rejects.toBeInstanceOf(ProviderError);
  } finally { globalThis.fetch = original; }
});
