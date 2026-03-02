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

type ProviderImageResult = {
  imageData: string;
  mimeType: string;
  blocked: boolean;
};

const isBlockedReason = (reason: string): boolean => {
  const normalized = reason.trim().toUpperCase();
  if (!normalized) return false;
  return (
    IMAGE_BLOCK_REASONS.has(normalized) ||
    normalized.includes("SAFETY") ||
    normalized.includes("BLOCK") ||
    normalized.includes("PROHIBITED")
  );
};

const extractInlineImage = (part: unknown): { data: string; mimeType: string } | null => {
  if (!part || typeof part !== "object") return null;
  const p = part as Record<string, unknown>;
  const inlineRaw = (p.inlineData ?? p.inline_data) as Record<string, unknown> | undefined;
  if (!inlineRaw || typeof inlineRaw !== "object") return null;

  let data = "";
  if (typeof inlineRaw.data === "string") data = inlineRaw.data;
  if (!data && typeof inlineRaw.bytesBase64Encoded === "string") data = inlineRaw.bytesBase64Encoded;
  data = data.trim();
  if (!data) return null;

  let mimeType = "";
  if (typeof inlineRaw.mimeType === "string") mimeType = inlineRaw.mimeType.trim();
  if (!mimeType && typeof inlineRaw.mime_type === "string") mimeType = inlineRaw.mime_type.trim();

  const dataUrlMatch = /^data:([^;]+);base64,(.+)$/i.exec(data);
  if (dataUrlMatch) {
    if (!mimeType) mimeType = dataUrlMatch[1];
    data = dataUrlMatch[2].trim();
  }
  if (!data) return null;
  if (!mimeType.startsWith("image/")) mimeType = "image/png";

  return { data, mimeType };
};

const extractProviderImage = (payload: unknown): ProviderImageResult => {
  const data = payload as Record<string, unknown> | null;
  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
  const promptFeedbackBlockReason = String((data?.promptFeedback as Record<string, unknown> | undefined)?.blockReason || "");
  const blockedByPrompt = isBlockedReason(promptFeedbackBlockReason);

  let blockedByCandidates = candidates.length > 0;
  for (const candidate of candidates) {
    const finishReason = String((candidate as Record<string, unknown> | null)?.finishReason || "");
    if (!isBlockedReason(finishReason)) blockedByCandidates = false;

    const c = candidate as Record<string, unknown> | null;
    const content = c?.content as Record<string, unknown> | undefined;
    const directParts = Array.isArray(c?.parts) ? c.parts : [];
    const contentParts = Array.isArray(content?.parts) ? content.parts : [];
    const parts = [...contentParts, ...directParts];
    for (const part of parts) {
      const inline = extractInlineImage(part);
      if (inline?.data) {
        return {
          imageData: inline.data,
          mimeType: inline.mimeType,
          blocked: blockedByPrompt || blockedByCandidates,
        };
      }
    }
  }

  return {
    imageData: "",
    mimeType: "image/png",
    blocked: blockedByPrompt || blockedByCandidates,
  };
};

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
    const requestImage = async (responseModalities: string[], promptText: string) =>
      fetchWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: { responseModalities },
          }),
        },
        { attempts: 2, perAttemptTimeoutMs: IMAGE_TIMEOUT_MS, baseDelayMs: 400, maxDelayMs: 1500 }
      );

    const mapProviderError = async (res: Response) => {
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
        return { error: "invalid_key", status: 401 };
      }
      if (res.status === 400) {
        return { error: "provider_bad_request", status: 400 };
      }
      if (res.status === 429 || res.status >= 500) {
        return { error: "generation_busy", status: 503 };
      }
      return { error: "generation_failed", status: 500 };
    };

    const firstRes = await requestImage(["IMAGE", "TEXT"], prompt);
    if (!firstRes.ok) {
      const mapped = await mapProviderError(firstRes);
      return NextResponse.json({ error: mapped.error }, { status: mapped.status });
    }

    const firstPayload = await firstRes.json();
    let parsed = extractProviderImage(firstPayload);
    if (parsed.blocked) {
      return NextResponse.json({ error: "generation_blocked" }, { status: 400 });
    }

    // Gemini occasionally returns text-only candidates with mixed modalities; one image-only retry
    // recovers many of these responses without user-visible errors.
    if (!parsed.imageData) {
      const retryPrompt = `${prompt}\n\nReturn an image output for this request.`;
      const secondRes = await requestImage(["IMAGE"], retryPrompt);
      if (!secondRes.ok) {
        const mapped = await mapProviderError(secondRes);
        return NextResponse.json({ error: mapped.error }, { status: mapped.status });
      }
      const secondPayload = await secondRes.json();
      parsed = extractProviderImage(secondPayload);
      if (parsed.blocked) {
        return NextResponse.json({ error: "generation_blocked" }, { status: 400 });
      }
    }

    const imageData = parsed.imageData;
    const mimeType = parsed.mimeType || "image/png";
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
