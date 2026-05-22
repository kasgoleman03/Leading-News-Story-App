// =============================================================================
// GET /api/top-stories?category=<category>
//
// Vercel serverless function. Plain CommonJS JavaScript, fully self-contained.
// No relative imports, no TypeScript compilation step, no module-format
// gymnastics — Node loads this as CJS unconditionally and there's nothing for
// a bundler to misinterpret.
//
// The "canonical" architecture (modular TS in /api/_lib mirroring the Go
// service in /services) is preserved in the repo for reference. This file is
// the inlined deployment surface, optimized for Vercel's runtime predictably
// loading it without any module-system disagreement.
// =============================================================================

'use strict';

// -- TheNewsAPI helpers --------------------------------------------------------

const NEWS_API_URL = 'https://api.thenewsapi.com/v1/news/all';
const TOP_N = 3;

const VALID_CATEGORIES = new Set([
  'all', 'general', 'tech', 'business', 'sports', 'health',
  'science', 'entertainment', 'politics', 'food', 'travel',
]);

function normalizeCategory(raw) {
  const v = String(raw == null ? 'all' : raw).toLowerCase().trim();
  return VALID_CATEGORIES.has(v) ? v : 'all';
}

async function fetchNewsPool(category, limit) {
  const key = process.env.THENEWSAPI_KEY;
  if (!key) {
    const err = new Error('missing_api_key');
    err.status = 500;
    throw err;
  }

  const upstream = new URL(NEWS_API_URL);
  upstream.searchParams.set('api_token', key);
  upstream.searchParams.set('language', 'en');
  upstream.searchParams.set('limit', String(limit));
  if (category !== 'all') upstream.searchParams.set('categories', category);

  const resp = await fetch(upstream.toString());
  if (!resp.ok) {
    let body = '';
    try { body = await resp.text(); } catch { /* ignore */ }
    console.error(`[top-stories] TheNewsAPI ${resp.status}: ${body.slice(0, 200)}`);
    const err = new Error('upstream_news_api_failed');
    err.status = 502;
    err.extra = { status: resp.status };
    throw err;
  }

  const json = await resp.json();
  return Array.isArray(json.data) ? json.data : [];
}

// -- Scoring (mirrors services/internal/scoring/relevance.go) ------------------

const weightRecency     = 0.6;
const weightContent     = 0.2;
const weightSourceTrust = 0.1;
const weightImpactWords = 0.1;
const recencyHalfLifeHours = 8.0;
const maxAgeHours = 36.0;

const impactWords = [
  'breaking', 'exclusive', 'announces', 'announced', 'launches', 'launched',
  'unveils', 'reveals', 'warns', 'rules', 'ruling', 'passes', 'passed',
  'votes', 'voted', 'wins', 'won', 'loses', 'lost', 'dies', 'died',
  'resigns', 'resigned', 'fires', 'fired', 'elected', 'deal', 'agreement',
  'crisis', 'record', 'first', 'historic', 'major',
];

const trustedSources = {
  'reuters.com':        1.0,
  'apnews.com':         1.0,
  'bbc.com':            0.95,
  'bbc.co.uk':          0.95,
  'nytimes.com':        0.9,
  'washingtonpost.com': 0.9,
  'theguardian.com':    0.9,
  'wsj.com':            0.9,
  'bloomberg.com':      0.9,
  'ft.com':             0.9,
  'npr.org':            0.85,
  'cnn.com':            0.75,
  'cnbc.com':           0.75,
  'theverge.com':       0.8,
  'techcrunch.com':     0.75,
  'arstechnica.com':    0.8,
  'wired.com':          0.8,
  'axios.com':          0.8,
  'politico.com':       0.8,
  'economist.com':      0.9,
};

function recencyScore(publishedAt, now) {
  if (!publishedAt) return 0;
  const ts = Date.parse(publishedAt);
  if (Number.isNaN(ts)) return 0;
  let ageHours = (now.getTime() - ts) / 3_600_000;
  if (ageHours < 0) ageHours = 0;
  if (ageHours > maxAgeHours) return 0;
  return Math.exp(-Math.LN2 * ageHours / recencyHalfLifeHours);
}

function contentScore(s) {
  let score = 0;
  let desc = (s.description || '').trim();
  if (desc === '') desc = (s.snippet || '').trim();
  if (desc.length >= 120) score += 0.7;
  else if (desc.length >= 60) score += 0.5;
  else if (desc.length > 0) score += 0.2;
  if ((s.image_url || '').trim() !== '') score += 0.3;
  return score > 1 ? 1 : score;
}

function sourceTrustScore(source) {
  const key = (source || '').toLowerCase().trim();
  return Object.prototype.hasOwnProperty.call(trustedSources, key)
    ? trustedSources[key]
    : 0.5;
}

function impactScore(title) {
  if (!title) return 0;
  const lower = title.toLowerCase();
  let hits = 0;
  for (const w of impactWords) {
    if (lower.includes(w)) {
      hits++;
      if (hits >= 2) break;
    }
  }
  return hits / 2;
}

function scoreStory(s, now) {
  return (
    weightRecency     * recencyScore(s.published_at, now) +
    weightContent     * contentScore(s) +
    weightSourceTrust * sourceTrustScore(s.source) +
    weightImpactWords * impactScore(s.title)
  );
}

