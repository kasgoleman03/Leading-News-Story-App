interface BookmarkBadgeProps {
  count: number;
  bump: boolean;
  onClick: () => void;
}

/**
 * Clickable badge that opens the saved-stories panel.
 *
 * Bumps when a new bookmark is added (state lives in useBookmarks). Even
 * at zero we keep the badge visible so the affordance is discoverable —
 * empty states are part of teaching the user the feature exists.
 */
export function BookmarkBadge({ count, bump, onClick }: BookmarkBadgeProps) {
  return (
    <button
      type="button"
      className="bookmarkBadge bookmarkBadge--button"
      onClick={onClick}
      title={`${count} saved ${count === 1 ? 'story' : 'stories'} — click to view`}
      aria-label={`View ${count} saved ${count === 1 ? 'story' : 'stories'}`}
    >
      <BookmarkIcon />
      <span
        className={
          'bookmarkBadge__count' +
          (bump ? ' bookmarkBadge__count--bump' : '')
        }
        aria-live="polite"
      >
        {count}
      </span>
    </button>
  );
}

function BookmarkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}
