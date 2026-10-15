import { Redis } from "@upstash/redis";
import { isValidPlayerId } from "./player-id";

export { isValidPlayerId };

const redis = Redis.fromEnv();
export const ACTIVE_ROOM_TTL_SECS = 4 * 60 * 60;
export const LOBBY_ROOM_TTL_SECS = 1800;
export const GAME_OVER_ROOM_TTL_SECS = 15 * 60;
const CREDENTIAL_TTL_SECS = 86400;

type RoomPlayer = { id: string; nickname?: string };

export type RoomState = {
  geminiModel?: string;
  phase?: string;
  submitDeadline?: number;
  prompts?: string[];
  roundPlan?: { participants?: string[]; cycle?: number; answerMode?: string }[];
  answerModePolicy?: string;
  alternateModes?: boolean;
  answerModeOverrides?: Record<string, 'meme' | 'write'>;
  votingRound?: number;
  currentMatchup?: number;
  matchups?: string[][];
  voteDeadline?: number | null;
  code?: string;
  host?: string;
  createdAt?: number;
  hostSince?: number;
  players?: RoomPlayer[];
  submissions?: Record<string, Array<{ type?: string; url?: string; assetId?: string; source?: string }>>;
};

type RateBucket = "image" | "prompt" | "meme" | "caption" | "contribution" | "media-event";
type RateLimitConfig = { perMinute: number; perHour: number };
export type RoomRateLimitResult = {
  allowed: boolean;
  retryAfterSec: number;
  scope: "minute" | "hour" | null;
};

export type GiphySearchBudgetResult = {
  allowed: boolean;
  retryAfterSec: number;
};

const roomKey = (code: string) => `gifbattle:room:${code}`;
const geminiKey = (code: string) => `gifbattle:gemini:${code}`;
const roomPlayerTokenKey = (code: string, pid: string) => `gifbattle:ptoken:${code}:${pid}`;
const rateKey = (bucket: RateBucket, code: string, scope: "minute" | "hour", window: number) =>
  `gifbattle:rl:${bucket}:${scope}:${code}:${window}`;

const normalizeCode = (code: string) => code.trim().toUpperCase();
const RATE_LIMITS: Record<RateBucket, RateLimitConfig> = {
  image: { perMinute: 8, perHour: 120 },
  meme: { perMinute: 30, perHour: 300 },
  caption: { perMinute: 12, perHour: 120 },
  contribution: { perMinute: 12, perHour: 120 },
  "media-event": { perMinute: 240, perHour: 3000 },
  prompt: { perMinute: 18, perHour: 240 },
};
// Keep some headroom below GIPHY's 100-search beta-key limit so users see a
// helpful fallback instead of a provider 429. This is deliberately site-wide:
// all rooms share the deployment's public GIPHY key.
export const GIPHY_SEARCH_HOURLY_BUDGET = 85;
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
  const playerId = isValidPlayerId(pid) ? pid : "";
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
  const playerId = isValidPlayerId(pid) ? pid : "";
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
  const playerId = isValidPlayerId(pid) ? pid : "";
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

// Player IDs are visible to anyone holding the room code (room state is readable via /api/store),
// so a pid alone never proves identity. Routes that act for a player must also check the secret
// token issued at create/join. Returns the room when authorized, otherwise null.
export async function authorizeRoomPlayer(
  code: string,
  pid: unknown,
  token: unknown,
  opts: { host?: boolean } = {}
): Promise<RoomState | null> {
  if (!isValidPlayerId(pid) || typeof token !== "string" || !token || token.length > 200) return null;
  const room = await getRoomState(code);
  if (!(opts.host ? isRoomHost(room, pid) : isRoomPlayer(room, pid))) return null;
  if (!(await isValidRoomPlayerToken(code, pid, token))) return null;
  return room;
}

// One vote per player per matchup: the first write wins (SET NX). Re-sending the same vote is fine.
export async function recordRoomVote(key: string, side: string): Promise<"ok" | "conflict"> {
  try {
    const set = await redis.set(key, side, { nx: true, ex: 86400 });
    if (set === "OK") return "ok";
    const existing = await redis.get(key);
    return existing === side ? "ok" : "conflict";
  } catch (error) {
    logRedisError("record_room_vote", { key }, error);
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

export async function checkGiphySearchBudget(): Promise<GiphySearchBudgetResult> {
  return checkGifSearchBudget("giphy");
}

export async function checkGifSearchBudget(provider: "giphy" | "klipy"): Promise<GiphySearchBudgetResult> {
  try {
    const now = Date.now();
    const key = `gifbattle:rl:${provider}:global`;
    const configured = Number(provider === "giphy" ? process.env.GIPHY_SEARCH_HOURLY_BUDGET : process.env.KLIPY_SEARCH_HOURLY_BUDGET);
    const limit = Number.isInteger(configured) && configured > 0 ? configured : GIPHY_SEARCH_HOURLY_BUDGET;
    const result = await redis.eval<[number, number, number, string], [number, number]>(
      `
        redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", ARGV[1])
        local count = redis.call("ZCARD", KEYS[1])
        if count >= tonumber(ARGV[3]) then
          local oldest = redis.call("ZRANGE", KEYS[1], 0, 0, "WITHSCORES")
          return {0, tonumber(oldest[2])}
        end
        redis.call("ZADD", KEYS[1], ARGV[2], ARGV[4])
        redis.call("EXPIRE", KEYS[1], 3700)
        return {1, 0}
      `,
      [key],
      [now - HOUR_MS, now, limit, crypto.randomUUID()]
    );
    if (Number(result[0]) === 1) return { allowed: true, retryAfterSec: 0 };

    const oldestRequestAt = Number(result[1]);
    return {
      allowed: false,
      retryAfterSec: Number.isFinite(oldestRequestAt)
        ? Math.max(1, Math.ceil((oldestRequestAt + HOUR_MS - now) / 1000))
        : 60,
    };
  } catch (error) {
    logRedisError("check_gif_search_budget", { provider }, error);
    // Fail closed: an unavailable guard must not turn into a burst of direct
    // GIPHY calls that exhaust the shared key.
    return { allowed: false, retryAfterSec: 60 };
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

// Aggregate only: never store raw queries or player identifiers in GIF metrics.
// Client-reported counters are approximate product telemetry, not billing records.
export async function recordGifMetric(code: string, gameId: number, provider: string, event: string) {
  try {
    const key = `gifbattle:metrics:gifs:${code}:${gameId}`;
    if (event === "game_completed") {
      await redis.hset(key, { game_completed: 1 });
      console.info("gif_game_completed", { code, gameId, metrics: await redis.hgetall(key) });
    } else {
      await redis.hincrby(key, `${provider}:${event}`, 1);
    }
    await redis.expire(key, 7 * 86400);
  } catch (error) { logRedisError("gif_metric", { code, provider, event }, error); }
}
