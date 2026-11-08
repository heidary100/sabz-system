'use client';

import { useSyncExternalStore } from 'react';
import {
  applyResolvedTheme,
  readStoredMode,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemeMode,
} from '@/lib/theme';

interface ThemeState {
  mode: ThemeMode;
  resolvedTheme: ResolvedTheme | null;
}

interface ThemeContextValue extends ThemeState {
  setMode: (mode: ThemeMode) => void;
}

const SERVER_STATE: ThemeState = { mode: 'system', resolvedTheme: null };

let state: ThemeState = SERVER_STATE;
let initialized = false;
const listeners = new Set<() => void>();
let media: MediaQueryList | null = null;

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false;
}

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function apply(next: ThemeState): void {
  state = next;
  if (next.resolvedTheme) {
    applyResolvedTheme(next.resolvedTheme);
  }
  emit();
}

function ensureInitialized(): void {
  if (initialized || typeof window === 'undefined') {
    return;
  }
  initialized = true;
  const mode = readStoredMode(window.localStorage);
  state = { mode, resolvedTheme: resolveTheme(mode, systemPrefersDark()) };
  // The boot script already painted this; re-applying keeps the meta tag and
  // color-scheme in sync if the document changed before hydration.
  if (state.resolvedTheme) {
    applyResolvedTheme(state.resolvedTheme);
  }
}

function onMediaChange(): void {
  if (state.mode !== 'system') {
    return;
  }
  const resolvedTheme = resolveTheme('system', systemPrefersDark());
  apply({ mode: 'system', resolvedTheme });
}

function onStorage(event: StorageEvent): void {
  if (event.key !== THEME_STORAGE_KEY) {
    return;
  }
  const mode = readStoredMode(window.localStorage);
  apply({ mode, resolvedTheme: resolveTheme(mode, systemPrefersDark()) });
}

function subscribe(listener: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }
  ensureInitialized();
  listeners.add(listener);
  if (!media) {
    media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', onMediaChange);
    window.addEventListener('storage', onStorage);
  }
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ThemeState {
  ensureInitialized();
  return state;
}

function getServerSnapshot(): ThemeState {
  return SERVER_STATE;
}

function setMode(mode: ThemeMode): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Storage can be unavailable (private mode); the in-memory choice still
    // applies for this document.
  }
  apply({ mode, resolvedTheme: resolveTheme(mode, systemPrefersDark()) });
}

/**
 * Theme runtime (Task 01). The blocking script in the root layout applies the
 * first paint; this provider only keeps the external theme store, persistence,
 * cross-tab sync and OS-preference changes in step. It renders no markup of
 * its own, so server-rendered pages are untouched.
 *
 * `useSyncExternalStore` avoids a setState-in-effect hydration pass and gives
 * React an explicit server snapshot (`system`, unresolved) for a warning-free
 * first render.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function useTheme(): ThemeContextValue {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  return { ...snapshot, setMode };
}
