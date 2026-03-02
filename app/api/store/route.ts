import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";

const redis = Redis.fromEnv();
const READ_PREFIXES = ["gifbattle:room:", "gifbattle:vote:", "gifbattle:hb:"];
const WRITE_PREFIXES = ["gifbattle:vote:", "gifbattle:hb:"];
const isAllowedReadKey = (key: string) => READ_PREFIXES.some((prefix) => key.startsWith(prefix));
const isAllowedWriteKey = (key: string) => WRITE_PREFIXES.some((prefix) => key.startsWith(prefix));
const ROOM_PREFIX = "gifbattle:room:";

const sanitizeRoomJson = (json: string): string => {
  try {
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === "object" && "geminiKey" in parsed) {
      delete (parsed as Record<string, unknown>).geminiKey;
      return JSON.stringify(parsed);
    }
  } catch {}
  return json;
};

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json(null);
  if (!isAllowedReadKey(key)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let raw = await redis.get(key);
  if (raw != null && key.startsWith(ROOM_PREFIX)) {
    const serialized = typeof raw === "string" ? raw : JSON.stringify(raw);
    const sanitized = sanitizeRoomJson(serialized);
    if (sanitized !== serialized) {
      raw = sanitized;
      await redis.set(key, sanitized, { ex: 86400 });
    }
  }
  if (raw === null) return NextResponse.json(null);
  // @upstash/redis auto-deserializes valid JSON on retrieval, so re-serialize
  // if needed to ensure the client always receives { value: string }
  const value = typeof raw === "string" ? raw : JSON.stringify(raw);
  return NextResponse.json({ value });
}

export async function POST(req: NextRequest) {
  const { key, value } = await req.json();
  if (typeof key !== "string" || !isAllowedWriteKey(key)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  await redis.set(key, value, { ex: 86400 }); // auto-expire after 24h
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  const prefix = req.nextUrl.searchParams.get("prefix");
  if (prefix) {
    return NextResponse.json({ error: "prefix_delete_disabled" }, { status: 403 });
  }
  if (key) {
    if (!isAllowedWriteKey(key)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    await redis.del(key);
  }
  return NextResponse.json({ ok: true });
}
