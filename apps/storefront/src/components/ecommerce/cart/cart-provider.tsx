'use client';

import { usePathname, useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CartItemDto } from '@sabz/types';
import { ApiError } from '@/lib/api';
import {
  addGuestLine,
  addToCart,
  cartStockError,
  clearCart,
  fetchCart,
  guestCount,
  isCartAuthed,
  loadGuestCart,
  mergeGuestCart,
  removeCartItem,
  removeGuestLine,
  saveGuestCart,
  setGuestQuantity,
  updateCartItemQty,
  type CartAddInput,
  type GuestCartLine,
  type MergeResult,
} from '@/lib/cart';

export interface CartActionError {
  message: string;
  available: number | null;
}

export type CartActionResult =
  | { ok: true }
  | { ok: false; error: CartActionError };

interface CartSnapshot {
  authed: boolean;
  items: CartItemDto[];
  totalQuantity: number;
  subtotal: string;
  guestLines: GuestCartLine[];
}

interface CartContextValue extends CartSnapshot {
  /** False until the first post-hydration load (storage is client-only). */
  ready: boolean;
  /** Badge count: server total when authed, guest sum otherwise (honest). */
  count: number;
  miniCartOpen: boolean;
  setMiniCartOpen: (open: boolean) => void;
  /** Last guest→server merge outcome (merge notice + failures), if any. */
  lastMerge: MergeResult | null;
  clearMerge: () => void;
  refresh: () => Promise<void>;
  add: (identity: CartAddInput, quantity?: number) => Promise<CartActionResult>;
  setQuantity: (variantId: string, quantity: number) => Promise<CartActionResult>;
  removeLine: (variantId: string) => Promise<void>;
  clear: () => Promise<void>;
}

const CartContext = createContext<CartContextValue | null>(null);

function guestSnapshot(): CartSnapshot {
  const guestLines = loadGuestCart();
  return { authed: false, items: [], totalQuantity: 0, subtotal: '0', guestLines };
}

/**
 * Cart store (SS-232): the single client owner of cart state. Logged-out
 * shoppers get a localStorage guest cart (variantId + quantity only — never
 * prices); login replays it through the stock-validated API once per
 * session, keeping failed lines locally so nothing silently vanishes.
 * Server state is always re-read after mutations (no client-side totals).
 */
