# Daily Brief — News Reader

A small, opinionated daily news reader. Open it in the morning, get three
curated stories, leave. The product is intentionally tight: **three stories,
ranked, with one sentence explaining why each one matters.** Anything that
didn't directly serve that loop didn't make it in.

This is a portfolio project. The code is meant to read as cleanly as the
product looks.

---

## What it does

- Pulls a fresh pool of stories from [TheNewsAPI](https://www.thenewsapi.com)'s
  `/v1/news/all` endpoint.
- Ranks them server-side (in Go) by a transparent blend of **recency**,
  **source trust / diversity**, **content quality**, and **impact-language
  signals in the headline**.
- Surfaces the top 3. Generates a one-sentence *"Why this story?"* blurb
  per card from the same signals — no LLM, no hallucinations, no cost.
- Renders them as polished cards in the browser, with category filtering,
  bookmarks, share-to-clipboard with pre-written copy, dark mode that
  respects system preference, and a mobile carousel that swipes natively.

---

## Architecture

```
┌────────────┐   GET /api/top-stories     ┌────────────┐   POST /score   ┌─────────────┐
│   Client   │ ─────────────────────────▶ │   Proxy    │ ──────────────▶ │  Go scorer  │
│ (React+Vite│                            │ (Express)  │                 │  + summarizer
│   + TS)    │                            │            │ ◀────────────── │             │
│            │                            │  ▼ holds   │   ranked top 3  │             │
│            │ ◀────────────────────────  │  API key   │                 │             │
└────────────┘     ranked top 3 + blurbs  │            │                 └─────────────┘
                                          │  ▼ fetches │
                                          │            │   GET /v1/news/all (api_token)
                                          │            │ ──────────────▶  TheNewsAPI
                                          └────────────┘
```

Three layers, each with one job:

### 1. Client — React + Vite + TypeScript (`/client`)

Pure presentation. No business logic. Calls `/api/top-stories?category=…`
and renders whatever the proxy hands back. Owns:

- Card / skeleton / error / empty render states.
- Category filter (animated pills).
- Bookmarks (localStorage) with a bumping count badge.
- Share — clipboard write with a pre-written contextual sentence so when
  it's pasted into Slack/iMessage it reads like a recommendation, not a
  bare URL.
- Dark mode — defaults to `prefers-color-scheme`, manual override persists
  to localStorage, system changes are picked up live.
- Mobile-first responsive layout. On mobile the cards become a native
  scroll-snap carousel with paginated dots. The "Story of the Hour" badge
  only renders on mobile (where the limited viewport benefits from a clear
  visual anchor).
- Subtle motion: cards cascade in on load, lift on hover, pills ping when
  activated. Everything respects `prefers-reduced-motion`.

### 2. Proxy — Node.js + Express (`/proxy`)

**Thin.** Two responsibilities, full stop:

1. Hold the TheNewsAPI key in `THENEWSAPI_KEY` so it never reaches the
   browser.
2. Forward the client's request → TheNewsAPI → Go scorer → client.

The proxy validates the requested category against an allowlist (so a
malformed query can't be smuggled to the upstream API), and that's it. If
you find yourself adding "real" logic here, push it into `/services`.

### 3. Go scorer + summarizer (`/services`)

All product logic lives here:

- **`internal/scoring`** — ranks a pool of stories using a weighted blend
  of recency (exponential decay with an 8-hour half-life), content
  quality (description length + image presence), source trust (a small
  hand-tuned table of well-known outlets), and impact-language signals in
  the title. Then a source-diversity pass to keep the top 3 from being
  three stories from the same outlet.
- **`internal/summarizer`** — generates the one-sentence *"Why this
  story?"* blurb from the same signals the scorer used. Deterministic,
  grounded in real story fields, zero external dependencies. Easily
  swappable for an LLM later — the surface area is one function.
- **`cmd/scorer`** — HTTP entry point. Exposes `POST /score` and a
  `/health` endpoint.

---

## Why this split?

A reviewer might reasonably ask why the proxy and scorer aren't one
service. Three honest reasons:

1. **The proxy is for secrets, the scorer is for thought.** Mixing them
   means a refactor to the ranking model touches the same file that holds
   the API key. They're different concerns.
2. **Go is a better fit for the scoring work.** Numeric weighting, sorting,
   and deterministic text generation are easier to read and reason about
   in Go than in Node, and the type system gives me real confidence that
   the JSON contract between the layers is stable.
3. **The split mirrors how this would be deployed.** Express in front of
   a private Go service is a real-world pattern — the project doesn't pay
   for "monolith convenience" it doesn't actually need.

---

## Why the rest of the product decisions?

Each of these has come up while building, and each has an answer:

| Decision | Why |
|---|---|
| **Three stories, not ten.** | The product promise is a *brief*, not a feed. Three is what fits on one screen and what a busy person will actually finish. |
| **Categories: Top, World, Tech, Business, Sports, Health.** | Six pills fit in one row, cover the major newsroom desks, and map cleanly to TheNewsAPI's category vocabulary. Adding more would force scanning. |
| **Recency dominates the score.** | "Top of the day" means top *today*. A great story from yesterday losing to a decent story from 4 hours ago is the right behavior. |
| **Source diversity in the top 3.** | If the raw signal returned three Reuters stories, the briefing reads like a single outlet's homepage. We pick from different sources by default and only repeat when the pool has no alternatives. |
| **Heuristic "Why this story?" instead of an LLM.** | One sentence, zero latency, zero cost, and *grounded* — every clause maps to a real field on the story. An LLM is overkill and adds a hallucination surface for the sake of variety we don't need. |
| **Share = clipboard + pre-written sentence.** | `navigator.share` is inconsistent across desktop browsers and unavailable outside HTTPS. Clipboard works everywhere, and the pre-written copy turns a paste into a recommendation. |
| **Skeletons match card geometry exactly.** | When real content lands, nothing jumps. The page feels finished even before it's done loading. |
| **Mobile is a different layout, not a shrunk desktop.** | Mobile gets a scroll-snap carousel with dots and a "Story of the Hour" badge. The grid wouldn't add value on a 5-inch screen. |
| **Dark mode defaults to system, then becomes a setting.** | The first impression should be right. After the first manual toggle, we respect the user's choice even if their OS theme changes. |

---

## Running it locally

### Prerequisites

- Node.js 18+ (for the client and proxy)
- Go 1.22+ (for the scorer)

### 1. Install everything

**macOS / Linux / WSL**
```bash
bash scripts/setup.sh
```

**Windows (PowerShell)**
```powershell
.\scripts\setup.ps1
```

This installs npm deps for client + proxy, runs `go mod tidy` for the
scorer, and copies `proxy/.env.example` → `proxy/.env` if missing.

### 2. Add your API key

Open `proxy/.env` and set:

```
THENEWSAPI_KEY=your_actual_key
```

The key only lives in this file. It never enters the client bundle, the Go
service, or git (`.env` is gitignored).

### 3. Start the dev servers

**macOS / Linux / WSL**
```bash
bash scripts/dev.sh
```

**Windows (PowerShell)**
```powershell
.\scripts\dev.ps1
```

You'll get three prefixed log streams:

- `[scorer]` — Go HTTP service on `http://localhost:4100`
- `[proxy]`  — Express on `http://localhost:4000`
- `[client]` — Vite dev server on `http://localhost:5173`

Open `http://localhost:5173`. The Vite dev server proxies `/api/*` to
`http://localhost:4000`, so the React app calls the Express proxy
transparently.

---

## Environment variables

All env vars are documented in `.env.example` (root) and `proxy/.env.example`.
The only one you actually need to set is `THENEWSAPI_KEY` in `proxy/.env`.

| Variable | Lives in | Purpose | Default |
|---|---|---|---|
| `THENEWSAPI_KEY` | `proxy/.env` (local) **and** Vercel env (prod) | TheNewsAPI access token. Server-only. | *(required)* |
| `PROXY_PORT` | `proxy/.env` | Express listen port (local only). | `4000` |
| `SCORER_URL` | `proxy/.env` | Where the proxy reaches the Go service (local only). | `http://localhost:4100` |
| `ALLOWED_ORIGINS` | `proxy/.env` | CORS allowlist for the proxy (local only). | `http://localhost:5173` |
| `SCORER_PORT` | shell / `services/.env` | Go scorer listen port (local only). | `4100` |
| `VITE_API_BASE_URL` | client env | Override Vite's dev proxy target (local only). | `http://localhost:4000` |

In production on Vercel, the only variable that matters is `THENEWSAPI_KEY`,
set via `vercel env add` or the dashboard. Everything else is for the
multi-process local dev stack.

---

## Project layout

```
news-reader/
├── client/                    # React + Vite + TS app
│   ├── src/
│   │   ├── components/        # NewsCard, SkeletonCard, CategoryFilter,
│   │   │                      # BookmarkBadge, DarkModeToggle, SearchBar,
│   │   │                      # SavedStoriesPanel
│   │   ├── hooks/             # useFetchNews, useBookmarks, useDarkMode,
│   │   │                      # useSearch
│   │   ├── utils/             # readingTime, shareStory, timeAgo
│   │   ├── styles/            # global.css, variables.css (design tokens)
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── proxy/                     # Express proxy (local dev only)
│   ├── server.js
│   ├── package.json
│   └── .env.example
├── services/                  # Go scorer + summarizer (local dev only)
│   ├── cmd/scorer/main.go
│   ├── internal/scoring/relevance.go
│   ├── internal/summarizer/whythisstory.go
│   └── go.mod
├── api/                       # Vercel serverless functions (production)
│   ├── top-stories.ts         # GET /api/top-stories
│   ├── search.ts              # GET /api/search
│   └── _lib/                  # shared lib (underscore = not a route)
│       ├── scoring.ts         # TS port of services/internal/scoring
│       ├── summarizer.ts      # TS port of services/internal/summarizer
│       ├── thenewsapi.ts      # upstream fetch + category whitelist
│       └── types.ts
├── scripts/
│   ├── setup.sh / setup.ps1
│   └── dev.sh   / dev.ps1
├── vercel.json                # Vercel build + functions config
├── package.json               # root deps for /api functions
├── tsconfig.json              # root tsconfig for /api functions
├── .gitignore
├── .env.example
└── README.md
```

---

## Deploying to Vercel

The repo ships with two parallel backend implementations:

| Environment | Stack | Lives in |
|---|---|---|
| **Local dev** | Vite + Express proxy + Go scorer | `client/`, `proxy/`, `services/` |
| **Production (Vercel)** | Vite + TypeScript serverless functions | `client/`, `api/` |

This isn't an accident — it's the design tradeoff. Vercel's Go runtime is in
maintenance mode, and running a long-lived Go process plus a separate
host (Render/Fly) just to ship a daily-news demo costs more in moving
parts than it earns in correctness. The Vercel production path keeps the
backend in a single Node process, eliminating an entire class of
cross-process bugs (cold-start coordination, JSON serialization mismatches,
HTTP timeouts between functions). The Go service stays in the repo as
the original architectural reference and the local dev experience —
recruiters can see *both* and read the rationale here.

The TypeScript ports in [api/_lib/scoring.ts](api/_lib/scoring.ts) and
[api/_lib/summarizer.ts](api/_lib/summarizer.ts) are line-for-line mirrors
of the Go originals (same constants, same weights, same algorithms), so
the user-visible behavior is identical between the two stacks.

### Steps

1. **Install the Vercel CLI once**

   ```bash
   npm i -g vercel
   ```

2. **Link the repo to a Vercel project**

   From the project root:

   ```bash
   vercel link
   ```

   Pick or create a project when prompted. Vercel detects the `vercel.json`
   and uses it directly — no dashboard fiddling required.

3. **Add the API key as an environment variable**

   ```bash
   vercel env add THENEWSAPI_KEY
   ```

   Paste your TheNewsAPI key, then apply it to **Production**,
   **Preview**, and **Development** when prompted. The key only lives in
   Vercel's encrypted env store and is exposed only to the serverless
   functions at runtime.

4. **Deploy**

   ```bash
   vercel --prod
   ```

   Or push to your linked Git branch and let Vercel auto-deploy. You'll
   get a `*.vercel.app` URL once the build finishes (~1 min).

### Local Vercel preview

If you want to test the production-shaped stack offline before deploying:

```bash
vercel dev
```

This boots the Vercel runtime against the local `/api` functions and
serves the built client at `http://localhost:3000`. It's slower than the
regular `scripts/dev.ps1` but exercises the exact code path Vercel
runs in production. You'll need `THENEWSAPI_KEY` in a local `.env`
(or pulled down via `vercel env pull`).

### What Vercel does on each deploy

1. Runs `npm install` at the project root (installs `@vercel/node` types).
2. Runs `cd client && npm install && npm run build` (builds the React app).
3. Serves `client/dist` as the static origin from the global edge.
4. Auto-deploys `api/*.ts` as Node serverless functions at `/api/*`.
5. Routes any non-API request to `index.html` so the SPA loads on every URL.

---

## Extending it

A few obvious next moves, in case you read the code and wonder where it
would go:

- **Swap the heuristic blurb for an LLM call** — replace
  `summarizer.Generate` with a single network call and keep its signature.
  No other code changes.
- **Add user accounts / sync bookmarks** — bookmark state already lives
  behind a hook, so swapping localStorage for an API is a one-file change.
- **Cache TheNewsAPI calls in the proxy** — TheNewsAPI rate limits, and
  the same category pool is requested by every visitor. A 60-second TTL
  in front of the upstream fetch would dramatically cut cost.
- **Server-rendered version** — drop in Vite SSR or Next.js. The client
  is already structured around a single data hook, so the migration is
  cosmetic.

---

## A note on the API key

The key only ever lives in `proxy/.env`, which is gitignored. It is **not**
embedded in the client bundle, the Go service, or any committed file. If
you fork this project, generate your own key — never reuse one you found
in a repo.
