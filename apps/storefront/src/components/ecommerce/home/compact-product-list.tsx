import Link from 'next/link';
import type { CatalogProductCardDto } from '@sabz/types';
import { formatFaNumber } from '@/lib/format';
import { ProductCardWithWishlist } from '@/components/ecommerce/wishlist/product-card-wishlist';

/**
 * Ready-to-ship compact collection (Task 04). A two-column desktop
 * composition, not another four-column grid: a quiet inventory note opens
 * the section, then four compact Product Card v2 cards follow. Products are
 * supplied by the server-side `inStockOnly` query, so availability is never
 * inferred from copy.
 */
export function CompactProductList({
  products,
}: {
  products: CatalogProductCardDto[];
}) {
  const visible = products.slice(0, 4);
  if (visible.length === 0) {
    return null;
  }

  return (
    <section
      data-home-section="ready"
      aria-labelledby="ready-heading"
      className="border-y border-border bg-surface-2/60"
    >
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,2fr)] lg:gap-8">
          <div className="lg:pt-1">
            <p className="flex items-center gap-2 text-[11px] font-semibold text-accent">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-pill bg-accent"
              />
              موجودی انبار
            </p>
            <h2
              id="ready-heading"
              className="mt-3 text-balance text-h2 text-fg"
            >
              آماده ارسال
            </h2>
            <p className="mt-2 max-w-sm text-body leading-7 text-fg-muted">
              گزیده‌ای از کالاهایی که همین حالا موجودی انبار دارند.
            </p>

            <dl className="mt-5 flex items-baseline gap-2 border-t border-border pt-4">
              <dt className="text-xs text-fg-muted">در این گزیده</dt>
              <dd className="text-lg font-bold text-fg">
                {formatFaNumber(visible.length)} کالا
              </dd>
            </dl>

            <Link
              href="/products?inStockOnly=true"
              className="mt-5 inline-flex min-h-11 items-center gap-1 rounded-control text-sm font-medium text-accent transition-colors hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              مشاهده موجودی کامل
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
                className="size-4"
              >
                <path
                  fillRule="evenodd"
                  d="M12.78 5.22a.75.75 0 0 1 0 1.06L9.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z"
                  clipRule="evenodd"
                />
              </svg>
            </Link>
          </div>

          <ul role="list" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            {visible.map((product) => (
              <li key={product.id}>
                <ProductCardWithWishlist product={product} density="compact" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
