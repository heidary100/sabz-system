import Link from 'next/link';
import { homeConfig } from '@/config/home';
import { fetchCategoryTree, fetchProducts } from '@/lib/catalog';
import {
  resolveAnnouncement,
  resolveFeaturedCategories,
  shouldShowSection,
} from '@/lib/home';
import { CategoryTile } from '@/components/ecommerce/category/category-tile';
import { Hero } from '@/components/ecommerce/hero/hero';
import { AnnouncementBar } from '@/components/ecommerce/promo/announcement-bar';
import { ProductCard } from '@/components/ecommerce/product-card/product-card';
import { TrustStrip } from '@/components/ecommerce/trust/trust-strip';

/**
 * Home page (SS-128, SS-215 reality): announcement, factual hero, curated
 * categories, in-stock + latest product rails, and the configured trust
 * strip. Queries stay bounded (`newest` only — never price sorts, never the
 * full catalog); empty rails and unconfigured sections hide instead of
 * rendering placeholders.
 */
// Catalog pages render per request: build-time prerendering would either
// snapshot stale data or fail when the API is unreachable (CI).
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  // Three bounded, independent queries in parallel: the tree plus one
  // `newest` page for each rail (latest + in-stock availability truth).
  const [categories, latest, inStock] = await Promise.all([
    fetchCategoryTree(),
    fetchProducts({ sort: 'newest', limit: homeConfig.latestLimit }),
    fetchProducts({
      sort: 'newest',
      limit: homeConfig.inStockLimit,
      inStockOnly: true,
    }),
  ]);
  // Curated category selection in config order with a deterministic
  // tree-order fallback when nothing is curated (SS-215 foundation).
  const featuredCategories = resolveFeaturedCategories(
    categories,
    homeConfig.featuredCategorySlugs,
    homeConfig.maxCategoryTiles,
  );
  const announcement = resolveAnnouncement(homeConfig.announcement);

  return (
    <div>
      {announcement ? <AnnouncementBar announcement={announcement} /> : null}

      <Hero />

      {/* Featured categories */}
      {shouldShowSection(featuredCategories) ? (
        <section aria-labelledby="categories-heading" className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <h2 id="categories-heading" className="text-xl font-bold tracking-tight text-ink-900">
              دسته‌بندی‌ها
            </h2>
            <Link href="/categories" className="shrink-0 rounded-sm text-sm font-medium text-sabz-700 hover:text-sabz-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sabz-700">
              مشاهده همه
            </Link>
          </div>
          <ul role="list" className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {featuredCategories.map((category) => (
              <CategoryTile key={category.id} category={category} variant="child" />
            ))}
          </ul>
        </section>
      ) : null}

      {/* In-stock products: what the customer can actually get now */}
      {shouldShowSection(inStock.items) ? (
        <section aria-labelledby="instock-heading" className="mx-auto max-w-7xl px-4 pb-12 sm:px-6 sm:pb-14 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 id="instock-heading" className="text-xl font-bold tracking-tight text-ink-900">
                موجود در انبار
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                محصولاتی که هم‌اکنون موجودی دارند
              </p>
            </div>
            <Link href="/products?inStockOnly=true" className="shrink-0 rounded-sm text-sm font-medium text-sabz-700 hover:text-sabz-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sabz-700">
              مشاهده همه
            </Link>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {inStock.items.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Latest products: newest published rows */}
      {shouldShowSection(latest.items) ? (
        <section aria-labelledby="latest-heading" className="mx-auto max-w-7xl px-4 pb-12 sm:px-6 sm:pb-14 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 id="latest-heading" className="text-xl font-bold tracking-tight text-ink-900">
                جدیدترین محصولات
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                تازه‌ترین کالاهای منتشرشده در فروشگاه
              </p>
            </div>
            <Link href="/products?sort=newest" className="shrink-0 rounded-sm text-sm font-medium text-sabz-700 hover:text-sabz-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sabz-700">
              مشاهده همه
            </Link>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {latest.items.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Catalog pending notice: only when both rails are empty. */}
      {!shouldShowSection(inStock.items) && !shouldShowSection(latest.items) ? (
        <section className="mx-auto max-w-7xl px-4 py-16 text-center sm:px-6 lg:px-8">
          <p className="text-sm text-gray-500">
            کاتالوگ محصولات بهزودی تکمیل میشود.
          </p>
        </section>
      ) : null}

      <TrustStrip items={homeConfig.trustItems} />
    </div>
  );
}
