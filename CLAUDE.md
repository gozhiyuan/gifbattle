# GIF Battles — Claude Code Notes

## Stack

- **Next.js 14** (App Router) with TypeScript
- **Upstash Redis** (`@upstash/redis`) for shared game state
- **Giphy API** for GIF search (optional — host can omit)
- **Gemini API** (BYOK) for AI prompt generation and image generation
- **Vercel Blob** (`@vercel/blob`) for AI-generated image storage
- Deployed on **Vercel**

## Key files

| File | Purpose |
|---|---|
| `components/gif-battle.tsx` | All game logic and UI (single file) |
| `app/api/store/route.ts` | Thin KV wrapper over Upstash Redis |
| `app/page.tsx` | Entry point — just renders `<GifBattle />` |
| `lib/room-security.ts` | Server-side auth helpers, rate limiting, Gemini key storage |
| `lib/gemini-retry.ts` | Fetch wrapper with exponential backoff for Gemini API |
| `app/api/gemini-key/route.ts` | Host-only Gemini API key management |
| `app/api/generate-prompts/route.ts` | AI prompt generation via Gemini |
| `app/api/generate-image/route.ts` | AI image generation via Gemini + upload to Vercel Blob |
| `app/api/cleanup-images/route.ts` | Host-only Vercel Blob deletion at game end |

## Architecture notes

The game uses a polling model (every 2s) — no WebSockets. All players read/write a single JSON blob per room stored under the key `gifbattle:room:<CODE>`. Vote records use separate keys `gifbattle:vote:<CODE>:<round>:<matchup>:<playerID>`. Lobby room keys expire in 30 minutes; active-game room keys expire in 4h; game-over room keys expire in 15m; vote keys expire in 24h. Room codes are 6 alphanumeric characters.

The `storage` shim in `gif-battle.tsx` replaces the `window.storage` API from the Claude.ai sandbox:
- `storage.get(key)` → `GET /api/store?key=...` → returns `{ value: string } | null`
- `storage.set(key, value)` → `POST /api/store` with `{ key, value }`

`/api/store` enforces an `ALLOWED_PREFIXES` allowlist (`gifbattle:room:`, `gifbattle:vote:`, `gifbattle:hb:`). The Gemini key namespace (`gifbattle:gemini:`) is intentionally excluded — Gemini keys are managed exclusively via `/api/gemini-key` with host authentication.

Submissions have three types (`type: "giphy" | "text" | "ai"`). AI submissions are stored as Vercel Blob URLs and cleaned up at game end.

Per-room rate limits apply to Gemini endpoints (image: 8/min, 120/hr; prompt: 18/min, 240/hr) using Redis INCR with sliding windows in `lib/room-security.ts`.

## Commands

```bash
npm run dev       # Start dev server at localhost:3000
npm run build     # Production build (type-checks everything)
npm start         # Start production server
npm test          # Build + run all Playwright tests
npm run test:smoke  # Build + smoke check only
npm run test:e2e    # Build + run e2e specs
```

## Environment variables

Copy `.env.example` to `.env.local` for local dev:

```
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
NEXT_PUBLIC_GIPHY_KEY=...   # Optional — GIF search tab hidden if omitted
BLOB_READ_WRITE_TOKEN=...   # Required for AI image generation
```

On Vercel, add these in project Settings → Environment Variables. The Upstash vars can also be added automatically via the Upstash integration in Vercel Marketplace.

## Style conventions

- Inline styles throughout (intentional — original was a Claude artifact with no build step)
- No external UI libraries
- All game components live in one file (`gif-battle.tsx`) — keep it that way unless there's a strong reason to split
