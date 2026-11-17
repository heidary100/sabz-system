/**
 * Storefront theme contract (Task 01).
 *
 * Pure helpers only — no browser access at module scope. The same rules are
 * duplicated in the tiny boot script below so the first paint matches the
 * provider after hydration.
 */

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'sabz-theme';

export const THEME_COLORS: Record<ResolvedTheme, string> = {
  light: '#f8f7f5',
  dark: '#151814',
};

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

/** Invalid or missing storage always falls back to the system preference. */
export function readStoredMode(
  storage: Pick<Storage, 'getItem'> | null | undefined,
): ThemeMode {
  if (!storage) {
    return 'system';
  }
  try {
    const value = storage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(value) ? value : 'system';
  } catch {
    return 'system';
  }
}

export function resolveTheme(
  mode: ThemeMode,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (mode === 'light' || mode === 'dark') {
    return mode;
  }
  return systemPrefersDark ? 'dark' : 'light';
}

/** Applies the resolved theme to the document. Safe to call only in a browser. */
export function applyResolvedTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  document
    .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    .forEach((meta) => meta.setAttribute('content', THEME_COLORS[resolved]));
}

/**
 * Blocking boot script rendered at the top of <body>. It runs before page
 * content paints, so there is no flash of the wrong theme. It intentionally
 * does not rely on React or a timeout.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var k=${JSON.stringify(
  THEME_STORAGE_KEY,
)};var s=localStorage.getItem(k);var m=window.matchMedia('(prefers-color-scheme: dark)').matches;var t=(s==='light'||s==='dark')?s:(m?'dark':'light');document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;var es=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<es.length;i++)es[i].setAttribute('content',t==='dark'?'${THEME_COLORS.dark}':'${THEME_COLORS.light}');}catch(_){document.documentElement.dataset.theme='light';document.documentElement.style.colorScheme='light';}})();`;
