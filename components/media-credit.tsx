import { MediaResult } from '@/lib/media/types';
import { safeHttps } from '@/lib/media/catalog-schema.cjs';
export function MediaCredit({ attribution, license }: Pick<MediaResult, 'attribution' | 'license'>) {
  if (!attribution || !safeHttps(attribution.url)) return null;
  return <div style={{ fontSize: 12, marginTop: 8, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
    <a href={attribution.url} target="_blank" rel="noreferrer">{attribution.label}</a>
    {license && safeHttps(license.url) && <> · <a href={license.url} target="_blank" rel="noreferrer">{license.label}</a></>}
  </div>;
}
