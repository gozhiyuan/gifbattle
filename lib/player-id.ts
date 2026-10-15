// Player IDs are compared exactly everywhere (room membership, tokens, votes). Never trim or
// normalize them: if " host" and "host" mapped to the same token, a new player could join as
// " host" and receive the real host's token. Client IDs are short base36 strings.
const PLAYER_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const isValidPlayerId = (pid: unknown): pid is string => typeof pid === "string" && PLAYER_ID_RE.test(pid);
