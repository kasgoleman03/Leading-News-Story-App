import { useDarkMode } from '../hooks/useDarkMode';

/**
 * Pill-shaped dark mode toggle.
 *
 * Visually shifts between sun + "Light" and moon + "Dark" so the current
 * state is obvious without hovering. The label is hidden on narrow screens
 * — the icon alone is enough.
 */
export function DarkModeToggle() {
  const { isDark, toggle } = useDarkMode();

  return (
    <button
      type="button"
      className="toggle"
      onClick={toggle}
      aria-pressed={isDark}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <span className="toggle__icon" aria-hidden="true">
        {isDark ? <MoonIcon /> : <SunIcon />}
      </span>
      <span className="toggle__label">{isDark ? 'Dark' : 'Light'}</span>
    </button>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
