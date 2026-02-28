import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  let playerNames: string[] = [];
  let clientKey = "";
  let model = "gemini-2.0-flash-exp";
  try {
    const body = await req.json();
    playerNames = body.playerNames ?? [];
    clientKey = body.apiKey ?? "";
    model = body.model ?? "gemini-2.0-flash-exp";
  } catch {
    return NextResponse.json({ prompts: [] });
  }

  const apiKey = clientKey || "";
  if (!apiKey) {
    return NextResponse.json({ error: "not configured" });
  }

  const systemInstruction = 'You generate short, funny GIF-search prompts for a party game. Each prompt should be 5–12 words, starting with "When", "Me", or "That moment when". Make some reference the player names provided. Output ONLY a valid JSON array of 6 strings, no other text.';
  const userContent = `Player names: ${playerNames.join(", ") || "the players"}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userContent }] }],
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: { maxOutputTokens: 512 },
        }),
        signal: AbortSignal.timeout(10000),
      }
    );

    if (res.status === 400 || res.status === 401 || res.status === 403) {
      return NextResponse.json({ error: "invalid key" });
    }
    if (!res.ok) {
      return NextResponse.json({ prompts: [] });
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    try {
      const prompts = JSON.parse(text);
      return NextResponse.json({ prompts: Array.isArray(prompts) ? prompts : [] });
    } catch {
      return NextResponse.json({ prompts: [] });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("401") || msg.includes("invalid") || msg.includes("auth")) {
      return NextResponse.json({ error: "invalid key" });
    }
    return NextResponse.json({ prompts: [] });
  }
}
