# GIF Battle 🎭

Multiplayer party game — players search for GIFs matching a prompt, then vote on the funniest one. Built with Next.js and hosted on Vercel.

## How it works

- One player creates a room and shares the 4-letter code
- Everyone joins on their own device
- Each round: pick a GIF for the prompt → GIFs go head-to-head in a bracket → votes determine the winner → repeat for 5 rounds
- Most points at the end wins

Game state is stored in Upstash Redis and polled every 2 seconds, so all players stay in sync without WebSockets.

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

### Getting credentials

**Upstash Redis** (free tier, no credit card):
1. Go to [console.upstash.com](https://console.upstash.com) → Create Database
2. Copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from the REST API tab

**Giphy API key** (free):
1. Go to [developers.giphy.com](https://developers.giphy.com) → Create an App → SDK
2. Copy the API Key from your dashboard

## Deploying to Vercel

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → Import the repo (auto-detects Next.js)
3. Add environment variables in Vercel project Settings:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
   - `NEXT_PUBLIC_GIPHY_KEY`
4. Deploy — share the Vercel URL with your team

Alternatively, use the [Upstash integration on Vercel Marketplace](https://vercel.com/marketplace?category=storage&search=upstash) to link a Redis database automatically.

## Project structure

```
app/
  layout.tsx          Root HTML shell
  page.tsx            Renders the game component
  api/store/route.ts  GET/POST shared KV store (backed by Upstash Redis)
components/
  gif-battle.tsx      Game logic and UI
```

## Environment variables

| Variable | Description |
|---|---|
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis auth token |
| `NEXT_PUBLIC_GIPHY_KEY` | Giphy API key for GIF search |

Room data expires automatically after 24 hours.
