import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";

const redis = Redis.fromEnv();

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json(null);
  const raw = await redis.get(key);
  if (raw === null) return NextResponse.json(null);
  // @upstash/redis auto-deserializes valid JSON on retrieval, so re-serialize
  // if needed to ensure the client always receives { value: string }
  const value = typeof raw === "string" ? raw : JSON.stringify(raw);
  return NextResponse.json({ value });
}

export async function POST(req: NextRequest) {
  const { key, value } = await req.json();
  await redis.set(key, value, { ex: 86400 }); // auto-expire after 24h
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  const prefix = req.nextUrl.searchParams.get("prefix");
  if (key) {
    await redis.del(key);
  } else if (prefix) {
    // Scan and delete all keys matching prefix* (batch 100 at a time)
    let cursor = 0;
    do {
      const [next, keys] = await redis.scan(cursor, { match: `${prefix}*`, count: 100 });
      if (keys.length > 0) await redis.del(keys[0], ...keys.slice(1));
      cursor = Number(next);
    } while (cursor !== 0);
  }
  return NextResponse.json({ ok: true });
}
