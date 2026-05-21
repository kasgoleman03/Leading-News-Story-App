// =============================================================================
// Shared helper for talking to TheNewsAPI "All News" endpoint.
//
// This module is the only place that knows the upstream URL and reads
// the API key. Both /api/top-stories and /api/search delegate the actual
// HTTP call here so the secret-handling rule (key only lives in env) stays
// enforced in one spot.
// =============================================================================

import type { Story } from './types.js';

const NEWS_API_URL = 'https://api.thenewsapi.com/v1/news/all';

/**
 * Categories TheNewsAPI understands. Mirrored from the Express proxy's
 * whitelist in /proxy/server.js. Anything not on this list is coerced to
 * "all" before being forwarded — keeps malformed queries from being
 * smuggled to the upstream API.
 */
export const VALID_CATEGORIES = new Set([
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

export function normalizeCategory(raw: unknown): string {
  const v = String(raw ?? 'all').toLowerCase().trim();
  return VALID_CATEGORIES.has(v) ? v : 'all';
}

interface FetchOpts {
  category: string;
  /** Optional free-text search term. When set, switches to search mode. */
  search?: string;
  /** Pool size to ask TheNewsAPI for (default 25 for top, 40 for search). */
  limit?: number;
}

/**
 * Hit TheNewsAPI and return the raw story pool. Throws an Error with a
 * structured message if the key is missing or the upstream call fails;
 * the calling function turns these into 502 responses for the client.
 */
export async function fetchNewsPool(opts: FetchOpts): Promise<Story[]> {
  const key = process.env.THENEWSAPI_KEY;
  if (!key) {
    throw new ApiError('missing_api_key', 500);
  }

  const upstream = new URL(NEWS_API_URL);
  upstream.searchParams.set('api_token', key);
  upstream.searchParams.set('language', 'en');
  upstream.searchParams.set('limit', String(opts.limit ?? 25));
  if (opts.category && opts.category !== 'all') {
    upstream.searchParams.set('categories', opts.category);
  }
  if (opts.search) {
    upstream.searchParams.set('search', opts.search);
  }

  const resp = await fetch(upstream.toString());
  if (!resp.ok) {
    const body = await safeText(resp);
    console.error(
      `[thenewsapi] returned ${resp.status}: ${body.slice(0, 200)}`,
    );
    throw new ApiError('upstream_news_api_failed', 502, { status: resp.status });
  }

  const json = (await resp.json()) as { data?: Story[] };
  return Array.isArray(json.data) ? json.data : [];
}

/**
 * Tagged error so the route handlers can map upstream failure modes to
 * the right HTTP status without leaking raw upstream messages to the user.
 */
export class ApiError extends Error {
  status: number;
  extra?: Record<string, unknown>;
  constructor(message: string, status: number, extra?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

async function safeText(resp: Response): Promise<string> {
  try {
    return await resp.text();
  } catch {
    return '';
  }
}
