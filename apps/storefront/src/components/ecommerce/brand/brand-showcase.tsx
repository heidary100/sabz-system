'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import type { CatalogProductCardDto } from '@sabz/types';
import { formatFaNumber } from '@/lib/format';
import { ProductCardWithWishlist } from '@/components/ecommerce/wishlist/product-card-wishlist';
import { SectionHeader } from '@/components/ecommerce/ui/section-header';

export interface BrandShowcaseGroup {
  name: string;
  slug: string;
  products: CatalogProductCardDto[];
}

/**
 * Brand showcase tabs (Task 04): text wordmarks only — no invented logos.
 * Empty brands are filtered before tabs are built, so every visible tab has
 * real published products. All rails are fetched server-side; the tablist
 * only toggles visibility. Full tab semantics with roving tabIndex and
 * arrow-key navigation.
 */
export function BrandShowcase({ groups }: { groups: BrandShowcaseGroup[] }) {
  const baseId = useId();
  const [active, setActive] = useState(0);
  const visible = groups.filter((group) => group.products.length > 0);
  if (visible.length === 0) {
    return null;
  }
  const selected = Math.min(active, visible.length - 1);

  function onKeyDown(event: React.KeyboardEvent) {
    if (
      event.key !== 'ArrowLeft' &&
      event.key !== 'ArrowRight' &&
      event.key !== 'Home' &&
      event.key !== 'End'
    ) {
      return;
    }
    event.preventDefault();
    let next = selected;
    if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = visible.length - 1;
    } else if (event.key === 'ArrowLeft') {
      next = (selected - 1 + visible.length) % visible.length;
    } else {
      next = (selected + 1) % visible.length;
    }
    setActive(next);
    document.getElementById(`${baseId}-tab-${next}`)?.focus();
  }

  return (
    <section
      data-home-section="brands"
      aria-labelledby="brands-heading"
      className="border-y border-border bg-surface"
    >
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
        <SectionHeader
          id="brands-heading"
          title="برندها"
          subtitle="منتخبی از کالاهای موجود هر برند"
        />

        <div
          role="tablist"
          aria-label="انتخاب برند"
          onKeyDown={onKeyDown}
          className="mt-6 flex snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {visible.map((group, index) => (
            <button
              key={group.slug}
              id={`${baseId}-tab-${index}`}
              role="tab"
              type="button"
              aria-selected={index === selected}
              aria-controls={`${baseId}-panel-${index}`}
              tabIndex={index === selected ? 0 : -1}
              onClick={() => setActive(index)}
              className={`min-h-11 shrink-0 snap-start rounded-pill border px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                index === selected
                  ? 'border-accent bg-accent text-on-accent'
                  : 'border-border bg-surface-2 text-fg-secondary hover:border-accent/50 hover:text-accent'
              }`}
            >
              {group.name}
            </button>
          ))}
        </div>

        {visible.map((group, index) => (
          <div
            key={group.slug}
            id={`${baseId}-panel-${index}`}
            role="tabpanel"
            aria-labelledby={`${baseId}-tab-${index}`}
            hidden={index !== selected}
            tabIndex={0}
            className="mt-6 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-xs text-fg-muted">
                {formatFaNumber(group.products.length)} کالای منتخب از{' '}
                {group.name}
              </p>
              <Link
                href={`/products?brand=${encodeURIComponent(group.slug)}`}
                className="inline-flex min-h-11 items-center rounded-control text-sm font-medium text-accent transition-colors hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                مشاهده همه
              </Link>
            </div>
            <ul role="list" className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
              {group.products.slice(0, 4).map((product) => (
                <li key={product.id}>
                  <ProductCardWithWishlist
                    product={product}
                    density="compact"
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
