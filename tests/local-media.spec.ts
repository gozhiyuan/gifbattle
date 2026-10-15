import { test, expect } from '@playwright/test';
import { searchCatalog } from '../lib/media/catalog-search';
import { validateCatalog } from '../lib/media/catalog-schema.cjs';

export const fixture = {
  id: 'cat-dinner', title: 'Cat waiting for dinner', description: 'A hungry cat', format: 'image' as const,
  width: 40, height: 20, url: '/media/cat.webp', previewUrl: '/media/cat-preview.webp',
  categories: ['awkward'], tags: ['cat', 'hungry'], creator: 'Test creator', license: 'CC0',
  sourceUrl: 'https://example.com/cat', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  permissionRecord: 'Reviewed fixture', reviewStatus: 'approved' as const,
  attribution: { label: 'Test creator · CC0', url: 'https://example.com/cat' },
  captionable: true, captionLayout: 'top-bottom' as const, captionMaxLength: 120,
};

test('server catalog filters metadata/categories/templates and returns bounded pages', () => {
  const catalog = { version: 1 as const, assets: [fixture, { ...fixture, id: 'cat-two', captionable: false }] };
  const input = { query: 'cat', category: 'Awkward', pageSize: 1 };
  const first = searchCatalog(catalog, input);
  expect(first.items[0]).toMatchObject({ id: 'local:cat-dinner', source: 'local', format: 'image', attribution: fixture.attribution });
  const second = searchCatalog(catalog, { ...input, cursor: first.nextCursor });
  expect(second.items[0].id).toBe('local:cat-two');
  expect(second.nextCursor).toBeUndefined();
  expect(searchCatalog(catalog, { ...input, query: 'dog' }).items).toEqual([]);
  expect(searchCatalog(catalog, { ...input, captionable: true }).items).toHaveLength(1);
  expect(() => searchCatalog(catalog, { ...input, pageSize: 5000 })).toThrow();
  expect(first.items[0]).not.toHaveProperty('permissionRecord');
});

test('catalog rejects unreviewed, unsafe, duplicate or uncapturable assets', () => {
  for (const change of [{ reviewStatus: 'pending' }, { url: 'javascript:alert(1)' }, { sourceUrl: 'http://example.com' },
    { permissionRecord: '' }, { format: 'animation' }, { captionMaxLength: 1000 }]) {
    expect(() => validateCatalog({ version: 1, assets: [{ ...fixture, ...change }] })).toThrow();
  }
  expect(() => validateCatalog({ version: 1, assets: [fixture, fixture] })).toThrow();
});


test('caption searches rank shared keywords instead of requiring the whole sentence', () => {
  const catalog = {version: 1 as const, assets: [fixture, {...fixture, id:'dog', title:'Dog playing',description:'A playful dog',tags:['dog','playing']}]};
  const found = searchCatalog(catalog, {query:'When my hungry cat wants dinner',pageSize:24});
  expect(found.items.map(item=>item.providerId)).toEqual(['cat-dinner']);
});
