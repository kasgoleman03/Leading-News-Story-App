import { useCallback, useEffect, useRef, useState } from 'react';
import type { Story } from './useFetchNews';

/**
 * Search hook. Symmetric with useFetchNews but driven by a query string
 * instead of a category. Returns an empty/idle state when the query is
 * blank so the UI knows to render the top-stories view instead of search.
 *
 * Why a separate hook rather than expanding useFetchNews:
 *   - The two have different "empty" semantics ("quiet beat" vs "no
 *     matches for 'x'"), different default result counts, and different
 *     hot keys (debounce only makes sense for search). Forking the hook
 *     keeps both call sites simple.
 *   - Search results should NOT replace cached top-stories state when the
 *     user clears the query — we want top stories to still be sitting
 *     there ready to show.
 */

export type SearchStatus = 'idle' | 'loading' | 'success' | 'error';

interface SearchResponse {
  query: string;
  category: string;
  generated_at: string;
  stories: Story[];
}

interface UseSearchResult {
  status: SearchStatus;
  query: string;
  results: Story[];
  errorKind: 'network' | 'empty' | 'server' | 'too_short' | null;
  setQuery: (q: string) => void;
  clear: () => void;
}

export function useSearch(): UseSearchResult {
  const [query, setQueryState] = useState('');
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [results, setResults] = useState<Story[]>([]);
  const [errorKind, setErrorKind] = useState<UseSearchResult['errorKind']>(
    null,
  );

  const requestIdRef = useRef(0);
  const debounceRef = useRef<number | null>(null);

  const doFetch = useCallback(async (q: string) => {
    const requestId = ++requestIdRef.current;
    setStatus('loading');
    setErrorKind(null);

    try {
      const resp = await fetch(
        `/api/search?q=${encodeURIComponent(q)}`,
        { headers: { accept: 'application/json' } },
      );

      if (!resp.ok) {
        if (requestId !== requestIdRef.current) return;
        // 400 means the proxy rejected the query (too short, etc.)
        setStatus('error');
        setErrorKind(resp.status === 400 ? 'too_short' : 'server');
        return;
      }

      const data = (await resp.json()) as SearchResponse;
      if (requestId !== requestIdRef.current) return;

      if (!data.stories || data.stories.length === 0) {
        setResults([]);
        setStatus('success');
        setErrorKind('empty');
        return;
      }

      setResults(data.stories);
      setStatus('success');
      setErrorKind(null);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      console.error('[useSearch] fetch failed', err);
      setStatus('error');
      setErrorKind('network');
    }
  }, []);

  // Debounce: wait 400ms after the user stops typing before firing. Keeps
  // us from spamming TheNewsAPI on every keystroke.
  useEffect(() => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      // Reset to idle state. We intentionally don't trigger an error for
      // an empty query — the UI just falls back to the top-stories view.
      setStatus('idle');
      setResults([]);
      setErrorKind(null);
      requestIdRef.current++; // cancel any in-flight request
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      doFetch(trimmed);
    }, 400);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, doFetch]);

  const setQuery = useCallback((q: string) => {
    setQueryState(q);
  }, []);

  const clear = useCallback(() => {
    setQueryState('');
  }, []);

  return { status, query, results, errorKind, setQuery, clear };
}
