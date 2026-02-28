import { del } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  let urls: string[] = [];
  try {
    const body = await req.json();
    urls = Array.isArray(body.urls) ? body.urls.filter((u: unknown) => typeof u === "string" && u.startsWith("https://")) : [];
  } catch {
    return NextResponse.json({ ok: false });
  }

  if (urls.length === 0) return NextResponse.json({ ok: true });

  try {
    await del(urls);
  } catch {
    // best-effort — blobs will expire naturally
  }

  return NextResponse.json({ ok: true });
}
