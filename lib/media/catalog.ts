import { MediaResult } from './types';
export interface LocalAsset {
  id: string;
  title: string;
  format: 'image' | 'animation';
  url: string;
  previewUrl: string;
  width: number;
  height: number;
  categories: string[];
  tags: string[];
  description: string;
  sourceUrl: string;
  creator: string;
  license: string;
  licenseUrl: string;
  permissionRecord: string;
  attribution: { label: string; url: string };
  reviewStatus: 'approved';
  safety?: { policy: string; status: 'safe' | 'review' | 'unsafe'; safeForChildren: boolean; safeForWork: boolean; checks: Record<string, 'clear' | 'review' | 'unsafe'> };
  captionable: boolean;
  captionLayout?: 'top-bottom' | 'bottom';
  captionMaxLength?: number;
}
export interface LocalCatalog { version: 1; assets: LocalAsset[] }
export const assetToMedia = (asset: LocalAsset): MediaResult => ({
  id: `local:${asset.id}`, source: 'local', providerId: asset.id, format: asset.format,
  title: asset.title, captionable: asset.captionable, captionLayout: asset.captionLayout, captionMaxLength: asset.captionMaxLength, previewUrl: asset.previewUrl, displayUrl: asset.url,
  width: asset.width, height: asset.height, attribution: asset.attribution,
  license: { label: asset.license, url: asset.licenseUrl },
});
