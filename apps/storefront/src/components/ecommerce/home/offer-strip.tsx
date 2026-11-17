import Link from 'next/link';
import type { CatalogProductCardDto } from '@sabz/types';
import { formatFaNumber } from '@/lib/format';
import { ProductCardWithWishlist } from '@/components/ecommerce/wishlist/product-card-wishlist';
import { SectionHeader } from '@/components/ecommerce/ui/section-header';
import { CountdownTimer } from '@/components/ecommerce/ui/countdown-timer';
import type { HomepageOfferHeading } from '@/lib/homepage-view';

/**
 * Commercial strip (Task 04). Uses only products that are actually eligible:
 * in stock and either genuinely compare-at discounted or carrying a live
 * promotion. A compare-at price does not create a countdown — `endsAt` is
 * resolved from a real, still-future promotion timestamp by the page.
 *
 * With no genuine promotion the strip degrades to a truthful
 * featured-products presentation; it never invents urgency or percentages.
 */
export function OfferStrip({
  products,
  mode,
  endsAt = null,
  heading,
  id = 'offer-heading',
}: {
  products: CatalogProductCardDto[];
  mode: 'offer' | 'featured';
  /** Earliest real, still-future promotion end among `products`. */
  endsAt?: string | null;
  /** Published campaign copy; when supplied it replaces all static headings. */
  heading?: HomepageOfferHeading;
  id?: string;
}) {
  const visible = products.slice(0, 6);
  if (visible.length === 0) {
    return null;
  }
  const isOffer = mode === 'offer';
  const title = heading ? heading.title : isOffer ? 'پیشنهادهای منتخب' : 'منتخب فروشگاه';
  const subtitle = heading
    ? heading.subtitle
    : isOffer
      ? 'کالاهای موجود با قیمت ویژه'
      : 'گزیده‌ای از کالاهای موجود در فروشگاه';
  const actionLabel = heading ? heading.actionLabel : 'همه محصولات';
  const actionHref = heading ? heading.actionHref : '/products';

  return (
    <section
      data-home-section="offer"
      aria-labelledby={id}
      className="border-y border-border bg-surface-2/60"
    >
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
        {title ? (
          <SectionHeader
            id={id}
            title={title}
            subtitle={subtitle ?? undefined}
            actionLabel={actionLabel ?? undefined}
            actionHref={actionLabel ? (actionHref ?? undefined) : undefined}
          />
        ) : (
          <h2 id={id} className="sr-only">
            پیشنهادهای فروشگاه
          </h2>
        )}

        {isOffer ? (
          <p className="mt-3 text-xs text-fg-muted">
            {formatFaNumber(visible.length)} کالای دارای قیمت ویژه، همه موجود
            در انبار
          </p>
        ) : null}

        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-4">
          <ul
            role="list"
            className={`grid grid-cols-2 gap-3 ${isOffer ? 'lg:col-span-2' : 'lg:col-span-3 lg:grid-cols-3'}`}
          >
            {visible.map((product) => (
              <li key={product.id}>
                <ProductCardWithWishlist product={product} density="compact" />
              </li>
            ))}
          </ul>

          <aside
            className={`stage-surface flex flex-col justify-between rounded-panel border border-stage-border bg-stage p-5 text-on-stage sm:p-6 ${isOffer ? 'lg:col-span-2' : 'lg:col-span-1'}`}
          >
            <div>
              {heading?.eyebrow ? (
                <p className="text-[11px] font-semibold text-accent-stage">
                  {heading.eyebrow}
                </p>
              ) : null}

              {endsAt ? (
                <div
                  data-offer-countdown
                  className="mt-4 border-t border-stage-border pt-4"
                >
                  <p className="mb-2 text-[10px] text-on-stage-muted">
                    پایان قیمت ویژه
                  </p>
                  <CountdownTimer endsAt={endsAt} size="sm" />
                </div>
              ) : null}
            </div>

            <div className="flex flex-1 flex-col items-center justify-center py-6">
              <span className="text-5xl font-black leading-none text-on-stage sm:text-6xl">
                {formatFaNumber(visible.length)}
              </span>
              <span className="mt-2 text-[11px] text-on-stage-muted">
                {isOffer ? 'کالای دارای قیمت ویژه' : 'کالا در این بخش'}
              </span>
            </div>

            {!title && actionHref && actionLabel ? (
              <Link
                href={actionHref}
                className="inline-flex min-h-11 w-fit items-center justify-center rounded-control bg-on-stage px-4 text-xs font-bold text-stage transition-colors hover:bg-on-stage/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                {actionLabel}
              </Link>
            ) : null}
          </aside>
        </div>
      </div>
    </section>
  );
}
