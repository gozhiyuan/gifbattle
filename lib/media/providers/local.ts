import { GifProvider, SearchPage } from '../types';
export class CatalogChangedError extends Error {}
export function createLocalProvider(): GifProvider {
  return {
    id: 'local',
    async search({ query, category, captionable, pageSize, cursor, signal, seed }) {
      const params = new URLSearchParams({ q: query, limit: String(pageSize) });
      if (seed) params.set('seed',seed);
      if (category) params.set('category', category);
      if (captionable) params.set('captionable', 'true');
      if (cursor) params.set('cursor', cursor);
      const response = await fetch(`/api/media/catalog?${params}`, { signal });
      if(response.status===409)throw new CatalogChangedError('The collection changed. Refreshing templates…');
      if (!response.ok) throw new Error('Templates are temporarily unavailable. You can still submit text only.');
      return response.json() as Promise<SearchPage>;
    },
  };
}
export const localProvider = createLocalProvider();
