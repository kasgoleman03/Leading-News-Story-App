import { useEffect, useRef } from 'react';
import type { BookmarkedStory } from '../hooks/useBookmarks';
import { timeAgo } from '../utils/timeAgo';

interface SavedStoriesPanelProps {
  open: boolean;
  bookmarks: BookmarkedStory[];
  onClose: () => void;
  onRemove: (uuid: string) => void;
}

/**
 * Modal panel listing every saved story. Slides in from the right on
 * desktop, takes over the full screen on mobile.
 *
 * Accessibility:
 *   - role="dialog" with aria-modal so screen readers announce it.
 *   - Closes on Esc and on backdrop click.
 *   - Returns focus to the trigger via the parent when it closes (the
 *     parent owns the open state and the badge stays mounted).
 *   - Focus-traps the close button on open so keyboard users land
 *     somewhere sensible.
 */
export function SavedStoriesPanel({
  open,
  bookmarks,
  onClose,
  onRemove,
}: SavedStoriesPanelProps) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Esc to close + focus the close button when opened.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    // Defer focus so the entrance animation can start first.
    const t = window.setTimeout(() => closeBtnRef.current?.focus(), 30);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
    };
  }, [open, onClose]);

  // Lock body scroll while the panel is open — otherwise the desktop
  // backdrop scrolls the page behind it.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="savedPanel__backdrop"
      onClick={onClose}
      role="presentation"
    >
      <aside
        className="savedPanel"
        role="dialog"
        aria-modal="true"
        aria-label="Saved stories"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="savedPanel__header">
          <div>
            <h2 className="savedPanel__title">Saved stories</h2>
            <p className="savedPanel__subtitle">
              {bookmarks.length === 0
                ? 'Nothing saved yet.'
                : `${bookmarks.length} ${bookmarks.length === 1 ? 'story' : 'stories'} ready to read.`}
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            className="savedPanel__close"
            onClick={onClose}
            aria-label="Close saved stories"
            title="Close (Esc)"
          >
            <XIcon />
          </button>
        </header>

        <div className="savedPanel__body">
          {bookmarks.length === 0 ? (
            <div className="savedPanel__empty">
              <div className="savedPanel__emptyEmoji" aria-hidden="true">
                🔖
              </div>
              <p className="savedPanel__emptyTitle">No bookmarks yet.</p>
              <p className="savedPanel__emptyBody">
                Hit the bookmark icon on any story to save it here. Your
                list lives in your browser — nothing leaves this device.
              </p>
            </div>
          ) : (
            <ul className="savedPanel__list">
              {bookmarks.map((b) => (
                <li key={b.uuid} className="savedItem">
                  <div className="savedItem__media">
                    {b.image_url ? (
                      <img
                        src={b.image_url}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display =
                            'none';
                        }}
                      />
                    ) : null}
                  </div>
                  <div className="savedItem__body">
                    <div className="savedItem__meta">
                      <span className="savedItem__source">
                        {prettySource(b.source)}
                      </span>
                      <span className="savedItem__saved">
                        Saved {timeAgo(b.saved_at, true)}
                      </span>
                    </div>
                    <h3 className="savedItem__title">
                      <a
                        href={b.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {b.title}
                      </a>
                    </h3>
                    {b.description ? (
                      <p className="savedItem__desc">{b.description}</p>
                    ) : null}
                    <div className="savedItem__actions">
                      <a
                        className="savedItem__cta"
                        href={b.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Read story <ArrowIcon />
                      </a>
                      <button
                        type="button"
                        className="savedItem__remove"
                        onClick={() => onRemove(b.uuid)}
                        aria-label={`Remove "${b.title}" from saved`}
                      >
                        <TrashIcon /> Remove
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

/** Same domain-to-label cleanup the NewsCard uses. Duplicated here on
 *  purpose — a single util would make sense if a 3rd call site appeared,
 *  but two is below that bar.
 */
function prettySource(raw: string): string {
  if (!raw) return 'Unknown';
  const noTld = raw.replace(/\.(com|org|net|co|co\.uk|io|news)$/i, '');
  return noTld
    .split(/[.\-_]/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(' ');
}

function XIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
