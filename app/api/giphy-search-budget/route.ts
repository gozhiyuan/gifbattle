import { NextRequest, NextResponse } from "next/server";
import { checkGiphySearchBudget, getRoomState, isRoomPlayer } from "@/lib/room-security";

export async function POST(req: NextRequest) {
  let code = "";
  let pid = "";
  try {
    const body = await req.json();
    code = (body.code || "").trim().toUpperCase();
    pid = body.pid || "";
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  if (!code || !pid) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const room = await getRoomState(code);
  if (!isRoomPlayer(room, pid)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const budget = await checkGiphySearchBudget();
  if (!budget.allowed) {
    return NextResponse.json(
      { error: "rate_limited", retryAfter: budget.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(budget.retryAfterSec) } }
    );
  }

  return NextResponse.json({ ok: true });
}
