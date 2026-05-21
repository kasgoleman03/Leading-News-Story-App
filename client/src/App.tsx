import { useEffect, useRef, useState } from 'react';
import { CategoryFilter } from './components/CategoryFilter';
import { NewsCard } from './components/NewsCard';
import { SkeletonCard } from './components/SkeletonCard';
import { DarkModeToggle } from './components/DarkModeToggle';
import { BookmarkBadge } from './components/BookmarkBadge';
import { SearchBar } from './components/SearchBar';
import { SavedStoriesPanel } from './components/SavedStoriesPanel';
import { useFetchNews, type Story } from './hooks/useFetchNews';
import { useBookmarks } from './hooks/useBookmarks';
import { useSearch } from './hooks/useSearch';
import { timeAgo } from './utils/timeAgo';

/**
 * Top-level layout and view-mode coordinator.
 *
 * View modes:
 *   - "top" — daily briefing: 3 ranked stories driven by category filter.
 *   - "search" — query results: up to 9 ranked stories from /api/search.
 *
 * The active mode is implicit: if there's a non-empty search query, we
 * render search results; otherwise we render the top-stories view. The
 * top-stories state stays cached the whole time, so clearing the query
 * returns instantly to whatever the user was reading.
 */
export default function App() {
  const top = useFetchNews('all');
  const search = useSearch();
  const bookmarks = useBookmarks();
  const isMobile = useIsMobile();

  const [savedOpen, setSavedOpen] = useState(false);
  const isSearching = search.query.trim().length >= 2;

  // Re-render every 30s so the "Last updated X ago" line stays accurate.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const onToggleBookmark = (s: Story) =>
    bookmarks.toggle({
      uuid: s.uuid,
      title: s.title,
      url: s.url,
      source: s.source,
      description: s.description,
      image_url: s.image_url,
    });

  return (
    <div className="app">
      <div className="app__inner">
        <Header
          bookmarkCount={bookmarks.count}
          bumpCount={bookmarks.bumpCount}
          onOpenSaved={() => setSavedOpen(true)}
        />

        <SearchBar
          value={search.query}
          onChange={search.setQuery}
          onClear={search.clear}
          isSearching={search.status === 'loading'}
        />

        {isSearching ? (
          <SearchStatusBar
            query={search.query}
            count={search.results.length}
            status={search.status}
            onClear={search.clear}
          />
        ) : (
          <>
            <MetaRow
              status={top.status}
              generatedAt={top.generatedAt}
              onRefresh={top.refresh}
            />
            <CategoryFilter active={top.category} onChange={top.setCategory} />
          </>
        )}

        {isSearching ? (
          <SearchResultsView
            status={search.status}
            stories={search.results}
            errorKind={search.errorKind}
            isBookmarked={bookmarks.isBookmarked}
            onToggleBookmark={onToggleBookmark}
            onClear={search.clear}
          />
        ) : (
          <StoriesView
            status={top.status}
            stories={top.stories}
            errorKind={top.errorKind}
            isMobile={isMobile}
            isBookmarked={bookmarks.isBookmarked}
            onToggleBookmark={onToggleBookmark}
            onRefresh={top.refresh}
          />
        )}

        <Footer />
      </div>

      <SavedStoriesPanel
        open={savedOpen}
        bookmarks={bookmarks.bookmarks}
        onClose={() => setSavedOpen(false)}
        onRemove={(uuid) => {
          const item = bookmarks.bookmarks.find((b) => b.uuid === uuid);
          if (item) {
            // toggle() removes when already present
            bookmarks.toggle({
              uuid: item.uuid,
              title: item.title,
              url: item.url,
              source: item.source,
              description: item.description,
              image_url: item.image_url,
            });
          }
        }}
      />
    </div>
  );
}

/* =============================================================
 * Header
 * ============================================================= */

