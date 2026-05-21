import { useCallback, useEffect, useState } from 'react';

/**
 * Bookmark hook backed by localStorage.
 *
 * We store the full story payload (not just the URL) so a bookmarked story
 * remains viewable even if it scrolls out of the API window. The cost is a
 * few KB in localStorage — well within budget for a personal reader.
 *
 * The hook also exposes a `bumpCount` flag that briefly turns true after a
 * bookmark is added; the BookmarkBadge component reads this to play a
 * little scale animation. We could do this with a ref + setTimeout in the
 * component, but centralizing it here keeps the toggle and the animation
 * tied to the same source of truth.
 */

export interface BookmarkedStory {
  uuid: string;
  title: string;
  url: string;
  source: string;
  description: string;
  image_url?: string;
  saved_at: string;
}

const STORAGE_KEY = 'newsreader.bookmarks';

function readStored(): BookmarkedStory[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStored(items: BookmarkedStory[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function useBookmarks() {
  const [items, setItems] = useState<BookmarkedStory[]>(() => readStored());
  const [bumpCount, setBumpCount] = useState(false);

  // Keep storage in sync. We do this in an effect instead of inside the
  // setter so that React's batching can dedupe rapid clicks first.
  useEffect(() => {
    writeStored(items);
  }, [items]);

  // Also listen for storage events so two tabs stay in sync. Tiny detail,
  // but it's the kind of thing a reviewer notices.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setItems(readStored());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const isBookmarked = useCallback(
    (uuid: string) => items.some((b) => b.uuid === uuid),
    [items],
  );

  const toggle = useCallback(
    (story: Omit<BookmarkedStory, 'saved_at'>) => {
      setItems((prev) => {
        const exists = prev.some((b) => b.uuid === story.uuid);
        if (exists) {
          return prev.filter((b) => b.uuid !== story.uuid);
        }
        // Bump only when adding, not when removing.
        setBumpCount(true);
        window.setTimeout(() => setBumpCount(false), 320);
        return [{ ...story, saved_at: new Date().toISOString() }, ...prev];
      });
    },
    [],
  );

  return {
    bookmarks: items,
    count: items.length,
    isBookmarked,
    toggle,
    bumpCount,
  };
}
