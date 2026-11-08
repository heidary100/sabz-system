import Link from 'next/link';
import type { CatalogProductCardDto } from '@sabz/types';
import { formatFaNumber } from '@/lib/format';
import { ProductCardWithWishlist } from '@/components/ecommerce/wishlist/product-card-wishlist';
import { SectionHeader } from '@/components/ecommerce/ui/section-header';
import { CountdownTimer } from '@/components/ecommerce/ui/countdown-timer';

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
}: {
  products: CatalogProductCardDto[];
  mode: 'offer' | 'featured';
  /** Earliest real, still-future promotion end among `products`. */
  endsAt?: string | null;
}) {
  const visible = products.slice(0, 6);
  if (visible.length === 0) {
    return null;
  }
  const isOffer = mode === 'offer';

  return (
    <section
      data-home-section="offer"
      aria-labelledby="offer-heading"
      className="border-y border-border bg-surface-2/60"
    >
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
        <SectionHeader
          id="offer-heading"
          title={isOffer ? 'پیشنهادهای منتخب' : 'منتخب فروشگاه'}
          subtitle={
            isOffer
              ? 'کالاهای موجود با قیمت ویژه'
              : 'گزیده‌ای از کالاهای موجود در فروشگاه'
          }
          actionLabel="همه محصولات"
          actionHref="/products"
        />

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
              <p className="text-[11px] font-semibold text-accent-stage">
                {isOffer ? 'فرصت خرید' : 'انتخاب سردبیر'}
              </p>
              <h2 className="mt-2 text-xl font-extrabold leading-8 sm:text-2xl">
                {isOffer ? 'قیمت‌های ویژه' : 'کالاهای منتخب'}
              </h2>
              <p className="mt-2 max-w-sm text-xs leading-6 text-on-stage-secondary">
                {isOffer
                  ? 'کالاهای دارای تخفیف واقعی و موجود در انبار.'
                  : 'مجموعه‌ای محدود از کالاهای موجود برای شروع خرید.'}
              </p>

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

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link
                href="/products"
                className="inline-flex min-h-11 items-center justify-center rounded-control bg-on-stage px-4 text-xs font-bold text-stage transition-colors hover:bg-on-stage/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                مشاهده همه محصولات
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
