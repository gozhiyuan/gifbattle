export const isManagedMemeUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.endsWith('.public.blob.vercel-storage.com') && /^\/memes\/[A-Z0-9]{6}\/\d+\/[a-zA-Z0-9_-]+\.webp$/.test(url.pathname);
  } catch { return false; }
};
export async function deleteTrackedMemes(urls: string[], remove: (urls: string[]) => Promise<unknown>, forget: (urls: string[]) => Promise<unknown>) {
  const safe = urls.filter(isManagedMemeUrl);
  if (safe.length) { await remove(safe); await forget(safe); }
  return safe.length;
}
