import { RemoteProvider } from "./types";
export function recordGifEvent(code: string, pid: string, provider: RemoteProvider, event: "search_sent" | "search_error" | "pagination_sent" | "quota_blocked") {
  void fetch("/api/gif-events", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, pid, provider, event }), keepalive: true }).catch(() => {});
}
