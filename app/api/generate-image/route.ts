import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

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

export async function POST(req: NextRequest) {
  let textAnswer = "", gamePrompt = "", style = "random", apiKey = "";
  try {
    const body = await req.json();
    textAnswer = body.textAnswer ?? "";
    gamePrompt = body.gamePrompt ?? "";
    style = body.style ?? "random";
    apiKey = body.apiKey ?? "";
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  if (!apiKey) return NextResponse.json({ error: "invalid_key" }, { status: 401 });
  if (!textAnswer.trim()) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const resolvedStyle = style === "random"
    ? STYLE_PROMPTS[STYLE_KEYS[Math.floor(Math.random() * STYLE_KEYS.length)]]
    : (STYLE_PROMPTS[style] ?? STYLE_PROMPTS.anime);

  const prompt = `Create a ${resolvedStyle} illustration that humorously captures this reaction:\n\nQuestion: "${gamePrompt}"\nPlayer's answer: "${textAnswer}"\n\nThe image should visually represent this answer as a funny, expressive response to the question. Make it relatable and comedic.`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
        }),
      }
    );

    if (res.status === 400 || res.status === 401 || res.status === 403) {
      return NextResponse.json({ error: "invalid_key" }, { status: 401 });
    }
    if (!res.ok) {
      return NextResponse.json({ error: "generation_failed" }, { status: 500 });
    }

    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((p: { inlineData?: { mimeType?: string; data?: string } }) =>
      p.inlineData?.mimeType?.startsWith("image/")
    );

    if (!imagePart?.inlineData?.data) {
      return NextResponse.json({ error: "generation_failed" }, { status: 500 });
    }

    const buffer = Buffer.from(imagePart.inlineData.data, "base64");
    const mimeType = imagePart.inlineData.mimeType as string;
    const ext = mimeType.split("/")[1] ?? "png";
    const filename = `gifbattle-ai-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const blob = await put(filename, buffer, {
      access: "public",
      contentType: mimeType,
    });

    return NextResponse.json({ url: blob.url });
  } catch {
    return NextResponse.json({ error: "generation_failed" }, { status: 500 });
  }
}
