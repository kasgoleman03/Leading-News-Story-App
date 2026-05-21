/**
 * Convert an absolute timestamp into a contextual "X ago" string.
 *
 * Used for both the per-story published-at line and the "Last updated"
 * indicator at the top. We deliberately don't use Intl.RelativeTimeFormat
 * directly because we want our own thresholds (e.g. "just now" for < 30s,
 * "yesterday" for a full day) and short labels ("3m" instead of "3 minutes").
 *
 * The `verbose` flag controls whether we return short labels ("3m ago") or
 * long ones ("3 minutes ago") — the header uses long, the cards use short.
 */
export function timeAgo(input: Date | string, verbose = false): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) {
    return 'recently';
  }

  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));

  if (seconds < 30) return verbose ? 'just now' : 'now';
  if (seconds < 60) {
    return verbose ? `${seconds} seconds ago` : `${seconds}s ago`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return verbose
      ? `${minutes} minute${minutes === 1 ? '' : 's'} ago`
      : `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return verbose
      ? `${hours} hour${hours === 1 ? '' : 's'} ago`
      : `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  if (days === 1) return verbose ? 'yesterday' : '1d ago';
  if (days < 7) return verbose ? `${days} days ago` : `${days}d ago`;

  // Beyond a week we just show the date — relative no longer feels useful.
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}
