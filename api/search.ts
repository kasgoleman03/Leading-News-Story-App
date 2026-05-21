// =============================================================================
// GET /api/search?q=<query>&category=<category>
//
// Same shape and contract as /api/top-stories, but driven by a free-text
// query routed through TheNewsAPI's `search` parameter. We:
//
//   1. Validate the query (min 2 chars — TheNewsAPI rejects 1-char queries
//      anyway, and we'd rather fail fast with a clean message).
//   2. Pull a larger pool (40) since search results are sparser than the
//      general "today's news" stream.
//   3. Rank up to 9 results — search is exploration, not the daily brief.
//   4. Echo the query back so the client can verify what it's rendering.
// =============================================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ApiError, fetchNewsPool, normalizeCategory } from './_lib/thenewsapi.js';
import { rank } from './_lib/scoring.js';
import { generate } from './_lib/summarizer.js';
import type { SearchResponse } from './_lib/types.js';

const SEARCH_TOP_N = 9;

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const q = String(req.query.q ?? '').trim();
  if (q.length < 2) {
    res.status(400).json({ error: 'query_too_short' });
    return;
  }

  const category = normalizeCategory(req.query.category);

  try {
    const pool = await fetchNewsPool({ category, search: q, limit: 40 });

    const now = new Date();
    const ranked = rank(pool, SEARCH_TOP_N);
    for (const s of ranked) {
      s.why_this_story = generate(s, now);
    }

    const body: SearchResponse = {
      query: q,
      category,
      generated_at: now.toISOString(),
      stories: ranked,
    };

    // Search results are even safer to cache than top-stories because the
    // same query rarely changes minute-to-minute.
    res.setHeader(
      'Cache-Control',
      's-maxage=120, stale-while-revalidate=300',
    );
    res.status(200).json(body);
  } catch (err) {
    if (err instanceof ApiError) {
      console.error(`[search] ${err.message}`, err.extra ?? {});
      res.status(err.status).json({ error: err.message, ...(err.extra ?? {}) });
      return;
    }
    console.error('[search] unhandled error', err);
    res.status(500).json({ error: 'internal_error' });
  }
}
