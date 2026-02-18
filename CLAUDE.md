# GIF Battle — Claude Code Notes

## Stack

- **Next.js 14** (App Router) with TypeScript
- **Upstash Redis** (`@upstash/redis`) for shared game state
- **Giphy API** for GIF search
- Deployed on **Vercel**

## Key files

| File | Purpose |
|---|---|
| `components/gif-battle.tsx` | All game logic and UI (single file) |
| `app/api/store/route.ts` | Thin KV wrapper over Upstash Redis |
| `app/page.tsx` | Entry point — just renders `<GifBattle />` |

## Architecture notes

The game uses a polling model (every 2s) — no WebSockets. All players read/write a single JSON blob per room stored under the key `gifbattle:room:<CODE>`. Vote records use separate keys `gifbattle:vote:<CODE>:<round>:<matchup>:<playerID>`. All keys expire after 24h.

The `storage` shim in `gif-battle.tsx` replaces the `window.storage` API from the Claude.ai sandbox:
- `storage.get(key)` → `GET /api/store?key=...` → returns `{ value: string } | null`
- `storage.set(key, value)` → `POST /api/store` with `{ key, value }`

## Commands

```bash
npm run dev     # Start dev server at localhost:3000
npm run build   # Production build (type-checks everything)
npm start       # Start production server
```

## Environment variables

Copy `.env.example` to `.env.local` for local dev:

```
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
NEXT_PUBLIC_GIPHY_KEY=...
```

On Vercel, add these in project Settings → Environment Variables. The Upstash vars can also be added automatically via the Upstash integration in Vercel Marketplace.

## Style conventions

- Inline styles throughout (intentional — original was a Claude artifact with no build step)
- No external UI libraries
- All game components live in one file (`gif-battle.tsx`) — keep it that way unless there's a strong reason to split