function diversifyBySource(sorted, n) {
  if (n <= 0 || sorted.length <= n) return sorted.slice();
  const picked = [];
  const seen = new Set();
  const leftovers = [];
  for (const s of sorted) {
    const src = (s.source || '').toLowerCase().trim();
    if (!seen.has(src) && picked.length < n) {
      picked.push(s);
      seen.add(src);
    } else {
      leftovers.push(s);
    }
  }
  for (const s of leftovers) {
    if (picked.length >= n) break;
    picked.push(s);
  }
  return picked;
}

function rank(pool, n) {
  const now = new Date();
  const scored = [];
  for (const s of pool) {
    if (!s.title || s.title.trim() === '') continue;
    if (!s.url || s.url.trim() === '') continue;
    scored.push(Object.assign({}, s, {
      score: scoreStory(s, now),
      story_of_hour: false,
      why_this_story: '',
    }));
  }
  scored.sort((a, b) => b.score - a.score);
  let out = diversifyBySource(scored, n);
  if (out.length > n) out = out.slice(0, n);
  if (out.length > 0) out[0].story_of_hour = true;
  return out;
}

// -- Why-this-story summarizer (mirrors services/internal/summarizer) ----------

function trustedSourceLabel(source) {
  switch ((source || '').toLowerCase().trim()) {
    case 'reuters.com':         return 'Reuters';
    case 'apnews.com':          return 'the Associated Press';
    case 'bbc.com':
    case 'bbc.co.uk':           return 'the BBC';
    case 'nytimes.com':         return 'The New York Times';
    case 'washingtonpost.com':  return 'The Washington Post';
    case 'theguardian.com':     return 'The Guardian';
    case 'wsj.com':             return 'The Wall Street Journal';
    case 'bloomberg.com':       return 'Bloomberg';
    case 'ft.com':              return 'the Financial Times';
    case 'npr.org':             return 'NPR';
    case 'theverge.com':        return 'The Verge';
    case 'techcrunch.com':      return 'TechCrunch';
    case 'arstechnica.com':     return 'Ars Technica';
    case 'wired.com':           return 'Wired';
    case 'axios.com':           return 'Axios';
    case 'politico.com':        return 'Politico';
    case 'economist.com':       return 'The Economist';
    case 'cnbc.com':            return 'CNBC';
    default:                    return '';
  }
}

function primaryCategory(categories) {
  if (!Array.isArray(categories)) return '';
  for (const raw of categories) {
    const c = (raw || '').trim().toLowerCase();
    if (c === '' || c === 'general') continue;
    return c;
  }
  return '';
}

function impactCue(title) {
  const lower = (title || '').toLowerCase();
  if (lower.includes('breaking') || lower.includes('exclusive')) return 'breaking-news';
  if (
    lower.includes('announce') || lower.includes('unveil') ||
    lower.includes('launch')   || lower.includes('reveal')
  ) return 'announcement';
  if (
    lower.includes('warn')   || lower.includes('crisis') ||
    lower.includes('ruling') || lower.includes('rules')
  ) return 'consequential';
  if (
    lower.includes('record')  || lower.includes('historic') ||
    lower.includes('first ')  || lower.includes('major ')
  ) return 'milestone';
  return '';
}

function generateWhy(s, now) {
  const parts = [];
  const ts = Date.parse(s.published_at);
  if (!Number.isNaN(ts)) {
    const ageHours = (now.getTime() - ts) / 3_600_000;
    if (ageHours < 1) parts.push('Just broke within the last hour');
    else if (ageHours < 3) parts.push(`Filed ${Math.round(ageHours)} hours ago and still developing`);
    else if (ageHours < 8) parts.push("Among the most recent in today's cycle");
  }
  const trusted = trustedSourceLabel(s.source);
  if (trusted) parts.push(`from ${trusted}`);
  const cat = primaryCategory(s.categories);
  if (cat) parts.push(`in the ${cat} beat`);
  const cue = impactCue(s.title);
  if (cue) parts.push(`flagged for its ${cue} language`);

  if (parts.length === 0) {
    return "Ranked highly by today's recency-and-relevance model against the rest of the news pool.";
  }

  let sentence = parts.join(', ') + '.';
  sentence = sentence[0].toUpperCase() + sentence.slice(1);
  sentence = sentence.replace(/ {2,}/g, ' ');
  return sentence;
}

// -- HTTP handler --------------------------------------------------------------

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const category = normalizeCategory(req.query.category);

  try {
    // Pull more than 3 (25) so the scorer has real signal to rank against;
    // otherwise "top 3" is just "first 3 the API returned".
    const pool = await fetchNewsPool(category, 25);

    const now = new Date();
    const ranked = rank(pool, TOP_N);
    for (const s of ranked) {
      s.why_this_story = generateWhy(s, now);
    }

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    res.status(200).json({
      category,
      generated_at: now.toISOString(),
      stories: ranked,
    });
  } catch (err) {
    if (err && err.status) {
      console.error(`[top-stories] ${err.message}`, err.extra || {});
      res.status(err.status).json(Object.assign({ error: err.message }, err.extra || {}));
      return;
    }
    console.error('[top-stories] unhandled error', err);
    res.status(500).json({ error: 'internal_error' });
  }
};
