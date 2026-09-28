'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  COMPARE_MAX_ITEMS,
  isCompared,
  loadCompareList,
  parseCompareList,
  removeCompareEntry,
  saveCompareList,
  toggleCompareList,
  type CompareEntry,
} from '@/lib/compare';

interface CompareContextValue {
  /** False until the first post-hydration load (storage is client-only). */
  ready: boolean;
  entries: CompareEntry[];
  /** Badge count: number of products in the compare list. */
  count: number;
  maxItems: number;
  isCompared: (productId: string) => boolean;
  /**
   * Toggles a product. Resolves false when the list is full and the product
   * is not already in it — callers render the Persian full-notice.
   */
  toggle: (entry: CompareEntry) => boolean;
  remove: (productId: string) => void;
  /** Replaces the list (shared-link adoption); capped and validated. */
  replace: (entries: CompareEntry[]) => void;
  clear: () => void;
}

const CompareContext = createContext<CompareContextValue | null>(null);

/**
 * Compare store (SS-237): the single client owner of the compare list.
 * Guest-friendly local state — no backend model, no auth. Entries carry
 * `{ id, slug }` only; prices and specs always come from the server-rendered
 * catalog DTOs on `/compare`, never from storage.
 */
export function CompareProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<CompareEntry[] | null>(null);

  // Storage lives in localStorage (client only): the load below must run
  // post-hydration. Intentional external sync, not derived state.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEntries(loadCompareList());
  }, []);

  const persist = useCallback((next: CompareEntry[]) => {
    setEntries(next);
    saveCompareList(next);
  }, []);

  const toggle = useCallback(
    (entry: CompareEntry): boolean => {
      // Computed from state (not a functional updater): updaters run on the
      // next render, so a `blocked` flag set inside one is unreadable here.
      // Toggles only fire from user gestures, always post-hydration.
      const base = entries ?? loadCompareList();
      const result = toggleCompareList(base, entry);
      if ('full' in result && result.full === true) {
        return false;
      }
      persist(result.entries);
      return true;
    },
    [entries, persist],
  );

  const remove = useCallback(
    (productId: string) => {
      persist(removeCompareEntry(entries ?? loadCompareList(), productId));
    },
    [entries, persist],
  );

  const replace = useCallback(
    (next: CompareEntry[]) => {
      // Reuse the parser as a validator: dedupes, drops invalid rows,
      // and enforces the 4-slot cap even for shared-link input.
      persist(parseCompareList(next));
    },
    [persist],
  );

  const clear = useCallback(() => {
    persist([]);
  }, [persist]);

  const isComparedCallback = useCallback(
    (productId: string): boolean => {
      if (entries === null) {
        return false;
      }
      return isCompared(entries, productId);
    },
    [entries],
  );

  const value = useMemo<CompareContextValue>(() => {
    const current = entries ?? [];
    return {
      ready: entries !== null,
      entries: current,
      count: current.length,
      maxItems: COMPARE_MAX_ITEMS,
      isCompared: isComparedCallback,
      toggle,
      remove,
      replace,
      clear,
    };
  }, [entries, isComparedCallback, toggle, remove, replace, clear]);

  return (
    <CompareContext.Provider value={value}>
      {children}
    </CompareContext.Provider>
  );
}

/** Reads the compare store; must be used under `CompareProvider`. */
export function useCompare(): CompareContextValue {
  const context = useContext(CompareContext);
  if (!context) {
    throw new Error('useCompare must be used within CompareProvider');
  }
  return context;
}
