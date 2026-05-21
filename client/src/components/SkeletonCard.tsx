/**
 * Skeleton placeholder used while stories are loading.
 *
 * Critical constraint: this MUST match NewsCard's layout pixel-for-pixel so
 * when real content arrives there's no layout shift. That's why we mirror
 * the same outer container (`.card`-equivalent) plus the same 16:9 media
 * box, source row, title block, description block, and action row.
 */
export function SkeletonCard() {
  return (
    <article className="skeleton" aria-hidden="true">
      <div className="skeleton__media shimmer" />
      <div className="skeleton__body">
        <div className="shimmer shimmer--line shimmer--w40" />
        <div className="shimmer shimmer--lineLg shimmer--w80" />
        <div className="shimmer shimmer--lineLg shimmer--w60" />
        <div className="shimmer shimmer--line" />
        <div className="shimmer shimmer--line shimmer--w80" />
        <div className="shimmer shimmer--line shimmer--w60" />
        <div style={{ height: 8 }} />
        <div className="shimmer shimmer--line shimmer--w40" />
      </div>
    </article>
  );
}
