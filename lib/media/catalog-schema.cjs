// Shared by the offline importer, server catalog loader and attribution UI.
const safeHttps = value => {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
};
const safeMediaUrl = value => typeof value === 'string' &&
  (/^\/media\/[a-zA-Z0-9/_-]+\.(webp|gif|png|jpe?g)$/.test(value) || safeHttps(value));
function validateCatalog(catalog) {
  if (!catalog || catalog.version !== 1 || !Array.isArray(catalog.assets)) throw new Error('Expected catalog version 1 and assets array');
  const ids = new Set();
  for (const asset of catalog.assets) {
    if (!asset || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(asset.id) || ids.has(asset.id)) throw new Error('Invalid or duplicate asset ID');
    ids.add(asset.id);
    for (const field of ['title', 'description', 'creator', 'license', 'permissionRecord']) {
      if (typeof asset[field] !== 'string' || !asset[field].trim()) throw new Error(`${asset.id}: missing ${field}`);
    }
    if (asset.reviewStatus !== 'approved' || !['image', 'animation'].includes(asset.format)) throw new Error(`${asset.id}: unapproved asset or invalid format`);
    for (const field of ['url', 'previewUrl']) if (!safeMediaUrl(asset[field])) throw new Error(`${asset.id}: invalid ${field}`);
    if (!safeHttps(asset.sourceUrl) || !safeHttps(asset.licenseUrl)) throw new Error(`${asset.id}: source/license must use HTTPS`);
    for (const field of ['categories', 'tags']) {
      if (!Array.isArray(asset[field]) || !asset[field].length || asset[field].some(v => typeof v !== 'string' || !v.trim())) throw new Error(`${asset.id}: missing ${field}`);
    }
    if (![asset.width, asset.height].every(v => Number.isInteger(v) && v > 0)) throw new Error(`${asset.id}: invalid dimensions`);
    if (!asset.attribution?.label?.trim() || !safeHttps(asset.attribution.url)) throw new Error(`${asset.id}: missing attribution`);
    if (typeof asset.captionable !== 'boolean') throw new Error(`${asset.id}: captionable must be boolean`);
    if (asset.captionable && (asset.format !== 'image' || !['top-bottom', 'bottom'].includes(asset.captionLayout) || !Number.isInteger(asset.captionMaxLength) || asset.captionMaxLength < 1 || asset.captionMaxLength > 300)) throw new Error(`${asset.id}: invalid caption settings`);
  }
  return catalog;
}

exports.safeHttps = safeHttps;
exports.safeMediaUrl = safeMediaUrl;
exports.validateCatalog = validateCatalog;
