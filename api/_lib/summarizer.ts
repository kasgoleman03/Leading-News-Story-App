// =============================================================================
// TypeScript port of services/internal/summarizer/whythisstory.go
//
// Produces the one-sentence "Why this story?" blurb that appears on each
// card. We deliberately do NOT call an LLM here. The product constraint is
// that the blurb is "exactly one sentence — authoritative and punchy". A
// deterministic heuristic written against the same signals the scorer
// already computed gives us:
//
//   - Zero latency / zero cost / zero external dependency.
//   - A blurb that is always grounded in real facts about the story
//     (its source, its age, its category, its impact words) instead of an
//     LLM hallucination.
//   - A defensible answer to "how does this work?" in an interview.
//
// If a future iteration wants to plug in an LLM, the surface area is small:
// swap the body of generate() for a network call and keep the same signature.
// =============================================================================

import type { Scored } from './types.js';

/**
 * Returns a single-sentence explanation of why this story matters, based
 * purely on signals already present in the Story plus the scorer's output.
 * Always:
 *   - Exactly one sentence (one terminal period).
 *   - Punchy: < ~25 words.
 *   - Grounded: every claim ("just broke", "from Reuters", "tech beat")
 *     is derived from a real field on the story.
 */
export function generate(s: Scored, now: Date): string {
  const parts: string[] = [];

  // Lead with recency if the story is genuinely fresh.
  const ts = Date.parse(s.published_at);
  if (!Number.isNaN(ts)) {
    const ageHours = (now.getTime() - ts) / 3_600_000;
    if (ageHours < 1) {
      parts.push('Just broke within the last hour');
    } else if (ageHours < 3) {
      parts.push(`Filed ${Math.round(ageHours)} hours ago and still developing`);
    } else if (ageHours < 8) {
      parts.push("Among the most recent in today's cycle");
    }
  }

  // Source credibility (only if it's a notably trusted outlet).
  const trusted = trustedSourceLabel(s.source);
  if (trusted) parts.push(`from ${trusted}`);

  // Category framing — gives the user a "why this fits my interests" anchor.
  const cat = primaryCategory(s.categories);
  if (cat) parts.push(`in the ${cat} beat`);

  // Impact framing — only if the title actually contains an impact cue.
  const cue = impactCue(s.title);
  if (cue) parts.push(`flagged for its ${cue} language`);

  // Sparse story fallback. Generic but still grounded.
  if (parts.length === 0) {
    return "Ranked highly by today's recency-and-relevance model against the rest of the news pool.";
  }

  // Assemble into one sentence. Capitalize the first character, end with
  // a single period, and collapse any accidental double spaces.
  let sentence = parts.join(', ') + '.';
  sentence = sentence[0].toUpperCase() + sentence.slice(1);
  sentence = sentence.replace(/ {2,}/g, ' ');
  return sentence;
}

/**
 * Returns a human-friendly label for a known trusted source, or "" if the
 * source isn't on our short list. Kept in sync with trustedSources in
 * scoring.ts — the blurb should only brag about outlets the scorer
 * already gave a trust bonus to.
 */
function trustedSourceLabel(source: string): string {
  switch ((source ?? '').toLowerCase().trim()) {
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

/**
 * First non-empty, non-"general" category, lowercased. Reads better in
 * the surrounding sentence ("in the tech beat" vs "in the Tech beat").
 */
function primaryCategory(categories: string[] | undefined): string {
  if (!categories) return '';
  for (const raw of categories) {
    const c = (raw ?? '').trim().toLowerCase();
    if (c === '' || c === 'general') continue;
    return c;
  }
  return '';
}

/**
 * Short label describing the kind of impact language in the title, or ""
 * if none. Conservative on purpose — false positives make the blurb sound
 * generic.
 */
function impactCue(title: string): string {
  const lower = (title ?? '').toLowerCase();
  if (lower.includes('breaking') || lower.includes('exclusive')) {
    return 'breaking-news';
  }
  if (
    lower.includes('announce') || lower.includes('unveil') ||
    lower.includes('launch') || lower.includes('reveal')
  ) {
    return 'announcement';
  }
  if (
    lower.includes('warn') || lower.includes('crisis') ||
    lower.includes('ruling') || lower.includes('rules')
  ) {
    return 'consequential';
  }
  if (
    lower.includes('record') || lower.includes('historic') ||
    lower.includes('first ') || lower.includes('major ')
  ) {
    return 'milestone';
  }
  return '';
}
