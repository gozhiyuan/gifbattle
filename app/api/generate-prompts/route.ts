import { NextRequest, NextResponse } from "next/server";
import {
  checkRoomRateLimit,
  getRoomGeminiKey,
  getRoomState,
  isRoomPlayer,
} from "@/lib/room-security";
import { fetchWithRetry } from "@/lib/gemini-retry";

export const maxDuration = 30;

const DEFAULT_MODEL = "gemini-2.5-flash";
const ALLOWED_MODELS = new Set([
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  // Graceful fallback for stale room config values from older builds.
  "gemini-2.0-flash-exp",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
]);

const sanitizePrompt = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, 120);
};

const normalizePromptList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((v): v is string => typeof v === "string")
        .map(v => sanitizePrompt(v))
        .filter(Boolean)
    )
  );
};

const tryParsePromptArray = (text: string): string[] => {
  const direct = normalizePromptList((() => {
    try { return JSON.parse(text); } catch { return null; }
  })());
  if (direct.length > 0) return direct;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] ?? "";
  if (fenced) {
    const fromFence = normalizePromptList((() => {
      try { return JSON.parse(fenced); } catch { return null; }
    })());
    if (fromFence.length > 0) return fromFence;
  }

  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch?.[0]) {
    const fromArraySlice = normalizePromptList((() => {
      try { return JSON.parse(arrMatch[0]); } catch { return null; }
    })());
    if (fromArraySlice.length > 0) return fromArraySlice;
  }

  return [];
};

const tryParsePromptLines = (text: string): string[] => {
  const lines = text
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.replace(/^[-*•]\s+/, ""))
    .map(line => line.replace(/^\d+[.)]\s+/, ""))
    .map(line => sanitizePrompt(line))
    .filter(Boolean);
  return Array.from(new Set(lines)).slice(0, 6);
};

export async function POST(req: NextRequest) {
  let existingPrompts: string[] = [];
  let roomCode = "";
  let pid = "";
  let model = DEFAULT_MODEL;
  try {
    const body = await req.json();
    existingPrompts = Array.isArray(body.existingPrompts) ? body.existingPrompts : [];
    roomCode = (body.roomCode ?? "").trim().toUpperCase();
    pid = body.pid ?? "";
    model = body.model ?? DEFAULT_MODEL;
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  if (!roomCode || !pid) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const room = await getRoomState(roomCode);
  if (!isRoomPlayer(room, pid)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const apiKey = await getRoomGeminiKey(roomCode);
  if (!apiKey) {
    return NextResponse.json({ error: "not configured" }, { status: 400 });
  }
  if (!ALLOWED_MODELS.has(model)) model = DEFAULT_MODEL;
  const limit = await checkRoomRateLimit(roomCode, "prompt");
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "rate_limited", retryAfter: limit.retryAfterSec, scope: limit.scope },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  const promptSeeds = Array.from(
    new Set(existingPrompts.map(sanitizePrompt).filter(Boolean))
  ).slice(0, 30);

  const systemInstruction =
    'You generate short, funny GIF-search prompts for a party game. Create fresh prompts that match the style of the provided questions. Each prompt must be 5–12 words, start with "When", "Me", or "That moment when", and avoid repeating or lightly rewording any provided prompt. Keep content safe for a general party game audience. Output ONLY a valid JSON array of 6 strings, no other text.';

  const userContent = promptSeeds.length
    ? `Existing questions to enrich:\n- ${promptSeeds.join("\n- ")}`
    : "No existing custom questions were provided. Generate 6 broadly funny party-game prompts.";

  try {
    const res = await fetchWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userContent }] }],
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: {
            maxOutputTokens: 1024,
            responseMimeType: "application/json",
          },
        }),
      },
      { attempts: 3, perAttemptTimeoutMs: 5000, baseDelayMs: 400, maxDelayMs: 1500 }
    );

    if (!res.ok) {
      let providerMsg = "";
      let providerStatus = "";
      try {
        const errData = await res.json();
        providerMsg = String(errData?.error?.message || "");
        providerStatus = String(errData?.error?.status || "").toUpperCase();
      } catch {}
      if (
        res.status === 401 ||
        res.status === 403 ||
        providerStatus === "PERMISSION_DENIED" ||
        providerStatus === "UNAUTHENTICATED" ||
        /api key|auth|permission/i.test(providerMsg)
      ) {
        return NextResponse.json({ error: "invalid key" }, { status: 401 });
      }
      if (res.status === 400) {
        return NextResponse.json({ error: "provider_bad_request" }, { status: 400 });
      }
      if (res.status === 429 || res.status >= 500) {
        return NextResponse.json({ error: "generation_busy" }, { status: 503 });
      }
      return NextResponse.json({ error: "generation_failed" }, { status: 502 });
    }

    const data = await res.json();
    const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
    const promptFeedbackBlockReason = String(data?.promptFeedback?.blockReason || "").toUpperCase();
    const blockedPromptReasons = new Set([
      "SAFETY",
      "PROHIBITED_CONTENT",
      "BLOCKLIST",
      "IMAGE_SAFETY",
      "SPII",
    ]);
    const blockedFinishReasons = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII"]);
    const blocked = blockedPromptReasons.has(promptFeedbackBlockReason) ||
      (candidates.length > 0 && candidates.every((c: { finishReason?: string }) => blockedFinishReasons.has(String(c?.finishReason || "").toUpperCase())));
    if (blocked) {
      return NextResponse.json({ error: "generation_blocked" }, { status: 400 });
    }

    for (const candidate of candidates) {
      const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
      const text = parts
        .map((part: { text?: unknown }) => (typeof part?.text === "string" ? part.text : ""))
        .join("\n")
        .trim();
      if (!text) continue;
      const prompts = tryParsePromptArray(text);
      if (prompts.length > 0) {
        return NextResponse.json({ prompts });
      }
      const linePrompts = tryParsePromptLines(text);
      if (linePrompts.length > 0) {
        return NextResponse.json({ prompts: linePrompts });
      }
    }

    return NextResponse.json({ error: "generation_failed" }, { status: 502 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("401") || msg.includes("invalid") || msg.includes("auth")) {
      return NextResponse.json({ error: "invalid key" }, { status: 401 });
    }
    return NextResponse.json({ error: "generation_failed" }, { status: 500 });
  }
}
