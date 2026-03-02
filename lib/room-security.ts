import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();
export const ACTIVE_ROOM_TTL_SECS = 4 * 60 * 60;
export const LOBBY_ROOM_TTL_SECS = 1800;
export const GAME_OVER_ROOM_TTL_SECS = 15 * 60;
const CREDENTIAL_TTL_SECS = 86400;

type RoomPlayer = { id: string; nickname?: string };

export type RoomState = {
  code?: string;
  host?: string;
  players?: RoomPlayer[];
  submissions?: Record<string, Array<{ type?: string; url?: string }>>;
};

type RateBucket = "image" | "prompt";
type RateLimitConfig = { perMinute: number; perHour: number };
export type RoomRateLimitResult = {
  allowed: boolean;
  retryAfterSec: number;
  scope: "minute" | "hour" | null;
};

const roomKey = (code: string) => `gifbattle:room:${code}`;
const geminiKey = (code: string) => `gifbattle:gemini:${code}`;
const roomPlayerTokenKey = (code: string, pid: string) => `gifbattle:ptoken:${code}:${pid}`;
const rateKey = (bucket: RateBucket, code: string, scope: "minute" | "hour", window: number) =>
  `gifbattle:rl:${bucket}:${scope}:${code}:${window}`;

const normalizeCode = (code: string) => code.trim().toUpperCase();
const RATE_LIMITS: Record<RateBucket, RateLimitConfig> = {
  image: { perMinute: 8, perHour: 120 },
  prompt: { perMinute: 18, perHour: 240 },
};
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const VERCEL_BLOB_HOST_PATTERN = /(^|\.)public\.blob\.vercel-storage\.com$/i;
const logRedisError = (op: string, details: Record<string, unknown>, error: unknown) => {
  console.error(`room_security_${op}_failed`, { ...details, error });
};

const toRoomState = (raw: unknown): RoomState | null => {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as RoomState;
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return raw as RoomState;
  return null;
};

export async function getRoomState(code: string): Promise<RoomState | null> {
  const c = normalizeCode(code);
  if (!c) return null;
  try {
    const raw = await redis.get(roomKey(c));
    return toRoomState(raw);
  } catch (error) {
    logRedisError("get_room_state", { code: c }, error);
    throw error;
  }
}

export const isRoomPlayer = (room: RoomState | null, pid: string) =>
  Boolean(pid && room?.players?.some((p) => p.id === pid));

export const isRoomHost = (room: RoomState | null, pid: string) =>
  Boolean(pid && room?.host === pid);

export async function getRoomGeminiKey(code: string): Promise<string> {
  const c = normalizeCode(code);
  if (!c) return "";
  try {
    const raw = await redis.get(geminiKey(c));
    if (typeof raw === "string") return raw;
    return "";
  } catch (error) {
    logRedisError("get_room_gemini_key", { code: c }, error);
    throw error;
  }
}

export async function upsertRoomGeminiKey(code: string, key: string): Promise<void> {
  const c = normalizeCode(code);
  if (!c) return;
  const trimmed = key.trim();
  try {
    if (!trimmed) {
      await redis.del(geminiKey(c));
      return;
    }
    await redis.set(geminiKey(c), trimmed, { ex: CREDENTIAL_TTL_SECS });
  } catch (error) {
    logRedisError("upsert_room_gemini_key", { code: c, hasKey: Boolean(trimmed) }, error);
    throw error;
  }
}

const makeRoomPlayerToken = () => `${crypto.randomUUID()}${crypto.randomUUID().replace(/-/g, "")}`;

export async function issueRoomPlayerToken(code: string, pid: string): Promise<string> {
  const c = normalizeCode(code);
  const playerId = pid.trim();
  if (!c || !playerId) return "";
  const token = makeRoomPlayerToken();
  try {
    await redis.set(roomPlayerTokenKey(c, playerId), token, { ex: CREDENTIAL_TTL_SECS });
  } catch (error) {
    logRedisError("issue_room_player_token", { code: c, playerId }, error);
    throw error;
  }
  return token;
}

