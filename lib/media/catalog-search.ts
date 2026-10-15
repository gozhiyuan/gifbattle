import { LocalCatalog, assetToMedia } from './catalog';
export function searchCatalog(catalog: LocalCatalog, input: { query: string; category?: string; captionable?: boolean; pageSize: number; cursor?: string }) {
  const offset = Number(input.cursor || 0);
  if (!Number.isInteger(offset) || offset < 0 || offset > 1000000 || !Number.isInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 48 || input.query.length > 200 || (input.category || '').length > 40) throw new Error('Invalid catalog search');
  const stopWords = new Set('a an the i me my we our you your it is are was were be been to of for in on at and or but when with this that just so'.split(' '));
  const terms = [...new Set(input.query.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])].filter(term => !stopWords.has(term));
  const category = input.category?.toLowerCase();
  const score = (asset: LocalCatalog['assets'][number]) => {
    const text = [asset.title, asset.description, ...asset.tags, ...asset.categories].join(' ').toLowerCase();
    return terms.reduce((sum, term) => sum + Number(text.includes(term)), 0);
  };
  const matches = catalog.assets.filter(asset => {
    if (input.captionable && !asset.captionable) return false;
    if (category && !asset.categories.some(value => value.toLowerCase() === category)) return false;
    return !terms.length || score(asset) > 0;
  }).sort((a, b) => score(b) - score(a));
  return { items: matches.slice(offset, offset + input.pageSize).map(assetToMedia),
    nextCursor: offset + input.pageSize < matches.length ? String(offset + input.pageSize) : undefined };
}
