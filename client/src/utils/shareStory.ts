/**
 * Share a story by copying a pre-written sentence + URL to the clipboard.
 *
 * Why pre-written copy:
 *   The spec calls for "a short contextual sentence" alongside the link so
 *   when someone pastes it into Slack/iMessage/X, it reads like a real
 *   recommendation, not a naked URL.
 *
 * Why clipboard (and not navigator.share):
 *   navigator.share is great on mobile but inconsistent across desktop
 *   browsers and often unavailable in non-HTTPS contexts (i.e. localhost
 *   dev). Clipboard is universal and predictable. We could feature-detect
 *   and use both, but for the demo the clipboard path is the more
 *   demo-able interaction anyway (visible toast confirmation).
 */
export interface ShareableStory {
  title: string;
  url: string;
  source?: string;
}

export async function shareStory(story: ShareableStory): Promise<boolean> {
  const sentence = buildShareSentence(story);
  const payload = `${sentence}\n${story.url}`;

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(payload);
      return true;
    }

    // Fallback for non-secure contexts (rare in modern dev, but keep it
    // working in case someone runs over plain HTTP on a LAN demo).
    const textarea = document.createElement('textarea');
    textarea.value = payload;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch (err) {
    console.error('[shareStory] copy failed', err);
    return false;
  }
}

/**
 * Build the contextual sentence that precedes the URL. We rotate through a
 * few phrasings so a user sharing multiple stories in a row doesn't paste
 * the identical "Worth a read:" prefix every time.
 */
function buildShareSentence(story: ShareableStory): string {
  const source = (story.source || '').trim();
  const title = story.title.trim().replace(/\s+/g, ' ');

  const variants = source
    ? [
        `Worth your morning — ${source} on “${title}”.`,
        `Saw this in my Daily Brief: ${source} — “${title}”.`,
        `If you're catching up today, start with this from ${source}: “${title}”.`,
      ]
    : [
        `Worth your morning — “${title}”.`,
        `Saw this in my Daily Brief: “${title}”.`,
        `Catching up on today? Start with “${title}”.`,
      ];

  // Pick a variant deterministically from the title so the same story
  // always copies the same sentence (better UX — predictable).
  const idx =
    Math.abs(
      Array.from(title).reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0),
    ) % variants.length;
  return variants[idx];
}