export function CartProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [snapshot, setSnapshot] = useState<CartSnapshot | null>(null);
  const [miniCartOpen, setMiniCartOpen] = useState(false);
  const [lastMerge, setLastMerge] = useState<MergeResult | null>(null);
  const mergeAttempted = useRef(false);

  const refresh = useCallback(async () => {
    if (!isCartAuthed()) {
      setSnapshot(guestSnapshot());
      return;
    }
    try {
      const cart = await fetchCart();
      setSnapshot({
        authed: true,
        items: cart.items,
        totalQuantity: cart.totalQuantity,
        subtotal: cart.subtotal,
        guestLines: [],
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        // Session died mid-flight: fall back to the guest view; pages own
        // the login redirect for their own loads.
        setSnapshot(guestSnapshot());
        return;
      }
      // Transient network failure: keep the previous snapshot rather than
      // flashing an empty cart from the header.
    }
  }, []);

  // Initial post-hydration load + guest→server merge. The merge runs once
  // per authed session; it re-runs when the session flips (logout resets
  // the guard) and on navigation (same-tab login lands on a new route,
  // which is what flips a layout-level provider without a storage event).
  useEffect(() => {
    if (!isCartAuthed()) {
      mergeAttempted.current = false;
      // Session lives in localStorage (client only): the load below must
      // run post-hydration. Intentional external sync, not derived state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void refresh();
      return;
    }
    if (mergeAttempted.current) {
      return;
    }
    mergeAttempted.current = true;
    let cancelled = false;
    mergeGuestCart()
      .then((result) => {
        if (cancelled) {
          return;
        }
        if (result.merged > 0 || result.failed.length > 0) {
          setLastMerge(result);
        }
      })
      .catch(() => {
        // Merge is best-effort: a failed replay keeps the guest cart intact
        // (mergeGuestCart only drops replayed lines) for the next attempt.
      })
      .finally(() => {
        if (!cancelled) {
          void refresh();
        }
      });
    return () => {
      cancelled = true;
    };
  }, [pathname, refresh]);

  const add = useCallback(
    async (identity: CartAddInput, quantity = 1): Promise<CartActionResult> => {
      if (!isCartAuthed()) {
        setSnapshot((current) => {
          const base = current ?? {
            authed: false,
            items: [],
            totalQuantity: 0,
            subtotal: '0',
            guestLines: [],
          };
          const guestLines = addGuestLine(base.guestLines, identity, quantity);
          saveGuestCart(guestLines);
          return { ...base, authed: false, guestLines };
        });
        setMiniCartOpen(true);
        return { ok: true };
      }
      try {
        await addToCart(identity, quantity);
        await refresh();
        setMiniCartOpen(true);
        return { ok: true };
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          setSnapshot(guestSnapshot());
          router.push('/login');
        }
        return { ok: false, error: cartStockError(error) };
      }
    },
    [refresh, router],
  );

  const setQuantity = useCallback(
    async (variantId: string, quantity: number): Promise<CartActionResult> => {
      if (!isCartAuthed()) {
        setSnapshot((current) => {
          const base = current ?? {
            authed: false,
            items: [],
            totalQuantity: 0,
            subtotal: '0',
            guestLines: loadGuestCart(),
          };
          const guestLines = setGuestQuantity(base.guestLines, variantId, quantity);
          saveGuestCart(guestLines);
          return { ...base, authed: false, guestLines };
        });
        return { ok: true };
      }
      try {
        await updateCartItemQty(variantId, quantity);
        await refresh();
        return { ok: true };
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          setSnapshot(guestSnapshot());
        }
        return { ok: false, error: cartStockError(error) };
      }
    },
    [refresh],
  );

  const removeLine = useCallback(
    async (variantId: string) => {
      if (!isCartAuthed()) {
        setSnapshot((current) => {
          const base = current ?? {
            authed: false,
            items: [],
            totalQuantity: 0,
            subtotal: '0',
            guestLines: loadGuestCart(),
          };
          const guestLines = removeGuestLine(base.guestLines, variantId);
          saveGuestCart(guestLines);
          return { ...base, authed: false, guestLines };
        });
        return;
      }
      try {
        await removeCartItem(variantId);
      } finally {
        await refresh();
      }
    },
    [refresh],
  );

  const clear = useCallback(async () => {
    if (!isCartAuthed()) {
      saveGuestCart([]);
      setSnapshot((current) => ({
        ...(current ?? {
          authed: false,
          items: [],
          totalQuantity: 0,
          subtotal: '0',
        }),
        authed: false,
        guestLines: [],
      }));
      return;
    }
    try {
      await clearCart();
    } finally {
      await refresh();
    }
  }, [refresh]);

  const clearMerge = useCallback(() => {
    setLastMerge(null);
  }, []);

  const value = useMemo<CartContextValue>(() => {
    const current = snapshot ?? {
      authed: false,
      items: [],
      totalQuantity: 0,
      subtotal: '0',
      guestLines: [],
    };
    return {
      ...current,
      ready: snapshot !== null,
      count: current.authed
        ? current.totalQuantity
        : guestCount(current.guestLines),
      miniCartOpen,
      setMiniCartOpen,
      lastMerge,
      clearMerge,
      refresh,
      add,
      setQuantity,
      removeLine,
      clear,
    };
  }, [
    snapshot,
    miniCartOpen,
    lastMerge,
    clearMerge,
    refresh,
    add,
    setQuantity,
    removeLine,
    clear,
  ]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

/** Reads the cart store; must be used under `CartProvider`. */
export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within CartProvider');
  }
  return context;
}
