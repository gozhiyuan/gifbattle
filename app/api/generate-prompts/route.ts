import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  let playerNames: string[] = [];
  let clientKey = "";
  try {
    const body = await req.json();
    playerNames = body.playerNames ?? [];
    clientKey = body.apiKey ?? "";
  } catch {
    return NextResponse.json({ prompts: [] });
  }

  const apiKey = clientKey || process.env.ANTHROPIC_API_KEY || "";
  if (!apiKey) {
    return NextResponse.json({ error: "not configured" });
  }

  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create(
      {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        system:
          'You generate short, funny GIF-search prompts for a party game. Each prompt should be 5–12 words, starting with "When", "Me", or "That moment when". Make some reference the player names provided. Output ONLY a valid JSON array of 6 strings, no other text.',
        messages: [
          {
            role: "user",
            content: `Player names: ${playerNames.join(", ") || "the players"}`,
          },
        ],
      },
      { timeout: 10000 }
    );

    const text =
      message.content[0].type === "text" ? message.content[0].text : "";
    try {
      const prompts = JSON.parse(text);
      return NextResponse.json({ prompts: Array.isArray(prompts) ? prompts : [] });
    } catch {
      return NextResponse.json({ prompts: [] });
    }
  } catch (e: unknown) {
    // Surface auth errors so the client can show a useful message
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("401") || msg.includes("invalid") || msg.includes("auth")) {
      return NextResponse.json({ error: "invalid key" });
    }
    return NextResponse.json({ prompts: [] });
  }
}
