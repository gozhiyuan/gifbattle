import manifest from '@/public/media/catalog.json';
import { validateCatalog } from './catalog-schema.cjs';
import { safetyPassed } from './safety-policy.cjs';
import { LocalCatalog } from './catalog';
// Bundled on the server at deployment; thousands of metadata records stay off the client.
const validated: LocalCatalog = validateCatalog(manifest);
// Old/missing/uncertain assessments cannot enter browsing or server meme rendering.
export const catalog: LocalCatalog = { ...validated, assets: validated.assets.filter(asset => safetyPassed({ safety: asset.safety })) };
export const findTemplate = (id: string) => catalog.assets.find(asset => asset.id === id && asset.captionable && asset.format === 'image');
