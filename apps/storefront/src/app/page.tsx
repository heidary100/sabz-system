import { connection } from 'next/server';
import type { CatalogProductCardDto } from '@sabz/types';
import { homeConfig } from '@/config/home';
import {
  fetchCategoryCovers,
  fetchCategoryTree,
  fetchProducts,
  mediaImageUrl,
} from '@/lib/catalog';
import {
  limitHeroSlides,
  resolveAnnouncement,
  resolveFeaturedCategories,
  resolveHomeOffers,
} from '@/lib/home';
import { findCategoryNode } from '@/lib/nav';
import { AnnouncementBar } from '@/components/ecommerce/promo/announcement-bar';
import { SaleBanner } from '@/components/ecommerce/promo/sale-banner';
import { HeroStage } from '@/components/ecommerce/hero/hero-slider';
import { TrustStrip } from '@/components/ecommerce/trust/trust-strip';
import { CategoryDiscovery } from '@/components/ecommerce/home/category-discovery';
import { OfferStrip } from '@/components/ecommerce/home/offer-strip';
import { SplitCampaign } from '@/components/ecommerce/home/split-campaign';
import { CompactProductList } from '@/components/ecommerce/home/compact-product-list';
import { ProductRail } from '@/components/ecommerce/home/product-rail';
import { BrandShowcase } from '@/components/ecommerce/brand/brand-showcase';
import { BlogTeaser } from '@/components/ecommerce/blog/blog-teaser';

/**
 * Home page v2 (Task 04): a curated Pine & Paper storefront.
 *
 * Order: announcement (config-only), campaign-stage hero, trust hairline,
 * six-category discovery, honest offer strip, stock-goods editorial split,
 * ready-to-ship collection, new-arrivals rail, brand showcase, blog feature.
 * Every section fetches independently and degrades to hidden (or its own
 * fallback) when data is unavailable — one failed query never breaks the page.
 *
 * `connection()` keeps rendering at request time without `force-dynamic`, so
 * the Data Cache still deduplicates and revalidates the bounded queries below.
 */
export default async function HomePage() {
  await connection();

  const heroConfig = limitHeroSlides(homeConfig.heroSlides);

  const [
    categories,
    categoryCovers,
    newest,
    readyToShip,
    offerCandidates,
    heroSlides,
    brandRails,
  ] = await Promise.all([
    fetchCategoryTree(),
    fetchCategoryCovers(homeConfig.featuredCategorySlugs.join(',')),
    productItems({ sort: 'newest', limit: homeConfig.latestLimit }),
    productItems({
      sort: 'newest',
      limit: homeConfig.inStockLimit,
      inStockOnly: true,
    }),
    // Bounded price sweep: offer eligibility is still decided by real
    // compare-at / future promotion fields, never by position in this page.
    productItems({ sort: 'price_desc', limit: 40 }),
    Promise.all(
      heroConfig.map(async (slide) => {
        const products = slide.categorySlug
          ? await productItems({
              category: slide.categorySlug,
              sort: 'price_desc',
              inStockOnly: true,
              limit: 3,
            })
          : [];
        const images = [
          ...new Set(
            products
              .map((product) =>
                mediaImageUrl(
                  product.primaryThumbnailUrl ?? product.primaryImageUrl,
                ),
              )
              .filter((image): image is string => image !== null),
          ),
        ];
        return { ...slide, images };
      }),
    ),
    Promise.all(
      homeConfig.brandTabs.map(async (tab) => ({
        ...tab,
        products: await productItems({
          brand: tab.slug,
          sort: 'newest',
          limit: 4,
        }),
      })),
    ),
  ]);

  const featuredCategories = resolveFeaturedCategories(
    categories,
    homeConfig.featuredCategorySlugs,
    homeConfig.maxCategoryTiles,
  );

  const offer = resolveHomeOffers(offerCandidates, newest);

  const stockCategory = findCategoryNode(categories, 'stock-goods');
  const stockLaptops = findCategoryNode(categories, 'lp-tap-astvk');
  const stockCover = stockCategory
    ? (categoryCovers[stockCategory.slug] ?? null)
    : null;

  const announcement = resolveAnnouncement(homeConfig.announcement);

  return (
    <div>
      {announcement ? (
        <AnnouncementBar announcement={announcement} />
      ) : null}
      {homeConfig.saleBanner ? (
        <SaleBanner banner={homeConfig.saleBanner} />
      ) : null}

      <HeroStage slides={heroSlides} />

      <TrustStrip items={homeConfig.trustItems} />

      <CategoryDiscovery
        categories={featuredCategories}
        covers={categoryCovers}
      />

      <OfferStrip
        products={offer.products}
        mode={offer.mode}
        endsAt={offer.endsAt}
      />

      <SplitCampaign
        category={stockCategory}
        cover={stockCover}
        laptopCount={stockLaptops?.publishedProductCount ?? null}
      />

      <CompactProductList products={readyToShip} />

      <ProductRail
        id="new-arrivals-heading"
        title="تازه‌ها"
        subtitle="جدیدترین کالاهای منتشرشده در فروشگاه"
        actionHref="/products?sort=newest"
        products={newest}
      />

      <BrandShowcase groups={brandRails} />

      <BlogTeaser />
    </div>
  );
}

/**
 * One bounded product query that degrades to an empty collection. The
 * homepage sections treat an API failure exactly like an empty result, so a
 * down catalog cannot take down unrelated sections.
 */
async function productItems(
  query: Parameters<typeof fetchProducts>[0],
): Promise<CatalogProductCardDto[]> {
  try {
    return (await fetchProducts(query)).items;
  } catch {
    return [];
  }
}
