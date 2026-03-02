import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import {
  checkRoomRateLimit,
  getRoomGeminiKey,
  getRoomState,
  isRoomPlayer,
} from "@/lib/room-security";
import { fetchWithRetry } from "@/lib/gemini-retry";

export const maxDuration = 60;

const STYLE_PROMPTS: Record<string, string> = {
  anime: "anime/manga illustration style",
  watercolor: "watercolor painting style",
  pixel: "8-bit pixel art style",
  oil: "oil painting style",
  neon: "neon cyberpunk style",
  minimal: "minimalist line art style",
  vintage: "vintage retro poster style",
  comic: "comic book style",
};

const STYLE_KEYS = Object.keys(STYLE_PROMPTS);
const IMAGE_MODEL = "gemini-2.5-flash-image";
const IMAGE_TIMEOUT_MS = 25000;
const IMAGE_BLOCK_REASONS = new Set([
  "SAFETY",
  "PROHIBITED_CONTENT",
  "BLOCKLIST",
  "IMAGE_SAFETY",
  "SPII",
]);

export async function POST(req: NextRequest) {
  let textAnswer = "", gamePrompt = "", style = "random";
  let roomCode = "", pid = "";
  try {
    const body = await req.json();
    textAnswer = body.textAnswer ?? "";
    gamePrompt = body.gamePrompt ?? "";
    style = body.style ?? "random";
    roomCode = (body.roomCode ?? "").trim().toUpperCase();
    pid = body.pid ?? "";
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  if (!roomCode || !pid) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const room = await getRoomState(roomCode);
  if (!isRoomPlayer(room, pid)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!blobToken) return NextResponse.json({ error: "storage_not_configured" }, { status: 500 });

  const apiKey = await getRoomGeminiKey(roomCode);
  if (!apiKey) return NextResponse.json({ error: "not_configured" }, { status: 400 });
  if (!textAnswer.trim()) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const limit = await checkRoomRateLimit(roomCode, "image");
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "rate_limited", retryAfter: limit.retryAfterSec, scope: limit.scope },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  const resolvedStyle = style === "random"
    ? STYLE_PROMPTS[STYLE_KEYS[Math.floor(Math.random() * STYLE_KEYS.length)]]
    : (STYLE_PROMPTS[style] ?? STYLE_PROMPTS.anime);

  const prompt = `Create a ${resolvedStyle} illustration that humorously captures this reaction:\n\nQuestion: "${gamePrompt}"\nPlayer's answer: "${textAnswer}"\n\nThe image should visually represent this answer as a funny, expressive response to the question. Make it relatable and comedic.`;

  try {
    const res = await fetchWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
        }),
      },
      { attempts: 2, perAttemptTimeoutMs: IMAGE_TIMEOUT_MS, baseDelayMs: 400, maxDelayMs: 1500 }
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
        return NextResponse.json({ error: "invalid_key" }, { status: 401 });
      }
      if (res.status === 400) {
        return NextResponse.json({ error: "provider_bad_request" }, { status: 400 });
      }
      if (res.status === 429 || res.status >= 500) {
        return NextResponse.json({ error: "generation_busy" }, { status: 503 });
      }
      return NextResponse.json({ error: "generation_failed" }, { status: 500 });
    }

    const data = await res.json();
    const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
    const promptFeedbackBlockReason = String(data?.promptFeedback?.blockReason || "").toUpperCase();
    const blockedByPrompt = IMAGE_BLOCK_REASONS.has(promptFeedbackBlockReason);
    const blockedByCandidates = candidates.length > 0 &&
      candidates.every((c: { finishReason?: string }) =>
        IMAGE_BLOCK_REASONS.has(String(c?.finishReason || "").toUpperCase())
      );
    if (blockedByPrompt || blockedByCandidates) {
      return NextResponse.json({ error: "generation_blocked" }, { status: 400 });
    }

    let imageData = "";
    let mimeType = "image/png";
    for (const candidate of candidates) {
      const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
      const imagePart = parts.find((p: { inlineData?: { mimeType?: string; data?: string } }) =>
        p.inlineData?.mimeType?.startsWith("image/") && typeof p.inlineData?.data === "string"
      );
      if (!imagePart?.inlineData?.data) continue;
      imageData = imagePart.inlineData.data;
      mimeType = imagePart.inlineData.mimeType || mimeType;
      break;
    }

    if (!imageData) {
      return NextResponse.json({ error: "provider_no_image" }, { status: 502 });
    }

    const buffer = Buffer.from(imageData, "base64");
    const ext = mimeType.split("/")[1] ?? "png";
    const filename = `gifbattle-ai-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    let blob;
    try {
      blob = await put(filename, buffer, {
        access: "public",
        contentType: mimeType,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message.toLowerCase() : "";
      if (msg.includes("blob") && (msg.includes("token") || msg.includes("unauthorized") || msg.includes("forbidden"))) {
        return NextResponse.json({ error: "storage_not_configured" }, { status: 500 });
      }
      return NextResponse.json({ error: "storage_failed" }, { status: 500 });
    }

    return NextResponse.json({ url: blob.url });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message.toLowerCase() : "";
    if (msg.includes("timeout") || msg.includes("aborted")) {
      return NextResponse.json({ error: "generation_timeout" }, { status: 504 });
    }
    return NextResponse.json({ error: "generation_failed" }, { status: 500 });
  }
}
