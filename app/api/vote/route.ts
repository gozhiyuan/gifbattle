import { NextRequest, NextResponse } from "next/server";
import { authorizeRoomPlayer, recordRoomVote } from "@/lib/room-security";
import { voteKey, voteRejection } from "@/lib/votes";

// Votes used to be written straight through /api/store, which let anyone with the room code
// cast or delete votes for any player. Now a vote needs the voter's room token and an open matchup.
export async function POST(req: NextRequest) {
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_request" }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const { pid, token, round, matchup, side } = body;
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!code || typeof pid !== "string" || !pid) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const room = await authorizeRoomPlayer(code, pid, token);
  if (!room) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const rejection = voteRejection(room, pid, round, matchup, side, Date.now());
  if (rejection === "invalid_request") return NextResponse.json({ error: rejection }, { status: 400 });
  if (rejection === "not_eligible") return NextResponse.json({ error: rejection }, { status: 403 });
  if (rejection) return NextResponse.json({ error: rejection }, { status: 409 });

  const result = await recordRoomVote(voteKey(code, round, matchup, pid), side);
  if (result === "conflict") return NextResponse.json({ error: "already_voted" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
