import { NextRequest, NextResponse } from "next/server";
import {
  authorizeRoomPlayer,
  upsertRoomGeminiKey,
  getRoomGeminiKey,
} from "@/lib/room-security";

// GET takes the room token in a header so it stays out of URLs and request logs.
export async function GET(req: NextRequest) {
  const code = (req.nextUrl.searchParams.get("code") || "").trim().toUpperCase();
  const pid = req.nextUrl.searchParams.get("pid") || "";
  const token = req.headers.get("x-room-token") || "";
  if (!code || !pid) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  if (!(await authorizeRoomPlayer(code, pid, token))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const key = await getRoomGeminiKey(code);
  return NextResponse.json({ exists: Boolean(key) });
}

export async function POST(req: NextRequest) {
  let code = "";
  let pid = "";
  let token = "";
  let key = "";
  try {
    const body = await req.json();
    code = (body.code || "").trim().toUpperCase();
    pid = body.pid || "";
    token = body.token || "";
    key = body.key || "";
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  if (!code || !pid || typeof key !== "string") return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  if (!(await authorizeRoomPlayer(code, pid, token, { host: true }))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await upsertRoomGeminiKey(code, key);
  return NextResponse.json({ ok: true, exists: Boolean(key.trim()) });
}
