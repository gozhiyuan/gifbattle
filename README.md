# GIF Battles <img src="app/favicon.ico" alt="GIF Battles favicon" width="32" height="32" />

Multiplayer party game — players search for GIFs matching a prompt, then vote on the funniest one. Built with Next.js and hosted on Vercel.

## How it works

- One player creates a room and shares the 6-character code
- Everyone joins on their own device
- Each round: pick a GIF for the prompt → GIFs go head-to-head in a bracket → votes determine the winner → repeat for 5 rounds
- Most points at the end wins

Game state is stored in Upstash Redis and polled every 2 seconds, so all players stay in sync without WebSockets.

### Gemini key note (before entering a room)

- AI prompt/image features require a host-provided Gemini key for that room.
- Get a key from [Google AI Studio](https://aistudio.google.com/app/apikey).
- Keys are room-scoped, not shown to other players in UI, and cleared at game over.

### Feedback and contributions

- Questions or suggestions: open an issue at [github.com/gozhiyuan/gifbattle/issues](https://github.com/gozhiyuan/gifbattle/issues).
- Code contributions are welcome via PRs at [github.com/gozhiyuan/gifbattle/pulls](https://github.com/gozhiyuan/gifbattle/pulls).

## Local development

**Prerequisites:** Node.js 18+, a [Giphy API key](https://developers.giphy.com) (free), and Upstash Redis credentials.

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
cp .env.example .env.local
# Edit .env.local and fill in your Upstash Redis URL/token and Giphy key

# 3. Run the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). To test multiplayer locally, open a second tab.

## Testing

Baseline tests use Playwright and run against a production build:

```bash
# Run full baseline suite (build + smoke + e2e)
npm test

# Run only smoke check
npm run test:smoke

# Run e2e specs
npm run test:e2e
```

### Getting credentials

**Upstash Redis** (free tier, no credit card):
1. Go to [console.upstash.com](https://console.upstash.com) → Create Database
2. Copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from the REST API tab

**Giphy API key** (free):
1. Go to [developers.giphy.com](https://developers.giphy.com) → Create an App → SDK
2. Copy the API Key from your dashboard
3. Set it as `NEXT_PUBLIC_GIPHY_KEY` in your deployment environment

## Deploying to Vercel

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → Import the repo (auto-detects Next.js)
3. Add environment variables in Vercel project Settings:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
   - `NEXT_PUBLIC_GIPHY_KEY`
   - `NEXT_PUBLIC_SITE_URL` (for example `https://gifbattles.com`)
   - `BLOB_READ_WRITE_TOKEN` (required for AI image generation upload)
   - `NEXT_PUBLIC_SENTRY_DSN` (required for Sentry error tracking)
   - `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` (recommended `0.1`)
   - Optional (source map upload): `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`
   - Optional (server-only DSN override): `SENTRY_DSN`
4. Deploy — share the Vercel URL with your team

Alternatively, use the [Upstash integration on Vercel Marketplace](https://vercel.com/marketplace?category=storage&search=upstash) to link a Redis database automatically.

## Project structure

```
app/
  layout.tsx                       Root HTML shell
  page.tsx                         Renders the game component
  api/store/route.ts               GET/POST/DELETE shared KV store (Upstash Redis)
  api/gemini-key/route.ts          Host-only Gemini key management
  api/generate-prompts/route.ts    AI prompt generation (Gemini)
  api/generate-image/route.ts      AI image generation (Gemini + Vercel Blob)
  api/cleanup-images/route.ts      Host-only Vercel Blob deletion at game end
components/
  gif-battle.tsx      Game logic and UI (single file — keep it that way)
lib/
  room-security.ts    Server-side auth, rate limiting, Gemini key storage
  gemini-retry.ts     Fetch wrapper with exponential backoff for Gemini API
tests/
  smoke.spec.ts                    Page load smoke check
  e2e/home-validation.spec.ts      Nickname/room code validation
  e2e/lobby-multiplayer.spec.ts    Host + guest join flow (mocked API)
  e2e/helpers/mock-api.ts          Playwright API mock helpers
```

## Environment variables

| Variable | Description |
|---|---|
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis auth token |
| `NEXT_PUBLIC_GIPHY_KEY` | Required app-level Giphy key for GIF search (users cannot override in UI) |
| `NEXT_PUBLIC_SITE_URL` | Public base URL for canonical metadata, `robots.txt`, and `sitemap.xml` (for example `https://gifbattles.com`) |
| `NEXT_PUBLIC_SENTRY_DSN` | Enables Sentry error tracking for client/server/edge runtimes |
| `SENTRY_DSN` | Optional server-only Sentry DSN override (used by server/edge if set) |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | Optional tracing sample rate in `[0,1]` (default `0.1`) |
| `SENTRY_ORG` | Optional Sentry org slug for source map upload during build |
| `SENTRY_PROJECT` | Optional Sentry project slug for source map upload during build |
| `SENTRY_AUTH_TOKEN` | Optional auth token for source map upload during build |
| `BLOB_READ_WRITE_TOKEN` | Required for AI image upload to Vercel Blob (`/api/generate-image`) |

### LLM key behavior

- GIF search always uses the app-level `NEXT_PUBLIC_GIPHY_KEY`.
- Prompt generation and AI image generation use a host-provided Gemini key (BYOK) configured in the lobby.
- Prompt generation defaults to `gemini-2.5-flash`; image generation uses `gemini-2.5-flash-image`.
- The image generation route sets `maxDuration = 60` and can spend up to ~39s total across retries (3 x 12s attempts + backoff).
- Gemini API calls use retry/backoff on transient `429`/`5xx` responses.
- Per-room rate limits apply to Gemini endpoints to reduce cost spikes (`image: 8/min, 120/hour`; `prompt: 18/min, 240/hour`).
- Provider `400` errors are surfaced as config/model issues (not mislabeled as invalid key).

### Data retention and deletion

- Lobby room state (`phase: lobby`) expires after 30 minutes of inactivity.
- Active game room state (`phase: submitting/voting/round_results`) uses a 4-hour TTL.
- Game-over room state (`phase: game_over`) uses a 15-minute TTL.
- Vote and heartbeat keys (`gifbattle:vote:*`, `gifbattle:hb:*`) also use 24-hour TTL.
- Room Gemini keys (`gifbattle:gemini:*`) are server-side only, cleared at game end by host, and expire after 24 hours if not cleared earlier.
- AI image blobs are deleted at game-over via `/api/cleanup-images` (host-authenticated, room-scoped, best effort).
- If cleanup fails, blobs remain until manually deleted by an admin workflow.

### Key rotation runbook

1. In an active room, host opens Lobby, clicks `Change` under Gemini key, and saves the new key.
2. Host verifies by running one prompt generation and one image generation.
3. Host clicks `Clear` to revoke key immediately if needed.
4. For global/emergency rotation, invalidate compromised key in Google AI Studio/Cloud, then set a new key in active rooms.

### Incident response (Gemini key or cost spike)

1. Contain:
   - Clear key in active rooms (`Lobby -> Clear`), or end game to trigger automatic key deletion.
   - If compromise is suspected, revoke key at provider first.
2. Eradicate:
   - Create and distribute new key to hosts.
   - Confirm rooms use new key only.
3. Recover:
   - Verify prompt/image generation in a test room.
   - Monitor Gemini usage + error rates for at least one hour.
4. Post-incident:
   - Record timeline, impacted rooms, and action items.
   - Tighten rate limits if usage spike bypassed expected thresholds.

Room lobby data expires in 30 minutes if the game is not started; active game data expires in 4 hours; game-over data expires in 15 minutes.
