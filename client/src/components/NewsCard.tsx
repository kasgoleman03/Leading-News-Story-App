import { useState } from 'react';
import type { Story } from '../hooks/useFetchNews';
import {
  estimateReadingTime,
  formatReadingTime,
} from '../utils/readingTime';
import { timeAgo } from '../utils/timeAgo';
import { shareStory } from '../utils/shareStory';

interface NewsCardProps {
  story: Story;
  index: number;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  /**
   * Whether to show the "Story of the Hour" badge. Computed in App based on
   * viewport (only mobile) and the story_of_hour flag from the scorer.
   */
  showStoryOfHourBadge: boolean;
}

export function NewsCard({
  story,
  index,
  isBookmarked,
  onToggleBookmark,
  showStoryOfHourBadge,
}: NewsCardProps) {
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'failed'>(
    'idle',
  );

  const readingTime = estimateReadingTime(story.description, story.snippet);
  const publishedLabel = timeAgo(story.published_at);

  const handleShare = async () => {
    const ok = await shareStory({
      title: story.title,
      url: story.url,
      source: prettySource(story.source),
    });
    setShareState(ok ? 'copied' : 'failed');
    window.setTimeout(() => setShareState('idle'), 1800);
  };

  // Each card slides in slightly after the previous one for a subtle
  // cascade effect. We cap the delay so the user isn't waiting on it.
  const cardStyle = {
    animationDelay: `${Math.min(index, 5) * 80}ms`,
  };

  return (
    <article className="card" style={cardStyle}>
      <div className="card__media">
        {story.image_url ? (
          <img
            src={story.image_url}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={(e) => {
              // If the publisher's image 404s, hide the broken icon so we
              // fall back to the gradient background.
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : null}
        {showStoryOfHourBadge ? (
          <span className="card__badge">Story of the Hour</span>
        ) : null}
      </div>

      <div className="card__body">
        <div className="card__sourceRow">
          <span className="card__source">{prettySource(story.source)}</span>
          <span className="card__readTime">
            <ClockIcon /> {formatReadingTime(readingTime)}
          </span>
        </div>

        <h2 className="card__title">
          <a href={story.url} target="_blank" rel="noopener noreferrer">
            {story.title}
          </a>
        </h2>

        {story.description ? (
          <p className="card__desc">{story.description}</p>
        ) : null}

        {story.why_this_story ? (
          <div className="card__why">
            <strong>Why this story</strong>
            {story.why_this_story}
          </div>
        ) : null}

        <div className="card__actions">
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              type="button"
              className={
                'iconBtn' + (isBookmarked ? ' iconBtn--active' : '')
              }
              onClick={onToggleBookmark}
              aria-pressed={isBookmarked}
              aria-label={isBookmarked ? 'Remove bookmark' : 'Save for later'}
              title={isBookmarked ? 'Remove bookmark' : 'Save for later'}
            >
              <BookmarkIcon filled={isBookmarked} />
              <span>{isBookmarked ? 'Saved' : 'Save'}</span>
            </button>

            <button
              type="button"
              className={
                'iconBtn' +
                (shareState === 'copied' ? ' iconBtn--toast' : '')
              }
              onClick={handleShare}
              aria-label="Copy a share-ready link to clipboard"
              title="Copy share link"
            >
              {shareState === 'copied' ? <CheckIcon /> : <ShareIcon />}
              <span>
                {shareState === 'copied'
                  ? 'Copied!'
                  : shareState === 'failed'
                    ? 'Try again'
                    : 'Share'}
              </span>
            </button>
          </div>

          <span
            className="card__readTime"
            title={new Date(story.published_at).toLocaleString()}
          >
            {publishedLabel}
          </span>
        </div>
      </div>
    </article>
  );
}

/**
 * TheNewsAPI returns sources as domains ("nytimes.com"). Stripping the TLD
 * and capitalizing the leading word gives a much nicer label without us
 * needing a lookup table for every outlet.
 */
function prettySource(raw: string): string {
  if (!raw) return 'Unknown';
  // Drop common TLDs.
  const noTld = raw.replace(/\.(com|org|net|co|co\.uk|io|news)$/i, '');
  // Replace separators and capitalize first letter of each word.
  return noTld
    .split(/[.\-_]/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(' ');
}

/* ---- inline icons (tiny, dependency-free) ---- */

function ClockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
