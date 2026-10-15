import { expect, test } from "@playwright/test";
import { VOTE_DEADLINE_GRACE_MS, voteKey, voteRejection } from "../lib/votes";

const now = 1_000_000;
const room = () => ({
  phase: "voting", submitDeadline: 900_000, votingRound: 1, currentMatchup: 0, matchups: [["a", "b"], ["c", "d"]],
  voteDeadline: now + 10_000, players: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }, { id: "v" }],
});

test("an eligible voter can vote on the open matchup", () => {
  expect(voteRejection(room(), "v", 1, 0, "left", now)).toBeNull();
  expect(voteRejection(room(), "c", 1, 0, "right", now)).toBeNull();
});

test("vote keys are scoped to the game so Play Again starts with no votes", () => {
  expect(voteKey("ABC123", 900_000, 1, 0, "v")).toBe("gifbattle:vote:ABC123:900000:1:0:v");
  expect(voteKey("ABC123", 900_000, 0, 0, "v")).not.toBe(voteKey("ABC123", 950_000, 0, 0, "v"));
  expect(voteRejection({ ...room(), submitDeadline: null }, "v", 1, 0, "left", now)).toBe("voting_closed");
});

test("contestants and non-players cannot vote", () => {
  expect(voteRejection(room(), "a", 1, 0, "left", now)).toBe("not_eligible");
  expect(voteRejection(room(), "b", 1, 0, "right", now)).toBe("not_eligible");
  expect(voteRejection(room(), "stranger", 1, 0, "left", now)).toBe("not_eligible");
});

test("votes outside the open matchup or after the deadline are rejected", () => {
  expect(voteRejection(room(), "v", 0, 0, "left", now)).toBe("voting_closed");
  expect(voteRejection(room(), "v", 1, 1, "left", now)).toBe("voting_closed");
  expect(voteRejection({ ...room(), phase: "round_results" }, "v", 1, 0, "left", now)).toBe("voting_closed");
  expect(voteRejection(null, "v", 1, 0, "left", now)).toBe("voting_closed");
  const deadline = room().voteDeadline;
  expect(voteRejection(room(), "v", 1, 0, "left", deadline + VOTE_DEADLINE_GRACE_MS)).toBeNull();
  expect(voteRejection(room(), "v", 1, 0, "left", deadline + VOTE_DEADLINE_GRACE_MS + 1)).toBe("voting_closed");
});

test("malformed votes are rejected", () => {
  expect(voteRejection(room(), "v", 1, 0, "middle", now)).toBe("invalid_request");
  expect(voteRejection(room(), "v", "1", 0, "left", now)).toBe("invalid_request");
  expect(voteRejection(room(), "v", 1, 0.5, "left", now)).toBe("invalid_request");
});