export async function revokeRoomPlayerToken(code: string, pid: string): Promise<void> {
  const c = normalizeCode(code);
  const playerId = pid.trim();
  if (!c || !playerId) return;
  try {
    await redis.del(roomPlayerTokenKey(c, playerId));
  } catch (error) {
    logRedisError("revoke_room_player_token", { code: c, playerId }, error);
    throw error;
  }
}

export async function isValidRoomPlayerToken(
  code: string,
  pid: string,
  token: string
): Promise<boolean> {
  const c = normalizeCode(code);
  const playerId = pid.trim();
  const presented = token.trim();
  if (!c || !playerId || !presented) return false;
  try {
    const stored = await redis.get(roomPlayerTokenKey(c, playerId));
    return typeof stored === "string" && stored === presented;
  } catch (error) {
    logRedisError("is_valid_room_player_token", { code: c, playerId }, error);
    throw error;
  }
}

const secondsUntilReset = (nowMs: number, windowMs: number) =>
  Math.max(1, Math.ceil((windowMs - (nowMs % windowMs)) / 1000));

const incrWithTtl = async (key: string, ttlSec: number) => {
  // MULTI keeps INCR + EXPIRE together to avoid stranded keys without TTL.
  const tx = redis.multi();
  tx.incr(key);
  tx.expire(key, ttlSec);
  const result = await tx.exec();
  const first = Array.isArray(result) ? result[0] : 0;
  return Number(Array.isArray(first) ? first[1] : first);
};

export async function checkRoomRateLimit(
  code: string,
  bucket: RateBucket
): Promise<RoomRateLimitResult> {
  const c = normalizeCode(code);
  if (!c) return { allowed: false, retryAfterSec: 60, scope: "minute" };

  try {
    const now = Date.now();
    const cfg = RATE_LIMITS[bucket];

    const minuteWindow = Math.floor(now / MINUTE_MS);
    const minuteCount = await incrWithTtl(
      rateKey(bucket, c, "minute", minuteWindow),
      2 * 60
    );
    if (minuteCount > cfg.perMinute) {
      return {
        allowed: false,
        retryAfterSec: secondsUntilReset(now, MINUTE_MS),
        scope: "minute",
      };
    }

    const hourWindow = Math.floor(now / HOUR_MS);
    const hourCount = await incrWithTtl(
      rateKey(bucket, c, "hour", hourWindow),
      2 * 60 * 60
    );
    if (hourCount > cfg.perHour) {
      return {
        allowed: false,
        retryAfterSec: secondsUntilReset(now, HOUR_MS),
        scope: "hour",
      };
    }

    return { allowed: true, retryAfterSec: 0, scope: null };
  } catch (error) {
    logRedisError("check_room_rate_limit", { code: c, bucket }, error);
    return { allowed: false, retryAfterSec: 60, scope: "minute" };
  }
}

export const isManagedAiBlobUrl = (url: string): boolean => {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    if (!VERCEL_BLOB_HOST_PATTERN.test(u.hostname)) return false;
    const filename = u.pathname.split("/").pop() || "";
    return filename.startsWith("gifbattle-ai-");
  } catch {
    return false;
  }
};

export const getRoomAiSubmissionUrls = (room: RoomState): string[] => {
  const submissions = room.submissions || {};
  return Object.values(submissions)
    .flat()
    .filter((s) => s?.type === "ai" && typeof s.url === "string")
    .map((s) => s.url as string)
    .filter(isManagedAiBlobUrl);
};

export async function checkIpRateLimit(
  action: "create" | "join",
  ip: string
): Promise<{ allowed: boolean; retryAfterSec: number }> {
  try {
    const limits: Record<"create" | "join", number> = { create: 5, join: 30 };
    const now = Date.now();
    const window = Math.floor(now / MINUTE_MS);
    const key = `gifbattle:rl:${action}:ip:${ip}:${window}`;
    const count = await incrWithTtl(key, 2 * 60);
    if (count > limits[action]) {
      return { allowed: false, retryAfterSec: secondsUntilReset(now, MINUTE_MS) };
    }
    return { allowed: true, retryAfterSec: 0 };
  } catch (error) {
    logRedisError("check_ip_rate_limit", { action, ip }, error);
    return { allowed: false, retryAfterSec: 60 };
  }
}
