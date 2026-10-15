import { GifProvider, providerJson } from "../types";
export function createGiphyProvider(apiKey: string): GifProvider {
  return {
    id: "giphy",
    async search({ query, pageSize, cursor, signal }) {
      const offset = Number(cursor) || 0;
      const params = new URLSearchParams({ api_key: apiKey, q: query, limit: String(pageSize), offset: String(offset), rating: "pg-13" });
      const data = await providerJson(await fetch(`https://api.giphy.com/v1/gifs/search?${params}`, { signal }));
      const raw = data.data || [];
      const items = raw.map((gif) => ({
        id: `giphy:${gif.id}`, providerId: String(gif.id), source: "giphy" as const, format: "animation" as const,
        displayUrl: gif.images?.fixed_height?.url || "",
        previewUrl: gif.images?.fixed_height_small?.url || gif.images?.fixed_height?.url || "",
        width: Number(gif.images?.fixed_height?.width), height: Number(gif.images?.fixed_height?.height), searchQuery: query,
      }));
      return { items, nextCursor: raw.length === pageSize && offset + raw.length < Math.min(data.pagination?.total_count ?? Infinity, 4999)
        ? String(offset + raw.length) : undefined };
    },
  };
}
