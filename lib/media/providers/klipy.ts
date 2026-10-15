import { GifProvider, ProviderError, providerJson } from "../types";
export function createKlipyProvider(apiKey: string): GifProvider {
  const base = `https://api.klipy.com/api/v1/${encodeURIComponent(apiKey)}/gifs`;
  return {
    id: "klipy",
    async search({ query, pageSize, cursor, customerId, signal }) {
      const page = Number(cursor) || 1;
      const params = new URLSearchParams({ q: query, page: String(page), per_page: String(pageSize), customer_id: customerId, content_filter: "high", locale: "us" });
      const data = await providerJson(await fetch(`${base}/search?${params}`, { signal }));
      if (data.result === false) throw new ProviderError("KLIPY search failed. Please try again.");
      const raw = data.data?.data || [];
      // Ad-enabled integrations need a dedicated ad renderer, not a filtered result grid.
      if (raw.some((item) => item.type === "ad")) throw new ProviderError("This KLIPY key requires ad support. Configure an ad-free key for this integration.");
      const items = raw.map((gif) => {
        const full = gif.file?.hd?.gif || gif.file?.md?.gif;
        const preview = gif.file?.sm?.gif || gif.file?.xs?.gif || full;
        return { id: `klipy:${gif.id}`, providerId: gif.slug, source: "klipy" as const, format: "animation" as const,
          displayUrl: full?.url || "", previewUrl: preview?.url || "", width: full?.width, height: full?.height, searchQuery: query };
      });
      return { items, nextCursor: data.data?.has_next ? String(page + 1) : undefined };
    },
    async reportSelection(item, customerId) {
      await providerJson(await fetch(`${base}/share/${encodeURIComponent(item.providerId)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_id: customerId, q: item.searchQuery || "" }),
      }));
    },
  };
}
