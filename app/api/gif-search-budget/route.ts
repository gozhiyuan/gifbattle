import { NextRequest, NextResponse } from "next/server";
import { checkGifSearchBudget, getRoomState, isRoomPlayer } from "@/lib/room-security";
export async function POST(req: NextRequest) {
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_request" }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const { provider, pid } = body;
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!code || typeof pid !== "string" || !["giphy", "klipy"].includes(provider))
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const configured = provider === "giphy" ? process.env.NEXT_PUBLIC_GIPHY_KEY : process.env.NEXT_PUBLIC_KLIPY_KEY;
  if (!configured) return NextResponse.json({ error: "provider_unavailable" }, { status: 503 });
  const room = await getRoomState(code);
  if (!isRoomPlayer(room, pid)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const budget = await checkGifSearchBudget(provider);
  console.info("gif_search_budget", { code, provider, allowed: budget.allowed });
  if (!budget.allowed) return NextResponse.json({ error: "rate_limited", retryAfter: budget.retryAfterSec },
    { status: 429, headers: { "Retry-After": String(budget.retryAfterSec) } });
  return NextResponse.json({ ok: true });
}
