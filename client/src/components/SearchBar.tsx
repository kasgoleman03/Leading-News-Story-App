import { useEffect, useRef } from 'react';

interface SearchBarProps {
  value: string;
  onChange: (v: string) => void;
  onClear: () => void;
  isSearching: boolean;
}

/**
 * Search input that lives between the header and the meta row.
 *
 * Keyboard:
 *   - `/` from anywhere on the page focuses the input (classic UX cue;
 *     same shortcut as GitHub, Slack, Discord, etc.)
 *   - `Esc` while focused clears the query and blurs.
 *
 * The clear (X) button only appears once there's a value.
 */
export function SearchBar({
  value,
  onChange,
  onClear,
  isSearching,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Global "/" shortcut to focus the search box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/') return;
      const target = e.target as HTMLElement | null;
      // Don't hijack the key if the user is already typing in something.
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="searchBar" role="search">
      <span className="searchBar__icon" aria-hidden="true">
        {isSearching ? <SpinnerIcon /> : <SearchIcon />}
      </span>
      <input
        ref={inputRef}
        type="search"
        className="searchBar__input"
        placeholder="Search the news — try 'AI', 'climate', 'markets'…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClear();
            inputRef.current?.blur();
          }
        }}
        aria-label="Search news stories"
        autoComplete="off"
        spellCheck={false}
      />
      {value ? (
        <button
          type="button"
          className="searchBar__clear"
          onClick={onClear}
          aria-label="Clear search"
          title="Clear (Esc)"
        >
          <XIcon />
        </button>
      ) : (
        <kbd className="searchBar__kbd" aria-hidden="true">
          /
        </kbd>
      )}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 0.8s linear infinite' }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
