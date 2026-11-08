import { connection } from 'next/server';
import { homeConfig } from '@/config/home';
import { fetchCategoryTree, fetchProducts } from '@/lib/catalog';
import {
  resolveAnnouncement,
  resolveFeaturedCategories,
  shouldShowSection,
} from '@/lib/home';
import { CategoryTile } from '@/components/ecommerce/category/category-tile';
import { CategoryBanners } from '@/components/ecommerce/category/category-banners';
import { HeroSlider } from '@/components/ecommerce/hero/hero-slider';
import { AnnouncementBar } from '@/components/ecommerce/promo/announcement-bar';
import { SaleBanner } from '@/components/ecommerce/promo/sale-banner';
import { ProductCardWithWishlist } from '@/components/ecommerce/wishlist/product-card-wishlist';
import { SectionHeader } from '@/components/ecommerce/ui/section-header';
import { BrandShowcase } from '@/components/ecommerce/brand/brand-showcase';
import { BlogTeaser } from '@/components/ecommerce/blog/blog-teaser';
import { AppSection } from '@/components/ecommerce/app/app-section';
import { TrustStrip } from '@/components/ecommerce/trust/trust-strip';

/**
 * Home page (SS-128, SS-215, rebuilt SS-224): announcement, configured sale
 * countdown bar, cinematic hero slider, collection banners, the verified
 * trust strip, curated categories, brand-showcase tabs, in-stock + latest +
 * alphabetical rails, the blog teaser (hidden until the first post), and
 * the (verified-only) app section. Queries stay
 * bounded (`newest`/`name`, never unbounded price sorts); empty rails and
 * unconfigured sections hide instead of rendering placeholders.
 *
 * `connection()` keeps rendering at request time (build-time prerendering
 * would snapshot stale data or fail when the API is unreachable in CI)
 * without `force-dynamic`, which would disable the Data Cache (SS-217).
 */
export default async function HomePage() {
  await connection();
  // Bounded, independent queries in parallel: the tree, one `newest` page per
  // rail (latest + in-stock availability truth), one `name` page for the
  // alphabetical browse rail, and one newest page per configured brand tab.
  const brandRails = await Promise.all(
    homeConfig.brandTabs.map(async (tab) => ({
      ...tab,
      products: await fetchProducts({ brand: tab.slug, limit: 4, sort: 'newest' }),
    })),
  );
  const [categories, latest, inStock, alphabetical] = await Promise.all([
    fetchCategoryTree(),
    fetchProducts({ sort: 'newest', limit: homeConfig.latestLimit }),
    fetchProducts({
      sort: 'newest',
      limit: homeConfig.inStockLimit,
      inStockOnly: true,
    }),
    fetchProducts({ sort: 'name', limit: homeConfig.alphabeticalLimit }),
  ]);
  // Curated category selection in config order with a deterministic
  // tree-order fallback when nothing is curated (SS-215 foundation).
  const featuredCategories = resolveFeaturedCategories(
    categories,
    homeConfig.featuredCategorySlugs,
    homeConfig.maxCategoryTiles,
  );
  const announcement = resolveAnnouncement(homeConfig.announcement);
  const showcaseGroups = brandRails.map((rail) => ({
    name: rail.name,
    slug: rail.slug,
    products: rail.products.items,
  }));

  return (
    <div>
      {announcement ? <AnnouncementBar announcement={announcement} /> : null}
      {homeConfig.saleBanner ? <SaleBanner banner={homeConfig.saleBanner} /> : null}

      {/* Hero: slider when configured, static typographic hero otherwise. */}
      {homeConfig.heroSlides.length > 0 ? (
        <HeroSlider slides={homeConfig.heroSlides} />
      ) : null}

      {/* Collection banners (verified catalog routes only). */}
      <CategoryBanners banners={homeConfig.categoryBanners} />

      {/* Trust strip: the store's own verified claims. */}
      <TrustStrip items={homeConfig.trustItems} />

      {/* Featured categories */}
      {shouldShowSection(featuredCategories) ? (
        <section aria-labelledby="categories-heading" className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
          <SectionHeader id="categories-heading" title="دسته‌بندی‌ها" actionHref="/categories" />
          <ul role="list" className=" mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {featuredCategories.map((category) => (
              <CategoryTile key={category.id} category={category} variant="child" />
            ))}
          </ul>
        </section>
      ) : null}

      {/* Brand showcase tabs */}
      <BrandShowcase groups={showcaseGroups} />

      {/* In-stock products: what the customer can actually get now */}
      {shouldShowSection(inStock.items) ? (
        <section aria-labelledby="instock-heading" className=" border-t border-border bg-surface-2/60">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
            <SectionHeader
              id="instock-heading"
              title="موجود در انبار"
              subtitle="محصولاتی که هم‌اکنون موجودی دارند"
              actionHref="/products?inStockOnly=true"
            />
            <div className=" mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {inStock.items.map((product) => (
                <ProductCardWithWishlist key={product.id} product={product} />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* Latest products: newest published rows */}
      {shouldShowSection(latest.items) ? (
        <section aria-labelledby="latest-heading" className=" mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
          <SectionHeader
            id="latest-heading"
            title="جدیدترین محصولات"
            subtitle="تازه‌ترین کالاهای منتشرشده در فروشگاه"
            actionHref="/products?sort=newest"
          />
          <div className=" mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {latest.items.map((product) => (
              <ProductCardWithWishlist key={product.id} product={product} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Alphabetical browse rail: the live site's A–Z directory, compact. */}
      {shouldShowSection(alphabetical.items) ? (
        <section aria-labelledby="alphabetical-heading" className=" border-t border-border bg-surface">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
            <SectionHeader
              id="alphabetical-heading"
              title="مرور الفبایی محصولات"
              subtitle="مرور همه کالاها بر اساس نام"
              actionLabel="مرور الفبایی کامل"
              actionHref="/products?sort=name"
            />
            <div className=" mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {alphabetical.items.map((product) => (
                <ProductCardWithWishlist key={product.id} product={product} />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* Verified app distribution links only; hidden until supplied. */}
      <div className="pt-12 sm:pt-14">
        <AppSection links={homeConfig.appLinks} />
      </div>

      {/* Blog teaser: latest published articles; hidden until the first post (SS-238). */}
      <BlogTeaser />

      {/* Catalog pending notice: only when every rail is empty. */}
      {!shouldShowSection(inStock.items) && !shouldShowSection(latest.items) ? (
        <section className="mx-auto max-w-7xl px-4 py-16 text-center sm:px-6 lg:px-8">
          <p className="text-sm text-fg-muted">
            کاتالوگ محصولات بهزودی تکمیل میشود.
          </p>
        </section>
      ) : null}
    </div>
  );
}
