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

**Prerequisites:** Node.js 20.9+ and Upstash Redis credentials for real room creation/multiplayer. GIPHY/KLIPY keys are optional for remote GIF search; a public Vercel Blob token is required for saving memes and AI images. There is no bundled local Redis server or REST proxy. The current Redis client uses the Upstash HTTP API.

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
cp .env.example .env.local
# Edit .env.local and fill in your Upstash Redis URL/token and Giphy key

# 3. Run the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). To test multiplayer locally, use another browser or an incognito window so each player has a separate browser identity.

## Testing

Tests run locally against a production build on port 3100. Browser multiplayer tests intercept room/store endpoints and use in-memory mocks; provider, Blob and Gemini interactions are also mocked where exercised. Service and media-script tests validate rendering, authorization logic and failure handling with injected dependencies. Passing these tests does not verify live service credentials. Provider-specific browser tests skip when their required provider is not configured in the build.

For a real integration check, configure `.env.local`, run `npm run dev`, and play a complete game in two separate browser sessions. Test GIPHY and KLIPY as primary providers in separate runs (restart after changing `NEXT_PUBLIC_GIF_PROVIDER`), then create a meme with Blob storage enabled. Use a separate development Upstash database to keep test rooms/budgets separate from production.

Run automated checks:

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
| `NEXT_PUBLIC_GIPHY_KEY` | App-level GIPHY key (at least one provider key required for GIF search) |
| `NEXT_PUBLIC_KLIPY_KEY` | Optional ad-free KLIPY v1 GIF API key |
| `NEXT_PUBLIC_GIF_PROVIDER` | Preferred provider: `giphy` or `klipy` |
| `NEXT_PUBLIC_GIF_AUTO_FALLBACK` | Automatic quota fallback defaults to `true`; `false` disables it |
| `GIPHY_SEARCH_HOURLY_BUDGET` / `KLIPY_SEARCH_HOURLY_BUDGET` | Independent rolling hourly request budgets; default `85` each |
| `NEXT_PUBLIC_SITE_URL` | Public base URL for canonical metadata, `robots.txt`, and `sitemap.xml` (for example `https://gifbattles.com`) |
| `NEXT_PUBLIC_SENTRY_DSN` | Enables Sentry error tracking for client/server/edge runtimes |
| `SENTRY_DSN` | Optional server-only Sentry DSN override (used by server/edge if set) |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | Optional tracing sample rate in `[0,1]` (default `0.1`) |
| `SENTRY_ORG` | Optional Sentry org slug for source map upload during build |
| `SENTRY_PROJECT` | Optional Sentry project slug for source map upload during build |
| `SENTRY_AUTH_TOKEN` | Optional auth token for source map upload during build |
| `BLOB_READ_WRITE_TOKEN` | Required for AI image upload to Vercel Blob (`/api/generate-image`) |
| `GEMINI_IMAGE_MODEL` | Optional image model override: `gemini-3.1-flash-image` (default) or `gemini-3-pro-image` |

### LLM key behavior

- GIF search uses the configured app-level GIPHY or KLIPY key. Set `NEXT_PUBLIC_KLIPY_KEY` to enable KLIPY and `NEXT_PUBLIC_GIF_PROVIDER=klipy` to make it primary. `NEXT_PUBLIC_*` configuration is baked into the client at build time; rebuild/redeploy after changes.
- Players use one GIF search. `NEXT_PUBLIC_GIF_AUTO_FALLBACK=true` is the default: exhausted quota switches to the other configured provider and replaces the entire grid and attribution. Pagination never mixes providers. Set `false` to disable fallback.
- KLIPY currently supports the ad-free v1 GIF API with high content filtering. Ad-enabled keys require a separate integration; ad objects are not silently discarded.
- Search requires Search/Enter or a category click; typing and opening the screen spend no quota. Each page fetches 24 results and previews load lazily. Pagination uses the original submitted query.
- Media submissions record their source for attribution in selection, voting, results, and exported HTML. Old GIPHY submissions remain readable.
- Remote searches are sent directly from the player browser. `/api/gif-search-budget` reserves independent, atomic rolling 60-minute budgets in Redis. `GIPHY_SEARCH_HOURLY_BUDGET` and `KLIPY_SEARCH_HOURLY_BUDGET` default to 85. Budgets fail closed if Redis is unavailable; public API keys can still be used outside this guard.
- KLIPY submissions send share reporting with the originating query and player ID. Reporting reserves the same API budget and is best effort; it does not prevent gameplay when quota/network is unavailable.
- `/api/gif-events` records approximate per-room/provider counts (`search_sent`, `pagination_sent`, `search_error`, `quota_blocked`) in `gifbattle:metrics:gifs:<ROOM_CODE>:<SUBMIT_DEADLINE>` with a seven-day TTL. The host marks the game completed on the results screen, which logs `gif_game_completed` with its counters. The deadline separates repeat games in the same room. Use completed records to measure requests per completed game. No raw queries or player IDs are stored in these counters. They are client-reported analytics, not authoritative billing usage.
- No provider media or search responses are persistently cached or rehosted.
- Prompt generation and AI image generation use a host-provided Gemini key (BYOK) configured in the lobby.
- Prompt generation defaults to `gemini-3.5-flash` (with `gemini-3.6-flash` selectable by the host). Image generation uses `gemini-3.1-flash-image` by default.
- The image generation route sets `maxDuration = 60` and can spend up to ~39s total across retries (3 x 12s attempts + backoff).
- Gemini API calls use retry/backoff on transient `429`/`5xx` responses.
- Per-room rate limits apply to Gemini endpoints to reduce cost spikes (`image: 8/min, 120/hour`; `prompt: 18/min, 240/hour`).
- Provider `400` errors are surfaced as config/model issues (not mislabeled as invalid key).

