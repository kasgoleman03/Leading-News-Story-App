/**
 * Estimate how long a story will take to read.
 *
 * For a news brief we only have the description/snippet from the API, not
 * the full article. So we approximate by:
 *
 *   1. Counting words across all available text fields.
 *   2. Multiplying by an inflation factor — the description is usually
 *      ~5-10% of the actual article length. We use 8x as a conservative
 *      middle ground.
 *   3. Dividing by an average adult reading speed of 230 words/minute.
 *   4. Flooring to at least 1 minute so we never show "0 min read".
 *
 * The point isn't to be precise — it's to give the user a sense of
 * commitment. "1 min read" vs "5 min read" tells them whether to click now
 * or save for later.
 */
export function estimateReadingTime(
  description: string | null | undefined,
  snippet?: string | null,
): number {
  const text = [description ?? '', snippet ?? ''].join(' ').trim();
  if (!text) return 1;

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const estimatedFullArticleWords = wordCount * 8;
  const wordsPerMinute = 230;

  const minutes = Math.round(estimatedFullArticleWords / wordsPerMinute);
  return Math.max(1, minutes);
}

/**
 * Format the minute count for display next to a clock icon, e.g. "3 min read".
 */
export function formatReadingTime(minutes: number): string {
  return `${minutes} min read`;
}
