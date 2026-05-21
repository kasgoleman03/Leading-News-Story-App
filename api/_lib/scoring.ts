// =============================================================================
// TypeScript port of services/internal/scoring/relevance.go
//
// This module ranks a pool of news stories by a weighted blend of recency
// and relevance signals so the top N surfaced to the user feel curated
// rather than "first N the API returned".
//
// The scoring model is intentionally transparent — every input weight is a
// named constant so a reviewer can reason about (and tune) why a given
// story floated to the top.
//
// Behavioural parity with the Go version is enforced by:
//   - Identical constants and weights
//   - Identical impactWords list and trustedSources table
//   - Same exponential-decay recency curve
//   - Same source-diversity pass before the top-N slice
//
// If you change anything here, mirror the change in the Go scorer so the
// local dev experience matches what Vercel serves in production.
// =============================================================================

import type { Story, Scored } from './types.js';

// ------- weights & thresholds (must mirror relevance.go) ---------------------

const weightRecency = 0.6;
const weightContent = 0.2;
const weightSourceTrust = 0.1;
const weightImpactWords = 0.1;

/** Recency half-life in hours. A story exactly one half-life old gets
 * 50% of the recency credit. */
const recencyHalfLifeHours = 8.0;

/** Anything older than this hard cap gets zero recency credit;
 * "top of the day" should not be yesterday's news. */
const maxAgeHours = 36.0;

/** Impact tokens that indicate consequential reporting (breaking news,
 * major announcements, regulatory action). Short on purpose — we want
 * the signal to be reliable, not noisy. */
const impactWords: readonly string[] = [
  'breaking', 'exclusive', 'announces', 'announced', 'launches', 'launched',
  'unveils', 'reveals', 'warns', 'rules', 'ruling', 'passes', 'passed',
  'votes', 'voted', 'wins', 'won', 'loses', 'lost', 'dies', 'died',
  'resigns', 'resigned', 'fires', 'fired', 'elected', 'deal', 'agreement',
  'crisis', 'record', 'first', 'historic', 'major',
];

/** Coarse, hand-tuned trust bias toward outlets with editorial standards.
 * Intentionally conservative — we only nudge well-known wire services and
 * major papers up; we don't penalize anyone. */
const trustedSources: Readonly<Record<string, number>> = {
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

// ------- public API ----------------------------------------------------------

/**
 * Rank takes a pool of stories and returns the top N, scored and sorted
 * descending. Stories without a URL or title are filtered out — those would
 * render as broken cards on the client.
 */
export function rank(pool: readonly Story[], n: number): Scored[] {
  const now = new Date();

  const scored: Scored[] = [];
  for (const s of pool) {
    if (s.title.trim() === '' || s.url.trim() === '') continue;
    scored.push({
      ...s,
      score: scoreStory(s, now),
      story_of_hour: false,
      why_this_story: '',
    });
  }

  // Array.prototype.sort is stable in modern V8 (Node >= 12).
  scored.sort((a, b) => b.score - a.score);

  // Enforce source diversity in the top N: if we already picked a story
  // from a given source, prefer the next-highest story from a different
  // source over a second story of similar score from the same source.
  let out = diversifyBySource(scored, n);
  if (out.length > n) out = out.slice(0, n);

  // Flag the single highest-scoring item as Story of the Hour. The client
  // uses this on mobile to render a badge on the lead card.
  if (out.length > 0) {
    out[0].story_of_hour = true;
  }

  return out;
}

// ------- score components ----------------------------------------------------

/**
 * Compute a story's overall ranking score in [0, 1] (approximately).
 * Each component is independently in [0, 1] and weighted by the constants
 * above, so the final score is also bounded ~[0, 1].
 */
function scoreStory(s: Story, now: Date): number {
  return (
    weightRecency     * recencyScore(s.published_at, now) +
    weightContent     * contentScore(s) +
    weightSourceTrust * sourceTrustScore(s.source) +
    weightImpactWords * impactScore(s.title)
  );
}

/** Exponential-decay recency curve with an 8-hour half-life. Smooth at the
 * edges; well-behaved for stories that are zero/future-dated. */
function recencyScore(publishedAt: string, now: Date): number {
  if (!publishedAt) return 0;
  const ts = Date.parse(publishedAt);
  if (Number.isNaN(ts)) return 0;

  let ageHours = (now.getTime() - ts) / 3_600_000;
  if (ageHours < 0) ageHours = 0; // future-dated -> treat as "now" (clock skew)
  if (ageHours > maxAgeHours) return 0;

  return Math.exp(-Math.LN2 * ageHours / recencyHalfLifeHours);
}

/** Reward stories that will render well on the card: a description of
 * reasonable length and the presence of an image. */
function contentScore(s: Story): number {
  let score = 0;

  let desc = (s.description ?? '').trim();
  if (desc === '') desc = (s.snippet ?? '').trim();

  if (desc.length >= 120) score += 0.7;
  else if (desc.length >= 60) score += 0.5;
  else if (desc.length > 0) score += 0.2;

  if ((s.image_url ?? '').trim() !== '') score += 0.3;

  return score > 1 ? 1 : score;
}

function sourceTrustScore(source: string): number {
  const key = (source ?? '').toLowerCase().trim();
  const v = trustedSources[key];
  // Unknown source — neutral, not penalized. Plenty of great local outlets
  // won't be in the map.
  return v ?? 0.5;
}

/** Count impact words in a title, capped at 2. Two is plenty of signal;
 * more usually means clickbait. */
function impactScore(title: string): number {
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

// ------- source diversity ----------------------------------------------------

/**
 * Walk the sorted list and prefer picking one story per source until we
 * have N picks, then fill any remaining slots without that constraint.
 * Soft preference — if there are fewer distinct sources than N, we still
 * return N stories.
 */
function diversifyBySource(sorted: readonly Scored[], n: number): Scored[] {
  if (n <= 0 || sorted.length <= n) return [...sorted];

  const picked: Scored[] = [];
  const seenSources = new Set<string>();
  const leftovers: Scored[] = [];

  for (const s of sorted) {
    const src = (s.source ?? '').toLowerCase().trim();
    if (!seenSources.has(src) && picked.length < n) {
      picked.push(s);
      seenSources.add(src);
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
