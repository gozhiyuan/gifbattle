import { NextRequest, NextResponse } from "next/server";
import { authorizeRoomPlayer, isRoomHost, recordGifMetric } from "@/lib/room-security";
export async function POST(req: NextRequest) {
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_request" }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const { code, pid, token, provider, event } = body;
  if (typeof code !== "string" || typeof pid !== "string" || !["giphy", "klipy"].includes(provider) ||
    !["search_sent", "search_error", "pagination_sent", "quota_blocked", "game_completed"].includes(event))
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const normalizedCode = code.trim().toUpperCase();
  const room = await authorizeRoomPlayer(normalizedCode, pid, token);
  if (!room) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (event === "game_completed" && (room.phase !== "game_over" || !isRoomHost(room, pid)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await recordGifMetric(normalizedCode, room.submitDeadline || 0, provider, event);
  return NextResponse.json({ ok: true });
}
