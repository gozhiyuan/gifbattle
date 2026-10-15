import {createHash} from 'node:crypto';
import { LocalCatalog, assetToMedia } from './catalog';
export function searchCatalog(catalog: LocalCatalog, input: { query: string; category?: string; captionable?: boolean; pageSize: number; cursor?: string; seed?: string }) {
  const offset = Number(input.cursor || 0);
  if (!Number.isInteger(offset) || offset < 0 || offset > 1000000 || !Number.isInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 48 || input.query.length > 200 || (input.category || '').length > 40 || (input.seed || '').length > 80) throw new Error('Invalid catalog search');
  const stopWords = new Set('a an the i me my we our you your it is are was were be been to of for in on at and or but when with this that just so'.split(' '));
  const terms = [...new Set(input.query.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])].filter(term => !stopWords.has(term));
  const category = input.category?.toLowerCase();
  const scores=new Map<string,number>();
  const score = (asset: LocalCatalog['assets'][number]) => {
    if(scores.has(asset.id))return scores.get(asset.id)!;
    const text = [asset.title, asset.description, ...asset.tags, ...asset.categories].join(' ').toLowerCase();
    const value=terms.reduce((sum, term) => sum + Number(text.includes(term)), 0);scores.set(asset.id,value);return value;
  };
  const shuffled = new Map(catalog.assets.map(asset=>[asset.id,input.seed ? createHash('sha256').update(input.seed+'\0'+asset.id).digest('hex') : '']));
  const matches = catalog.assets.filter(asset => {
    if (input.captionable && !asset.captionable) return false;
    if (category && !asset.categories.some(value => value.toLowerCase() === category)) return false;
    return !terms.length || score(asset) > 0;
  }).sort((a, b) => score(b) - score(a) || (input.seed ? shuffled.get(a.id)!.localeCompare(shuffled.get(b.id)!) || a.id.localeCompare(b.id) : 0));
  return { total:matches.length,items: matches.slice(offset, offset + input.pageSize).map(assetToMedia),
    nextCursor: offset + input.pageSize < matches.length ? String(offset + input.pageSize) : undefined };
}
