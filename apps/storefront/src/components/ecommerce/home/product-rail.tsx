'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CatalogProductCardDto } from '@sabz/types';
import { formatFaNumber } from '@/lib/format';
import { ProductCardWithWishlist } from '@/components/ecommerce/wishlist/product-card-wishlist';
import { SectionHeader } from '@/components/ecommerce/ui/section-header';

/**
 * New-arrivals rail (Task 04). One horizontal, scroll-snapped product rail
 * with explicit previous/next controls, touch swiping, and no autoplay.
 * Product data is fetched on the server and passed in; the client island only
 * owns scroll state and accessibility.
 */
export function ProductRail({
  id,
  title,
  subtitle,
  actionHref,
  products,
}: {
  id: string;
  title: string;
  subtitle?: string;
  actionHref?: string;
  products: CatalogProductCardDto[];
}) {
  const trackRef = useRef<HTMLUListElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const updateEdges = useCallback(() => {
    const track = trackRef.current;
    if (!track) {
      return;
    }
    const max = Math.max(0, track.scrollWidth - track.clientWidth);
    const position = Math.abs(track.scrollLeft);
    setAtStart(position <= 2);
    setAtEnd(max === 0 || position >= max - 2);
  }, []);

  useEffect(() => {
    updateEdges();
    const track = trackRef.current;
    if (!track) {
      return;
    }
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(updateEdges);
    observer?.observe(track);
    window.addEventListener('resize', updateEdges);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateEdges);
    };
  }, [updateEdges]);

  const move = useCallback((direction: 'previous' | 'next') => {
    const track = trackRef.current;
    if (!track) {
      return;
    }
    const rtl = getComputedStyle(track).direction === 'rtl';
    const step = track.clientWidth * 0.85;
    const sign = direction === 'next' ? 1 : -1;
    track.scrollBy({
      left: step * sign * (rtl ? -1 : 1),
      behavior: 'smooth',
    });
  }, []);

  if (products.length === 0) {
    return null;
  }

  const trackId = `${id}-track`;
  const items = products.slice(0, 6);

  return (
    <section
      data-home-section="new-arrivals"
      aria-labelledby={id}
      className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8"
    >
      <SectionHeader
        id={id}
        title={title}
        subtitle={subtitle}
        actionLabel="همه محصولات"
        actionHref={actionHref}
      />

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-fg-muted">
          {formatFaNumber(items.length)} کالا
        </p>
        <div className="flex items-center gap-1.5">
          <RailButton
            label="محصولات قبلی"
            controls={trackId}
            disabled={atStart}
            onClick={() => move('previous')}
            direction="previous"
          />
          <RailButton
            label="محصولات بعدی"
            controls={trackId}
            disabled={atEnd}
            onClick={() => move('next')}
            direction="next"
          />
        </div>
      </div>

      <ul
        ref={trackRef}
        id={trackId}
        role="list"
        aria-label={`${title} — ریل محصولات`}
        tabIndex={0}
        onScroll={updateEdges}
        className="mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:none] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [&::-webkit-scrollbar]:hidden"
      >
        {items.map((product) => (
          <li
            key={product.id}
            className="w-[13.5rem] shrink-0 snap-start sm:w-[15rem] lg:w-[16rem]"
          >
            <ProductCardWithWishlist product={product} density="compact" />
          </li>
        ))}
      </ul>
    </section>
  );
}

function RailButton({
  label,
  controls,
  disabled,
  onClick,
  direction,
}: {
  label: string;
  controls: string;
  disabled: boolean;
  onClick: () => void;
  direction: 'previous' | 'next';
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-controls={controls}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-pill border border-border bg-surface text-fg transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-40"
    >
      <svg
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
        className="size-4"
      >
        {direction === 'next' ? (
          <path
            fillRule="evenodd"
            d="M12.78 5.22a.75.75 0 0 1 0 1.06L9.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z"
            clipRule="evenodd"
          />
        ) : (
          <path
            fillRule="evenodd"
            d="M7.22 14.78a.75.75 0 0 1 0-1.06L10.94 10 7.22 6.28a.75.75 0 1 1 1.06-1.06l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0Z"
            clipRule="evenodd"
          />
        )}
      </svg>
    </button>
  );
}
