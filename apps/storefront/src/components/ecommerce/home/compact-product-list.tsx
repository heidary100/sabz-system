import type { CatalogProductCardDto } from '@sabz/types';
import { formatFaNumber } from '@/lib/format';
import { ProductCardWithWishlist } from '@/components/ecommerce/wishlist/product-card-wishlist';

/**
 * Ready-to-ship compact collection (Task 04). A two-column desktop
 * composition: an optional published heading opens the section, followed by
 * compact Product Card v2 cards. Published products are supplied by the API;
 * availability is never inferred from copy.
 */
export function CompactProductList({
  products,
  title,
  subtitle,
  id = 'ready-heading',
}: {
  products: CatalogProductCardDto[];
  title?: string | null;
  subtitle?: string | null;
  id?: string;
}) {
  const visible = products.slice(0, 8);
  const heading = title === undefined ? 'آماده ارسال' : title;
  const description =
    subtitle === undefined
      ? 'گزیده‌ای از کالاهایی که همین حالا موجودی انبار دارند.'
      : subtitle;
  const showEyebrow = Boolean(heading || description);
  if (visible.length === 0) {
    return null;
  }

  return (
    <section
      data-home-section="ready"
      aria-labelledby={heading ? id : undefined}
      aria-label={heading ? undefined : 'محصولات آماده ارسال'}
      className="border-y border-border bg-surface-2/60"
    >
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,2fr)] lg:gap-8">
          <div className="lg:pt-1">
            {showEyebrow ? (
              <p className="flex items-center gap-2 text-[11px] font-semibold text-accent">
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-pill bg-accent"
                />
                موجودی انبار
              </p>
            ) : null}
            {heading ? (
              <h2
                id={id}
                className="mt-3 text-balance text-h2 text-fg"
              >
                {heading}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-2 max-w-sm text-body leading-7 text-fg-muted">
                {description}
              </p>
            ) : null}

            <dl className="mt-5 flex items-baseline gap-2 border-t border-border pt-4">
              <dt className="text-xs text-fg-muted">در این گزیده</dt>
              <dd className="text-lg font-bold text-fg">
                {formatFaNumber(visible.length)} کالا
              </dd>
            </dl>

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