### Web analytics

Vercel Web Analytics is included through `@vercel/analytics` in the root layout. Enable Web Analytics for the project in the Vercel dashboard, then deploy to begin collecting anonymized visitor and page-view data. This project does not send custom game events.

### Data retention and deletion

- Lobby room state (`phase: lobby`) expires after 30 minutes of inactivity.
- Active game room state (`phase: submitting/voting/round_results`) uses a 4-hour TTL.
- Game-over room state (`phase: game_over`) uses a 15-minute TTL.
- Vote keys use a 24-hour TTL. Authenticated host heartbeats renew the active room lease and expire after twice the takeover grace period (4 minutes in a lobby, 80 seconds during play). Frozen hosts can be replaced after 2 minutes in the lobby or 40 seconds during play.
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

### GIF integration checks

Provider mapping and routing tests use mocked responses. Browser search tests require a build with a configured primary provider; they skip if that provider is absent. To exercise the GIPHY browser cases without real calls:

```bash
NEXT_PUBLIC_GIPHY_KEY=test-giphy NEXT_PUBLIC_KLIPY_KEY=test-klipy NEXT_PUBLIC_GIF_PROVIDER=giphy NEXT_PUBLIC_GIF_AUTO_FALLBACK=false npm run build
npx playwright test
```

To exercise KLIPY submission/reporting and attribution, build with the same dummy keys and `NEXT_PUBLIC_GIF_PROVIDER=klipy`, then run `npx playwright test tests/e2e/gif-search.spec.ts`. Rebuild with deployment credentials/configuration before using the app outside tests.

### Meme templates and offline stock import

Make a Meme uses approved templates without GIF-provider requests or keys. Production loads images and immutable catalog snapshots from Vercel Blob, with a small current-version pointer in Redis. New approved publications appear without redeployment, usually within about 15 seconds. Browsing uses a stable shuffle per player/question; keyword relevance ranks first and page cursors retain the catalog version.

GitHub contains scripts and one tiny cat test fixture. Growing catalog metadata, candidate records, model results and review previews live in ignored `media-work/`; they are not deployed. See the run instructions below and [the complete media workflow](docs/media-library.md).

### Player-created memes

Make a Meme supports approved captionable templates, live Canvas previews, one/two text captions and submissions into the existing voting flow. The server renders the final image, preserves the source license, and uploads using the existing `BLOB_READ_WRITE_TOKEN`. Caption text/template IDs live in temporary Redis room state; generated images use `memes/`, separate from permanent `stock/`.

Set `CRON_SECRET` in Vercel to enable the daily expired-meme cleanup configured in `vercel.json`. The host can also delete the game's memes with Play Again. Completed and abandoned uploads expire after 24 hours and are deleted on a subsequent successful cleanup run. AI suggestions are optional, and players can explicitly opt in to submitting a copy for moderation.

Meme templates load filtered pages from `/api/media/catalog`, rather than downloading the entire manifest into the browser. See [the media workflow](docs/media-library.md) for setup, retention and testing.

### AI captions, contributions and stock preparation

Make a Meme supports editable AI suggestions using the host's Gemini key, and an optional sharing checkbox that queues a permanent copy for review. Offline `media collect`, `tag`, `generate` and `moderate` commands cover sourcing, AI metadata proposals, original image drafts, approval/export and exposure-aware usage stats. Configure `GEMINI_MEDIA_API_KEY` only for offline AI work and `MEDIA_ADMIN_SECRET` for moderation. Reuse the existing Blob token and Redis configuration. See [the complete stock workflow](docs/media-library.md).


### Question topics and featured questions

The library contains 1,000 reviewed questions across eight topics, including 200 featured picks that appear more often. Hosts can select multiple topics in the lobby or keep All topics. The lobby shows matching counts; custom questions and player-name rounds are included separately. Topic choices persist through Play Again. See [question library and sampling](docs/question-library.md) for the editorial review, topic behavior and repeat handling.

