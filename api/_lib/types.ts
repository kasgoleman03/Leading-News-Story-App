// =============================================================================
// Shared types for the Vercel /api functions.
//
// The shapes here mirror the Go service's JSON contract exactly so the
// React client doesn't need a single change between local dev (Go scorer)
// and production (these TypeScript functions). If you find yourself
// renaming a field, double-check that the corresponding Go struct tag in
// /services/internal/scoring/relevance.go matches — that's the single
// source of truth the client expects.
// =============================================================================

/**
 * Story is the subset of TheNewsAPI "All News" response we care about.
 * The upstream payload has more fields but these are the only ones that
 * influence ranking or display.
 */
export interface Story {
  uuid: string;
  title: string;
  description: string;
  snippet?: string;
  url: string;
  image_url?: string;
  source: string;
  categories?: string[];
  /** ISO-8601 timestamp string, exactly as TheNewsAPI returns it. */
  published_at: string;
  language?: string;
}

/**
 * Scored is a Story enriched with the scorer's output. Fields are
 * snake_case to match what the Go service emits.
 */
export interface Scored extends Story {
  score: number;
  story_of_hour: boolean;
  why_this_story: string;
}

/** Response body for /api/top-stories. */
export interface TopStoriesResponse {
  category: string;
  generated_at: string;
  stories: Scored[];
}

/** Response body for /api/search (adds the echoed query). */
export interface SearchResponse extends TopStoriesResponse {
  query: string;
}