function Header({
  bookmarkCount,
  bumpCount,
  onOpenSaved,
}: {
  bookmarkCount: number;
  bumpCount: boolean;
  onOpenSaved: () => void;
}) {
  return (
    <header className="header">
      <div className="header__brand">
        <span className="header__eyebrow">
          {new Date().toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
        </span>
        <h1 className="header__title">Daily Brief</h1>
      </div>
      <div className="header__controls">
        <BookmarkBadge
          count={bookmarkCount}
          bump={bumpCount}
          onClick={onOpenSaved}
        />
        <DarkModeToggle />
      </div>
    </header>
  );
}

/* =============================================================
 * Meta row (top-stories mode only)
 * ============================================================= */

function MetaRow({
  status,
  generatedAt,
  onRefresh,
}: {
  status: ReturnType<typeof useFetchNews>['status'];
  generatedAt: Date | null;
  onRefresh: () => void;
}) {
  const isLoading = status === 'loading';
  const label = generatedAt
    ? `Last updated ${timeAgo(generatedAt, true)}`
    : isLoading
      ? 'Fetching today’s headlines…'
      : 'Awaiting first fetch';

  return (
    <div className="metaRow">
      <div className="metaRow__left">
        <span className="metaRow__dot" aria-hidden="true" />
        <span>{label}</span>
      </div>
      <button
        type="button"
        className={'refreshBtn' + (isLoading ? ' refreshBtn--spinning' : '')}
        onClick={onRefresh}
        disabled={isLoading}
        aria-label="Refresh stories"
      >
        <RefreshIcon />
        <span>Refresh</span>
      </button>
    </div>
  );
}

/* =============================================================
 * Search status bar (search mode only)
 * ============================================================= */

function SearchStatusBar({
  query,
  count,
  status,
  onClear,
}: {
  query: string;
  count: number;
  status: ReturnType<typeof useSearch>['status'];
  onClear: () => void;
}) {
  const label =
    status === 'loading'
      ? `Searching for “${query}”…`
      : status === 'success'
        ? `${count} ${count === 1 ? 'result' : 'results'} for “${query}”`
        : status === 'error'
          ? `Search ran into trouble`
          : `Searching for “${query}”`;

  return (
    <div className="metaRow">
      <div className="metaRow__left">
        <span className="metaRow__dot" aria-hidden="true" />
        <span>{label}</span>
      </div>
      <button
        type="button"
        className="refreshBtn"
        onClick={onClear}
        aria-label="Clear search and return to top stories"
      >
        <BackIcon />
        <span>Back to top stories</span>
      </button>
    </div>
  );
}

/* =============================================================
 * Top-stories view (4 render states + mobile swiper)
 * ============================================================= */

function StoriesView({
  status,
  stories,
  errorKind,
  isMobile,
  isBookmarked,
  onToggleBookmark,
  onRefresh,
}: {
  status: ReturnType<typeof useFetchNews>['status'];
  stories: Story[];
  errorKind: ReturnType<typeof useFetchNews>['errorKind'];
  isMobile: boolean;
  isBookmarked: (uuid: string) => boolean;
  onToggleBookmark: (s: Story) => void;
  onRefresh: () => void;
}) {
  if (status === 'loading' && stories.length === 0) {
    return (
      <div className="grid">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="grid">
        <ErrorState kind={errorKind ?? 'server'} onRetry={onRefresh} />
      </div>
    );
  }

  if (status === 'success' && stories.length === 0) {
    return (
      <div className="grid">
        <EmptyState onRetry={onRefresh} />
      </div>
    );
  }

  if (isMobile) {
    return (
      <MobileSwiper
        stories={stories}
        isBookmarked={isBookmarked}
        onToggleBookmark={onToggleBookmark}
      />
    );
  }

  return (
    <div className="grid">
      {stories.map((s, i) => (
        <NewsCard
          key={s.uuid + i}
          story={s}
          index={i}
          isBookmarked={isBookmarked(s.uuid)}
          onToggleBookmark={() => onToggleBookmark(s)}
          showStoryOfHourBadge={false}
        />
      ))}
    </div>
  );
}

/* =============================================================
 * Search results view (always a flexible grid — no mobile swiper here,
 * because a 9-card swiper would feel like a slot machine).
 * ============================================================= */

function SearchResultsView({
  status,
  stories,
  errorKind,
  isBookmarked,
  onToggleBookmark,
  onClear,
}: {
  status: ReturnType<typeof useSearch>['status'];
  stories: Story[];
  errorKind: ReturnType<typeof useSearch>['errorKind'];
  isBookmarked: (uuid: string) => boolean;
  onToggleBookmark: (s: Story) => void;
  onClear: () => void;
}) {
  if (status === 'loading' && stories.length === 0) {
    return (
      <div className="grid">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (status === 'error') {
    const kind = errorKind === 'too_short' ? 'too_short' : 'server';
    return (
      <div className="grid">
        <ErrorState kind={kind} onRetry={onClear} retryLabel="Clear search" />
      </div>
    );
  }

  if (status === 'success' && stories.length === 0) {
    return (
      <div className="grid">
        <NoResultsState onClear={onClear} />
      </div>
    );
  }

  return (
    <div className="grid grid--flex">
      {stories.map((s, i) => (
        <NewsCard
          key={s.uuid + i}
          story={s}
          index={i}
          isBookmarked={isBookmarked(s.uuid)}
          onToggleBookmark={() => onToggleBookmark(s)}
          showStoryOfHourBadge={false}
        />
      ))}
    </div>
  );
}

/* =============================================================
 * Mobile swiper (scroll-snap carousel)
 * ============================================================= */

function MobileSwiper({
  stories,
  isBookmarked,
  onToggleBookmark,
}: {
  stories: Story[];
  isBookmarked: (uuid: string) => boolean;
  onToggleBookmark: (s: Story) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        const center = track.scrollLeft + track.clientWidth / 2;
        const slides = Array.from(
          track.querySelectorAll('.swiper__slide'),
        ) as HTMLElement[];
        let best = 0;
        let bestDist = Infinity;
        slides.forEach((el, i) => {
          const elCenter = el.offsetLeft + el.offsetWidth / 2;
          const dist = Math.abs(elCenter - center);
          if (dist < bestDist) {
            bestDist = dist;
            best = i;
          }
        });
        setActiveIdx(best);
      });
    };
    track.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      track.removeEventListener('scroll', onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [stories.length]);

  return (
    <div className="swiper" aria-roledescription="carousel">
      <div className="swiper__track" ref={trackRef}>
        {stories.map((s, i) => (
          <div className="swiper__slide" key={s.uuid + i}>
            <NewsCard
              story={s}
              index={i}
              isBookmarked={isBookmarked(s.uuid)}
              onToggleBookmark={() => onToggleBookmark(s)}
              showStoryOfHourBadge={s.story_of_hour}
            />
          </div>
        ))}
      </div>
      <div className="swiper__dots" role="tablist" aria-label="Story navigation">
        {stories.map((_, i) => (
          <span
            key={i}
            className={
              'swiper__dot' + (i === activeIdx ? ' swiper__dot--active' : '')
            }
            role="tab"
            aria-selected={i === activeIdx}
          />
        ))}
      </div>
    </div>
  );
}

/* =============================================================
 * Empty / error states
 * ============================================================= */

type StateKind = 'network' | 'empty' | 'server' | 'too_short';

function ErrorState({
  kind,
  onRetry,
  retryLabel = 'Try again',
}: {
  kind: StateKind;
  onRetry: () => void;
  retryLabel?: string;
}) {
  const copy = COPY[kind] ?? COPY.server;
  return (
    <div className="state">
      <div className="state__emoji" aria-hidden="true">
        {copy.emoji}
      </div>
      <h3 className="state__title">{copy.title}</h3>
      <p className="state__body">{copy.body}</p>
      <div className="state__action">
        <button type="button" className="refreshBtn" onClick={onRetry}>
          <RefreshIcon /> {retryLabel}
        </button>
      </div>
    </div>
  );
}

function EmptyState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="state">
      <div className="state__emoji" aria-hidden="true">☕</div>
      <h3 className="state__title">Quiet morning in this beat.</h3>
      <p className="state__body">
        The wire is unusually still for this category. Try another filter, or
        check back in an hour — newsrooms wake up at different times.
      </p>
      <div className="state__action">
        <button type="button" className="refreshBtn" onClick={onRetry}>
          <RefreshIcon /> Refresh
        </button>
      </div>
    </div>
  );
}

