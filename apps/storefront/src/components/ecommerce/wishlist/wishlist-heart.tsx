'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { addToWishlist, removeFromWishlist } from '@/lib/wishlist';
import { useHasSession } from './use-has-session';

interface WishlistHeartProps {
  productId: string;
  initialActive?: boolean;
  onToggle?: (active: boolean) => void;
  className?: string;
}

/**
 * Wishlist heart toggle (SS-231): client island overlaid on product cards.
 * Renders nothing when logged out (anti-fabrication — no fake hearts), flips
 * optimistically for logged-in users and reverts on failure; a dead session
 * routes to /login.
 */
export function WishlistHeart({
  productId,
  initialActive = false,
  onToggle,
  className = '',
}: WishlistHeartProps) {
  const router = useRouter();
  const visible = useHasSession();
  const [active, setActive] = useState(initialActive);
  const [pending, setPending] = useState(false);

  async function toggle(): Promise<void> {
    if (pending) {
      return;
    }
    const next = !active;
    setActive(next);
    setPending(true);
    try {
      if (next) {
        await addToWishlist(productId);
      } else {
        await removeFromWishlist(productId);
      }
      onToggle?.(next);
    } catch (error) {
      setActive(!next);
      if (error instanceof ApiError && error.status === 401) {
        router.push('/login');
      }
    } finally {
      setPending(false);
    }
  }

  if (!visible) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={pending}
      aria-pressed={active}
      aria-label={active ? 'حذف از علاقه‌مندی‌ها' : 'افزودن به علاقه‌مندی‌ها'}
      className={`flex min-h-11 min-w-11 items-center justify-center rounded-pill bg-surface text-fg-muted ring-1 ring-inset ring-border-control transition-colors hover:text-accent disabled:opacity-60 ${active ? 'text-accent' : ''} ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill={active ? 'currentColor' : 'none'}
        strokeWidth={1.5}
        stroke="currentColor"
        aria-hidden="true"
        className="size-5"
      >
        <path
          d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
