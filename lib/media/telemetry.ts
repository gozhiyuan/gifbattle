import { RemoteProvider } from "./types";
import { getRoomToken } from "../room-token";
export function recordGifEvent(code: string, pid: string, provider: RemoteProvider, event: "search_sent" | "search_error" | "pagination_sent" | "quota_blocked") {
  void fetch("/api/gif-events", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, pid, token: getRoomToken(code), provider, event }), keepalive: true }).catch(() => {});
}
