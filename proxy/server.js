// =============================================================================
// News Reader — Express proxy
// =============================================================================
// This file is intentionally THIN. Its only responsibilities are:
//
//   1. Hold the TheNewsAPI key in a server-only environment variable so the
//      browser never sees it.
//   2. Forward the client's request to TheNewsAPI "All News" endpoint.
//   3. Hand the raw response to the Go scorer service, which does the actual
//      ranking + "Why this story?" blurb generation.
//   4. Return the scorer's output to the client.
//
// All product logic (recency weighting, relevance scoring, blurb generation,
// reading-time hinting, etc.) lives in Go. If you find yourself adding
// "real" logic here, push it into /services instead.
// =============================================================================

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const {
  THENEWSAPI_KEY,
  PROXY_PORT = 4000,
  SCORER_URL = 'http://localhost:4100',
  ALLOWED_ORIGINS = 'http://localhost:5173',
} = process.env;

if (!THENEWSAPI_KEY) {
  console.error(
    '[proxy] Missing THENEWSAPI_KEY environment variable. ' +
      'Copy proxy/.env.example to proxy/.env and set your key.',
  );
  process.exit(1);
}

const NEWS_API_URL = 'https://api.thenewsapi.com/v1/news/all';

// Whitelist of categories TheNewsAPI understands. The client sends one of
// these (or "all") and we forward it. Anything else is rejected so a
// malformed query can't be smuggled through to the upstream API.
const VALID_CATEGORIES = new Set([
  'all',
  'general',
  'tech',
  'business',
  'sports',
  'health',
  'science',
  'entertainment',
  'politics',
  'food',
  'travel',
]);

const app = express();

app.use(
  cors({
    origin: ALLOWED_ORIGINS.split(',').map((o) => o.trim()),
  }),
);

// Health endpoint — useful for the dev script and for uptime checks.
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'news-reader-proxy' });
});

/**
 * GET /api/top-stories?category=<category>
 *
 * The single endpoint the client calls. Steps:
 *   1. Validate the category.
 *   2. Fetch a pool of recent English-language stories from TheNewsAPI.
 *      We pull more than 3 (default: 25) so the Go scorer has real signal
 *      to rank against — otherwise "top 3" is meaningless.
 *   3. Forward the pool to the Go scorer, which returns the ranked top 3
 *      plus a one-sentence "Why this story?" blurb per story.
 *   4. Return the scorer's response verbatim to the client.
 */
app.get('/api/top-stories', async (req, res) => {
  const requested = String(req.query.category || 'all').toLowerCase();
  const category = VALID_CATEGORIES.has(requested) ? requested : 'all';

  // Build the upstream URL. TheNewsAPI uses `categories` (plural) and accepts
  // a comma-separated list; we only ever send one at a time.
  const upstream = new URL(NEWS_API_URL);
  upstream.searchParams.set('api_token', THENEWSAPI_KEY);
  upstream.searchParams.set('language', 'en');
  upstream.searchParams.set('limit', '25');
  if (category !== 'all') {
    upstream.searchParams.set('categories', category);
  }

  try {
    const newsResp = await fetch(upstream.toString());
    if (!newsResp.ok) {
      const body = await safeText(newsResp);
      console.error(
        `[proxy] TheNewsAPI returned ${newsResp.status}: ${body.slice(0, 200)}`,
      );
      return res
        .status(502)
        .json({ error: 'upstream_news_api_failed', status: newsResp.status });
    }

    const newsJson = await newsResp.json();
    const pool = Array.isArray(newsJson.data) ? newsJson.data : [];

    // Forward to the Go scorer. The scorer expects a JSON body of the shape
    //   { category: string, stories: Story[] }
    // and returns { stories: ScoredStory[], generatedAt: ISOString }.
    const scoreResp = await fetch(`${SCORER_URL}/score`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ category, stories: pool }),
    });

    if (!scoreResp.ok) {
      const body = await safeText(scoreResp);
      console.error(
        `[proxy] Scorer returned ${scoreResp.status}: ${body.slice(0, 200)}`,
      );
      return res
        .status(502)
        .json({ error: 'scorer_failed', status: scoreResp.status });
    }

    const scored = await scoreResp.json();
    return res.json(scored);
  } catch (err) {
    console.error('[proxy] Unhandled error:', err);
    return res.status(500).json({ error: 'proxy_internal_error' });
  }
});

/**
 * GET /api/search?q=<query>&category=<category>
 *
 * Same shape and contract as /api/top-stories, but driven by a free-text
 * query routed through TheNewsAPI's `search` parameter. We:
 *
 *   1. Validate the query (min 2 chars — TheNewsAPI rejects 1-char queries
 *      anyway, and we'd rather fail fast with a clean message).
 *   2. Pull a larger pool (40) since search results are sparser than the
 *      general "today's news" stream.
 *   3. Ask the scorer for up to 9 ranked results (more than 3 — search is
 *      exploration, not the daily brief).
 */
app.get('/api/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) {
    return res.status(400).json({ error: 'query_too_short' });
  }

  const requestedCat = String(req.query.category || 'all').toLowerCase();
  const category = VALID_CATEGORIES.has(requestedCat) ? requestedCat : 'all';

  const upstream = new URL(NEWS_API_URL);
  upstream.searchParams.set('api_token', THENEWSAPI_KEY);
  upstream.searchParams.set('language', 'en');
  upstream.searchParams.set('limit', '40');
  upstream.searchParams.set('search', q);
  if (category !== 'all') {
    upstream.searchParams.set('categories', category);
  }

  try {
    const newsResp = await fetch(upstream.toString());
    if (!newsResp.ok) {
      const body = await safeText(newsResp);
      console.error(
        `[proxy] TheNewsAPI search returned ${newsResp.status}: ${body.slice(0, 200)}`,
      );
      return res
        .status(502)
        .json({ error: 'upstream_news_api_failed', status: newsResp.status });
    }

    const newsJson = await newsResp.json();
    const pool = Array.isArray(newsJson.data) ? newsJson.data : [];

    const scoreResp = await fetch(`${SCORER_URL}/score`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ category, stories: pool, limit: 9 }),
    });

    if (!scoreResp.ok) {
      const body = await safeText(scoreResp);
      console.error(
        `[proxy] Scorer (search) returned ${scoreResp.status}: ${body.slice(0, 200)}`,
      );
      return res
        .status(502)
        .json({ error: 'scorer_failed', status: scoreResp.status });
    }

    const scored = await scoreResp.json();
    // Echo the query back so the client can verify what it's rendering.
    return res.json({ ...scored, query: q });
  } catch (err) {
    console.error('[proxy] Unhandled error (search):', err);
    return res.status(500).json({ error: 'proxy_internal_error' });
  }
});

// 404 catch-all — keep it lightweight so the client gets a useful shape.
app.use((req, res) => {
  res.status(404).json({ error: 'not_found', path: req.path });
});

app.listen(PROXY_PORT, () => {
  console.log(`[proxy] Listening on http://localhost:${PROXY_PORT}`);
  console.log(`[proxy] Scorer expected at ${SCORER_URL}`);
});

// Helper: read a response body as text without throwing.
async function safeText(resp) {
  try {
    return await resp.text();
  } catch {
    return '';
  }
}
