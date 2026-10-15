import { automaticFallback, PAGE_SIZE, providerLabels, remoteProviders } from "./provider-config";
import { GifProvider, MediaResult, ProviderError, RemoteProvider } from "./types";
import { recordGifEvent } from "./telemetry";
export async function reserveProviderRequest(provider: RemoteProvider, code: string, pid: string, signal?: AbortSignal) {
  const response = await fetch("/api/gif-search-budget", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, code, pid }), signal,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ProviderError(response.status === 429
      ? `GIF search is taking a break. Please try again later.`
      : "GIF search is temporarily unavailable. Please try again shortly.", response.status, Number(data.retryAfter) || 60);
  }
}
export async function searchMedia(input: {
  provider: RemoteProvider; query: string; cursor?: string; code: string; pid: string;
  signal: AbortSignal; paused: Partial<Record<RemoteProvider, number>>;
  onCooldown: (provider: RemoteProvider, until: number) => void;
}, settings: { allowFallback: boolean; providers: Partial<Record<RemoteProvider, GifProvider>> } = {
  allowFallback: automaticFallback, providers: remoteProviders,
}) {
  const available = (Object.keys(settings.providers) as RemoteProvider[]).filter(id => settings.providers[id]);
  const candidates = [input.provider, ...(settings.allowFallback
    ? available.filter(id => id !== input.provider) : [])];
  let failure: Error = new Error("GIF search is unavailable.");
  for (const provider of candidates) {
    if (input.signal.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      if ((input.paused[provider] || 0) > Date.now()) throw new ProviderError(`GIF search is taking a break. Please try again later.`, 429,
        Math.ceil((input.paused[provider] - Date.now()) / 1000));
      await reserveProviderRequest(provider, input.code, input.pid, input.signal);
      // A different provider starts a fresh page; cursors belong to their provider.
      const cursor = provider === input.provider ? input.cursor : undefined;
      recordGifEvent(input.code, input.pid, provider, cursor ? "pagination_sent" : "search_sent");
      const page = await settings.providers[provider].search({ query: input.query, pageSize: PAGE_SIZE,
        cursor, customerId: input.pid, signal: input.signal });
      return { ...page, provider, replaceResults: Boolean(input.cursor && provider !== input.provider) };
    } catch (error) {
      if (input.signal.aborted) throw error;
      failure = error instanceof Error ? error : new Error("Network error while searching GIFs.");
      recordGifEvent(input.code, input.pid, provider, error instanceof ProviderError && error.status === 429 ? "quota_blocked" : "search_error");
      console.info("gif_search_failed", { code: input.code, provider, status: error instanceof ProviderError ? error.status : 0 });
      if (!(error instanceof ProviderError) || error.status !== 429) throw failure;
      input.onCooldown(provider, Date.now() + error.retryAfter * 1000);
    }
  }
  throw failure;
}
export async function reportMediaSelection(item: MediaResult, code: string, pid: string) {
  if (item.source === "local") return;
  const adapter = remoteProviders[item.source];
  if (!adapter?.reportSelection) return;
  try {
    // Share reporting is also a provider request; reserve quota rather than bypass it.
    await reserveProviderRequest(item.source, code, pid);
    await adapter.reportSelection(item, pid);
  } catch {
    console.info("gif_selection_reporting_failed", { code, provider: item.source });
  }
}