### Question answer modes

The host lobby has **Alternate GIF and Meme rounds**, enabled by default. When on, questions alternate **GIF → Meme**, repeating for longer games. When off, players get **Search GIFs** and **Create Meme** tabs for every question. The setting is stored with the room and retained for Play Again; new rooms default to alternating. Meme questions combine text answers, captioned stock templates and optional AI tools: funnier wording, caption suggestions, or direct meme-image generation. Manual text/captions need no AI key. The host's room Gemini key enables AI. Exhausted GIF quota switches the question to Meme for remaining players; earlier submissions stay intact. An empty template catalog still allows written answers inside Meme mode.

### Running the Commons meme pipeline

Use Node.js **22.13 or later** and install dependencies with `npm ci`. Offline credentials go in gitignored `.env.local`: `GEMINI_MEDIA_API_KEY` for screening, and the existing `BLOB_READ_WRITE_TOKEN` plus `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` for publishing. Commons needs no API key. Pexels collection additionally needs `PEXELS_API_KEY`. Production uses `MEDIA_CATALOG_SOURCE=blob`; the offline scripts keep their working catalog in `media-work/catalog.json`.

On a **fresh curator checkout only**, run `npm run media -- catalog-pull` to download the current approved catalog metadata. It does not download the candidate archive or all stock images. Restore `media-work/` from your own local backup to resume previous collection/screening; otherwise collect a new batch. `catalog-pull` replaces the local working catalog, so back up unpublished changes before using it on an existing workspace.

1. **Prepare the saved collection locally.** On the existing workspace:

   ```sh
   npm run media -- commons-prepare --input media-work/commons-humor-expanded/candidates.json --out media-work/commons-ready
   npm run media -- upload-budget --action status
   ```

   These commands make no external calls. Read `media-work/commons-ready/report.md`. The queue favors humor photos and interactions, reuses current assessments and retains metadata, safety and duplicate holds.

2. **Collect another batch only when needed.** This calls Commons, with pacing, checkpointing and cooldown retries; it makes no Gemini calls or Blob uploads:

   ```sh
   npm run media -- collect-humor --limit 200 --depth 1 --max-requests 20 --out media-work/commons-next/candidates.json --auto-resume true
   npm run media -- commons-prepare --input media-work/commons-next/candidates.json --out media-work/commons-ready
   ```

   Resume collection with the same settings/path. Preparation replaces the generated queue files; import or back up an existing queue before switching to another collection.

3. **Screen a bounded priority batch when Gemini quota/budget is available.** The screen command is billable; the import command only saves local metadata:

   ```sh
   npm run media -- archive-import --input media-work/commons-ready/screening.json
   npm run media -- archive-screen --queue media-work/commons-ready/screening.json --limit 50 --max-calls 60 --max-usd 1 --concurrency 2
   ```

   Re-run the preparation command from step 1 or 2 with the **same collection input** to rebuild the publication shortlist from saved assessments. Completed current assessments are skipped on resume; failed/uncertain images are not automatically approved. Keep one screening/publishing worker running at a time.

4. **Check the publication dry run.** It makes no source requests, model calls, Redis calls or Blob uploads:

   ```sh
   npm run media -- publish-shortlist --input media-work/commons-ready/publication-candidates.json --sources commons --dry-run true --limit 50
   ```

   The report shows eligible IDs, diversity/duplicate holds, full-image/preview/catalog upload counts and available allowance. A strong model score alone does not publish an image.

5. **Configure the actual Blob quota window before publishing.** Check Vercel for the reset dates and observed Advanced Operations usage, then replace all placeholders below:

   ```sh
   npm run media -- upload-budget --action configure --period-start ACTUAL_START_ISO --period-end ACTUAL_END_ISO --quota 2000 --used OBSERVED_USED --reserve 500
   ```

   The default 500-operation gameplay reserve is configurable. Missing or expired configuration blocks stock uploads. The guard counts subsequent local attempts, including failures, and stops growth before another screening batch when no stock upload allowance remains. It does not monitor account-wide/live gameplay usage; refresh the baseline and leave enough reserve. Storage and download allowances are separate.

6. **Publish approved stock when both checks permit it.** This downloads originals, uploads prepared full images/previews and switches the live catalog after completion:

   ```sh
   npm run media -- publish-shortlist --input media-work/commons-ready/publication-candidates.json --sources commons --storage blob --min-score 80 --limit 50
   npm run media -- validate
   ```

   Production discovers the updated catalog without a code commit or deployment. If only catalog synchronization failed after completed uploads, retry `npm run media -- catalog-sync`; do not rescore the images. Collection and scoring alone never publish files.

The current pipeline remains paused pending available quotas. Nothing starts automatically when the calendar month changes. Detailed policies, metadata evidence limits, local archival and other source workflows are in [media-library.md](docs/media-library.md).
