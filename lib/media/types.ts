export type RemoteProvider = "giphy" | "klipy";
export type MediaSource = RemoteProvider | "local";
export interface MediaResult {
  id: string;
  source: MediaSource;
  providerId: string;
  format: "image" | "animation";
  previewUrl: string;
  displayUrl: string;
  width?: number;
  height?: number;
  searchQuery?: string;
  captionable?: boolean;
  captionLayout?: "top-bottom" | "bottom";
  captionMaxLength?: number;
  title?: string;
  attribution?: { label: string; url: string };
  license?: { label: string; url: string };
}
export interface SearchInput {
  seed?: string;
  query: string;
  category?: string;
  captionable?: boolean;
  pageSize: number;
  cursor?: string;
  customerId: string;
  signal?: AbortSignal;
}
export interface SearchPage { items: MediaResult[]; nextCursor?: string; revision?: string; total?: number }
export interface GifProvider {
  id: MediaSource;
  search(input: SearchInput): Promise<SearchPage>;
  reportSelection?(item: MediaResult, customerId: string): Promise<void>;
}
export class ProviderError extends Error {
  constructor(message: string, public status = 0, public retryAfter = 60) { super(message); }
}
export async function providerJson(response: Response) {
  if (!response.ok) throw new ProviderError("GIF search failed. Please try again.", response.status,
    Number(response.headers.get("Retry-After")) || 3600);
  return response.json();
}
