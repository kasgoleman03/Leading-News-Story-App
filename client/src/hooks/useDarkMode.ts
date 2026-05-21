import { useCallback, useEffect, useState } from 'react';

/**
 * Dark-mode hook with three states under the hood:
 *
 *   - "system" — follow prefers-color-scheme. The default for a brand-new user.
 *   - "dark" / "light" — explicit user override. Persists to localStorage.
 *
 * We surface only a boolean `isDark` plus a `toggle()` to the UI so the
 * toggle button stays simple. Toggling from system always lands on an
 * explicit override (the opposite of whatever the system currently shows).
 *
 * The theme is applied by setting `data-theme="dark"` or removing the
 * attribute entirely (for system follow). variables.css uses both signals.
 */

type Mode = 'system' | 'light' | 'dark';
const STORAGE_KEY = 'newsreader.theme';

function readStoredMode(): Mode {
  if (typeof window === 'undefined') return 'system';
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyMode(mode: Mode) {
  const html = document.documentElement;
  if (mode === 'system') {
    html.removeAttribute('data-theme');
  } else {
    html.setAttribute('data-theme', mode);
  }
}

export function useDarkMode(): {
  isDark: boolean;
  toggle: () => void;
  mode: Mode;
} {
  const [mode, setMode] = useState<Mode>(() => readStoredMode());
  const [systemDark, setSystemDark] = useState<boolean>(() =>
    systemPrefersDark(),
  );

  // Apply on mount + whenever mode changes.
  useEffect(() => {
    applyMode(mode);
    if (mode === 'system') {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, mode);
    }
  }, [mode]);

  // Track system preference changes so the "system" mode reacts live.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const isDark = mode === 'dark' || (mode === 'system' && systemDark);

  const toggle = useCallback(() => {
    // Always move to an explicit override on toggle. We never toggle BACK to
    // system — that's an intentional product call: once a user has expressed
    // a preference, we honor it until they clear storage.
    setMode(isDark ? 'light' : 'dark');
  }, [isDark]);

  return { isDark, toggle, mode };
}
