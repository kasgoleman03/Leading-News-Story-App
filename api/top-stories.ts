// =============================================================================
// GET /api/top-stories?category=<category>
//
// Vercel serverless function. Combines what the Express proxy + Go scorer
// do locally into a single Node call:
//
//   1. Validate the category against our whitelist.
//   2. Fetch a pool of stories from TheNewsAPI (key stays server-side).
//   3. Rank them with the scoring module.
//   4. Attach a "Why this story?" blurb to each survivor.
//   5. Return the top 3 plus metadata.
//
// Keeping the lib code in /api/_lib means each function imports exactly
// what it needs; Vercel auto-bundles transitive deps with the function.
// =============================================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ApiError, fetchNewsPool, normalizeCategory } from './_lib/thenewsapi.js';
import { rank } from './_lib/scoring.js';
import { generate } from './_lib/summarizer.js';
import type { TopStoriesResponse } from './_lib/types.js';

const TOP_N = 3;

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const category = normalizeCategory(req.query.category);

  try {
    // We pull more than 3 (25 by default) so the scorer has real signal to
    // rank against — otherwise "top 3" is meaningless.
    const pool = await fetchNewsPool({ category, limit: 25 });

    const now = new Date();
    const ranked = rank(pool, TOP_N);
    for (const s of ranked) {
      s.why_this_story = generate(s, now);
    }

    const body: TopStoriesResponse = {
      category,
      generated_at: now.toISOString(),
      stories: ranked,
    };

    // Light caching — these stories change every few minutes upstream, and
    // a 60s edge cache absorbs traffic spikes without ever showing the user
    // stale-by-more-than-a-minute content.
    res.setHeader(
      'Cache-Control',
      's-maxage=60, stale-while-revalidate=120',
    );
    res.status(200).json(body);
  } catch (err) {
    if (err instanceof ApiError) {
      console.error(`[top-stories] ${err.message}`, err.extra ?? {});
      res.status(err.status).json({ error: err.message, ...(err.extra ?? {}) });
      return;
    }
    console.error('[top-stories] unhandled error', err);
    res.status(500).json({ error: 'internal_error' });
  }
}
