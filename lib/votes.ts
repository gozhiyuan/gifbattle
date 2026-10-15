export type VoteSide = "left" | "right";

type VoteRoom = {
  phase?: string;
  submitDeadline?: number | null;
  votingRound?: number;
  currentMatchup?: number;
  matchups?: string[][];
  voteDeadline?: number | null;
  players?: { id: string }[];
};

// The deadline is set from the host's clock, so allow a little skew against the server clock.
// Tallies are taken by the host at its own deadline, so a late vote can't change a shown result.
export const VOTE_DEADLINE_GRACE_MS = 3000;

// Scoped to the game (submitDeadline is the per-game ID, reset on Play Again) so a second game in
// the same room never sees or collides with the first game's votes for the same round and matchup.
export const voteKey = (code: string, gameId: number, round: number, matchup: number, pid: string) =>
  `gifbattle:vote:${code}:${gameId}:${round}:${matchup}:${pid}`;

// Returns why a vote must be rejected, or null when it is allowed.
export function voteRejection(
  room: VoteRoom | null,
  pid: string,
  round: unknown,
  matchup: unknown,
  side: unknown,
  now: number
): null | "invalid_request" | "voting_closed" | "not_eligible" {
  if (!Number.isInteger(round) || !Number.isInteger(matchup) || (side !== "left" && side !== "right")) return "invalid_request";
  if (!room || room.phase !== "voting" || room.votingRound !== round || room.currentMatchup !== matchup) return "voting_closed";
  if (!Number.isSafeInteger(room.submitDeadline)) return "voting_closed";
  if (typeof room.voteDeadline !== "number" || room.voteDeadline + VOTE_DEADLINE_GRACE_MS < now) return "voting_closed";
  const pair = room.matchups?.[matchup as number];
  if (!Array.isArray(pair) || pair.length < 2) return "voting_closed";
  // Contestants can't vote on their own matchup
  if (pair.includes(pid) || !room.players?.some((p) => p.id === pid)) return "not_eligible";
  return null;
}
