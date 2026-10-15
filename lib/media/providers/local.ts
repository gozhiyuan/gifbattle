import { GifProvider, SearchPage } from '../types';
export function createLocalProvider(): GifProvider {
  return {
    id: 'local',
    async search({ query, category, captionable, pageSize, cursor, signal }) {
      const params = new URLSearchParams({ q: query, limit: String(pageSize) });
      if (category) params.set('category', category);
      if (captionable) params.set('captionable', 'true');
      if (cursor) params.set('cursor', cursor);
      const response = await fetch(`/api/media/catalog?${params}`, { signal });
      if (!response.ok) throw new Error('Our Picks is unavailable. Please try again.');
      return response.json() as Promise<SearchPage>;
    },
  };
}
export const localProvider = createLocalProvider();
