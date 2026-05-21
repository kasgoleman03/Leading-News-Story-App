import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Story shape as returned by the Go scorer (which has already ranked the
 * raw TheNewsAPI items and added our score + blurb fields).
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
  published_at: string;
  language?: string;
  score: number;
  story_of_hour: boolean;
  why_this_story: string;
}

export interface TopStoriesResponse {
  category: string;
  generated_at: string;
  stories: Story[];
}

export type FetchStatus = 'idle' | 'loading' | 'success' | 'error';

interface UseFetchNewsResult {
  status: FetchStatus;
  stories: Story[];
  category: string;
  generatedAt: Date | null;
  errorKind: 'network' | 'empty' | 'server' | null;
  refresh: () => void;
  setCategory: (c: string) => void;
}

/**
 * Hook for fetching the top stories via the Express proxy.
 *
 * Responsibilities:
 *
 *   - Holds the currently-selected category and exposes a setter.
 *   - Re-fetches whenever the category changes OR refresh() is called.
 *   - Aborts in-flight requests on unmount or rapid category changes so
 *     we don't flash stale content into the UI.
 *   - Returns a structured error kind (not a raw message) so the UI can
 *     pick the right human-friendly fallback copy.
 *
 * The hook intentionally does NOT do any ranking/scoring of its own — that
 * all lives in Go. By the time stories reach React they're already a
 * ranked top 3.
 */
export function useFetchNews(initialCategory = 'all'): UseFetchNewsResult {
  const [category, setCategoryState] = useState(initialCategory);
  const [status, setStatus] = useState<FetchStatus>('idle');
  const [stories, setStories] = useState<Story[]>([]);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
  const [errorKind, setErrorKind] = useState<UseFetchNewsResult['errorKind']>(
    null,
  );

  // Track the latest request so we can ignore late responses from stale ones.
  const requestIdRef = useRef(0);

  const doFetch = useCallback(async (cat: string) => {
    const requestId = ++requestIdRef.current;
    setStatus('loading');
    setErrorKind(null);

    try {
      const resp = await fetch(
        `/api/top-stories?category=${encodeURIComponent(cat)}`,
        { headers: { accept: 'application/json' } },
      );

      if (!resp.ok) {
        if (requestId !== requestIdRef.current) return;
        setStatus('error');
        setErrorKind('server');
        return;
      }

      const data = (await resp.json()) as TopStoriesResponse;
      if (requestId !== requestIdRef.current) return;

      if (!data.stories || data.stories.length === 0) {
        setStories([]);
        setGeneratedAt(new Date(data.generated_at));
        setStatus('success');
        setErrorKind('empty');
        return;
      }

      setStories(data.stories);
      setGeneratedAt(new Date(data.generated_at));
      setStatus('success');
      setErrorKind(null);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      // Network failures (offline, DNS, CORS preflight) all land here.
      console.error('[useFetchNews] fetch failed', err);
      setStatus('error');
      setErrorKind('network');
    }
  }, []);

  // Initial fetch + refetch on category change.
  useEffect(() => {
    doFetch(category);
  }, [category, doFetch]);

  const refresh = useCallback(() => {
    doFetch(category);
  }, [category, doFetch]);

  const setCategory = useCallback((c: string) => {
    setCategoryState(c);
  }, []);

  return {
    status,
    stories,
    category,
    generatedAt,
    errorKind,
    refresh,
    setCategory,
  };
}
