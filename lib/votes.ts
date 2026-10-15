export type VoteSide = "left" | "right";

type VoteRoom = {
  phase?: string;
  votingRound?: number;
  currentMatchup?: number;
  matchups?: string[][];
  voteDeadline?: number | null;
  players?: { id: string }[];
};

// The deadline is set from the host's clock, so allow a little skew against the server clock.
// Tallies are taken by the host at its own deadline, so a late vote can't change a shown result.
export const VOTE_DEADLINE_GRACE_MS = 3000;

export const voteKey = (code: string, round: number, matchup: number, pid: string) =>
  `gifbattle:vote:${code}:${round}:${matchup}:${pid}`;

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
  if (typeof room.voteDeadline !== "number" || room.voteDeadline + VOTE_DEADLINE_GRACE_MS < now) return "voting_closed";
  const pair = room.matchups?.[matchup as number];
  if (!Array.isArray(pair) || pair.length < 2) return "voting_closed";
  // Contestants can't vote on their own matchup
  if (pair.includes(pid) || !room.players?.some((p) => p.id === pid)) return "not_eligible";
  return null;
}
