import { NextRequest, NextResponse } from "next/server";
import {
  getRoomState,
  isRoomHost,
  isRoomPlayer,
  upsertRoomGeminiKey,
  getRoomGeminiKey,
} from "@/lib/room-security";

export async function GET(req: NextRequest) {
  const code = (req.nextUrl.searchParams.get("code") || "").trim().toUpperCase();
  const pid = req.nextUrl.searchParams.get("pid") || "";
  if (!code || !pid) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const room = await getRoomState(code);
  if (!isRoomPlayer(room, pid)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const key = await getRoomGeminiKey(code);
  return NextResponse.json({ exists: Boolean(key) });
}

export async function POST(req: NextRequest) {
  let code = "";
  let pid = "";
  let key = "";
  try {
    const body = await req.json();
    code = (body.code || "").trim().toUpperCase();
    pid = body.pid || "";
    key = body.key || "";
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  if (!code || !pid) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const room = await getRoomState(code);
  if (!isRoomHost(room, pid)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await upsertRoomGeminiKey(code, key);
  return NextResponse.json({ ok: true, exists: Boolean(key.trim()) });
}
