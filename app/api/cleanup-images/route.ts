import { del } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import {
  getRoomAiSubmissionUrls,
  authorizeRoomPlayer,
  isManagedAiBlobUrl,
} from "@/lib/room-security";

export async function POST(req: NextRequest) {
  let code = "";
  let pid = "";
  let token = "";
  let urls: string[] = [];
  try {
    const body = await req.json();
    code = (body.code || "").trim().toUpperCase();
    pid = body.pid || "";
    token = body.token || "";
    urls = Array.isArray(body.urls) ? body.urls.filter((u: unknown) => typeof u === "string" && isManagedAiBlobUrl(u)) : [];
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  if (!code || !pid) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const room = await authorizeRoomPlayer(code, pid, token, { host: true });
  if (!room) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const allowedUrls = new Set(room ? getRoomAiSubmissionUrls(room) : []);
  const ownedUrls = urls.filter((u) => allowedUrls.has(u));
  if (urls.length === 0) return NextResponse.json({ ok: true });
  if (ownedUrls.length === 0) return NextResponse.json({ ok: true, deleted: 0 });

  try {
    await del(ownedUrls);
  } catch {
    // best-effort cleanup; if this fails, retry from an admin workflow
  }

  return NextResponse.json({ ok: true, deleted: ownedUrls.length });
}