function NoResultsState({ onClear }: { onClear: () => void }) {
  return (
    <div className="state">
      <div className="state__emoji" aria-hidden="true">🔎</div>
      <h3 className="state__title">Nothing matched that one.</h3>
      <p className="state__body">
        No stories came back for that query. Try fewer or broader keywords —
        “OpenAI” will hit more than “OpenAI Q3 2026 board meeting”.
      </p>
      <div className="state__action">
        <button type="button" className="refreshBtn" onClick={onClear}>
          <BackIcon /> Back to top stories
        </button>
      </div>
    </div>
  );
}

const COPY: Record<StateKind, { emoji: string; title: string; body: string }> = {
  network: {
    emoji: '📡',
    title: 'We couldn’t reach the newsroom.',
    body:
      'Looks like your connection dropped, or the proxy is taking a coffee break. Check your network and give it another try.',
  },
  server: {
    emoji: '🛠️',
    title: 'The press deck is jammed.',
    body:
      'Something went sideways on the server. The team has been alerted by the logs — try again in a moment.',
  },
  empty: {
    emoji: '🌅',
    title: 'Nothing to brief on yet.',
    body:
      'No stories matched the filter. Try a different category or refresh in a few minutes.',
  },
  too_short: {
    emoji: '✍️',
    title: 'Give us a couple more letters.',
    body:
      'Type at least two characters and we’ll go look. Short queries return everything and nothing at the same time.',
  },
};

/* =============================================================
 * Footer
 * ============================================================= */

function Footer() {
  return (
    <footer className="footer">
      <span>
        Curated daily. Top 3 are ranked by recency, source diversity, and
        impact — not raw API order.
      </span>
      <span>
        Powered by TheNewsAPI · Built with React, Express, and Go
      </span>
    </footer>
  );
}

/* =============================================================
 * Icons & helpers
 * ============================================================= */

function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function useIsMobile(): boolean {
  const query = '(max-width: 900px)';
  const [match, setMatch] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatch(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return match;
}
