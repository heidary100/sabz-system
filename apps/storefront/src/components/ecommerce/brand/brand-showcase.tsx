'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import type { CatalogProductCardDto } from '@sabz/types';
import { ProductCardWithWishlist } from '@/components/ecommerce/wishlist/product-card-wishlist';
import { SectionHeader } from '@/components/ecommerce/ui/section-header';

export interface BrandShowcaseGroup {
  name: string;
  slug: string;
  products: CatalogProductCardDto[];
}

/**
 * Brand showcase tabs (SS-224): the live site's per-brand product tabs.
 * All rails are fetched server-side (bounded `newest` queries) and the tabs
 * only toggle visibility — no client fetching. Full tab semantics:
 * `role=tablist/tab/tabpanel`, arrow-key navigation, aria-selected.
 */
export function BrandShowcase({ groups }: { groups: BrandShowcaseGroup[] }) {
  const baseId = useId();
  const [active, setActive] = useState(0);
  const visible = groups.filter((group) => group.products.length > 0);
  if (visible.length === 0) {
    return null;
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }
    event.preventDefault();
    const delta = event.key === 'ArrowLeft' ? -1 : 1;
    const next = (active + delta + groups.length) % groups.length;
    setActive(next);
    document.getElementById(`${baseId}-tab-${next}`)?.focus();
  }

  return (
    <section aria-labelledby="brands-heading" className="border-t border-border bg-surface">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
        <SectionHeader id="brands-heading" title="گجت‌های روز" subtitle="محبوب‌ترین برندهای فروشگاه" />

        <div
          role="tablist"
          aria-label="برندها"
          onKeyDown={onKeyDown}
          className="mt-6 flex flex-wrap gap-2"
        >
          {groups.map((group, index) => (
            <button
              key={group.slug}
              id={`${baseId}-tab-${index}`}
              role="tab"
              type="button"
              aria-selected={index === active}
              aria-controls={`${baseId}-panel-${index}`}
              tabIndex={index === active ? 0 : -1}
              onClick={() => setActive(index)}
              className={`min-h-11 rounded-pill px-4 text-sm font-semibold transition-colors ${
                index === active
                  ? 'bg-accent text-on-accent shadow-card'
                  : 'bg-surface-2 text-fg-secondary hover:bg-accent-soft hover:text-accent'
              }`}
            >
              {group.name}
            </button>
          ))}
        </div>

        {groups.map((group, index) => (
          <div
            key={group.slug}
            id={`${baseId}-panel-${index}`}
            role="tabpanel"
            aria-labelledby={`${baseId}-tab-${index}`}
            hidden={index !== active}
            className="mt-6"
          >
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {group.products.map((product) => (
                <ProductCardWithWishlist key={product.id} product={product} density="compact" />
              ))}
            </div>
            <div className="mt-6 text-start">
              <Link
                href={`/products?brand=${encodeURIComponent(group.slug)}`}
                className="inline-flex min-h-11 items-center rounded-control text-sm font-medium text-accent hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                مشاهده همه محصولات {group.name}
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
