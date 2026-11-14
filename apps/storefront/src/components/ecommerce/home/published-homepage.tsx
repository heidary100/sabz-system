import type { ReactNode } from 'react'
import type {
  HomepageSectionType,
  PublishedBlogFeatureSection,
  PublishedBrandShowcaseSection,
  PublishedCategoryDiscoverySection,
  PublishedCategorySpotlightSection,
  PublishedHeroCarouselSection,
  PublishedHomepageDto,
  PublishedHomepageSection,
  PublishedOfferStripSection,
  PublishedProductRailSection,
  PublishedReadyToShipSection,
  PublishedTrustStripSection,
} from '@sabz/types'
import { HeroStage } from '@/components/ecommerce/hero/hero-slider'
import { TrustStrip } from '@/components/ecommerce/trust/trust-strip'
import { CategoryDiscovery } from '@/components/ecommerce/home/category-discovery'
import { OfferStrip } from '@/components/ecommerce/home/offer-strip'
import { CategorySpotlight } from '@/components/ecommerce/home/category-spotlight'
import { CompactProductList } from '@/components/ecommerce/home/compact-product-list'
import { ProductRail } from '@/components/ecommerce/home/product-rail'
import { BrandShowcase } from '@/components/ecommerce/brand/brand-showcase'
import { BlogFeature } from '@/components/ecommerce/blog/blog-feature'
import {
  isKnownHomepageSectionType,
  readSectionIdentity,
  isCampaignCopy,
  isPublishedCategoryTile,
  safeInternalHref,
  toBlogPosts,
  toBrandGroups,
  toCategoryViews,
  toHeroSlides,
  toOfferHeading,
  toProductCards,
  toTrustItems,
} from '@/lib/homepage-view'

/**
 * Renders the published homepage sections in API array order.
 *
 * Only sections present in the resolved publication are rendered. Unknown or
 * malformed sections are skipped with a sanitized server log; there is no
 * static section, catalog query, or blog query fallback.
 */
export function PublishedHomepage({
  homepage,
}: {
  homepage: PublishedHomepageDto
}) {
  return (
    <>
      {homepage.sections.map((section, index) =>
        renderSection(section, index),
      )}
    </>
  )
}

function renderSection(
  section: PublishedHomepageSection,
  index: number,
): ReactNode {
  if (!isRecord(section)) {
    console.error('[storefront:homepage] Skipping malformed non-object section')
    return null
  }
  const { type, key } = readSectionIdentity(section)
  if (!isKnownHomepageSectionType(type)) {
    console.error(
      `[storefront:homepage] Skipping unknown section type=${String(type)} key=${String(key)}`,
    )
    return null
  }
  if (typeof key !== 'string' || key.length === 0) {
    logMalformed(type, key, 'missing section key')
    return null
  }
  if (section.order !== index) {
    console.error(
      `[storefront:homepage] Section order mismatch type=${type} key=${key} expected=${index} received=${String(section.order)}`,
    )
  }

  switch (type) {
    case 'HERO_CAROUSEL':
      return renderHero(section, key)
    case 'TRUST_STRIP':
      return renderTrust(section, key)
    case 'CATEGORY_DISCOVERY':
      return renderCategoryDiscovery(section, key)
    case 'OFFER_STRIP':
      return renderOffer(section, key)
    case 'CATEGORY_SPOTLIGHT':
      return renderSpotlight(section, key)
    case 'READY_TO_SHIP':
      return renderReadyToShip(section, key)
    case 'PRODUCT_RAIL':
      return renderProductRail(section, key)
    case 'BRAND_SHOWCASE':
      return renderBrandShowcase(section, key)
    case 'BLOG_FEATURE':
      return renderBlogFeature(section, key)
    default: {
      const exhaustive: never = type
      return exhaustive
    }
  }
}

function renderHero(
  section: PublishedHomepageSection,
  key: string,
): ReactNode {
  const typed = section as PublishedHeroCarouselSection
  if (!Array.isArray(typed.slides)) {
    return logMalformed('HERO_CAROUSEL', key, 'missing slides')
  }
  const slides = toHeroSlides(typed.slides)
  if (slides.length === 0) {
    return logMalformed('HERO_CAROUSEL', key, 'no valid slides')
  }
  return <HeroStage key={key} slides={slides} />
}

function renderTrust(
  section: PublishedHomepageSection,
  key: string,
): ReactNode {
  const typed = section as PublishedTrustStripSection
  if (!Array.isArray(typed.items)) {
    return logMalformed('TRUST_STRIP', key, 'missing items')
  }
  const items = toTrustItems(typed.items)
  if (items.length === 0) {
    return logMalformed('TRUST_STRIP', key, 'no valid items')
  }
  return <TrustStrip key={key} id={`homepage-section-${key}`} items={items} />
}

function renderCategoryDiscovery(
  section: PublishedHomepageSection,
  key: string,
): ReactNode {
  const typed = section as PublishedCategoryDiscoverySection
  if (!Array.isArray(typed.categories)) {
    return logMalformed('CATEGORY_DISCOVERY', key, 'missing categories')
  }
  const categories = toCategoryViews(typed.categories)
  if (categories.length === 0) {
    return logMalformed('CATEGORY_DISCOVERY', key, 'no valid categories')
  }
  return (
    <CategoryDiscovery
      key={key}
      id={`homepage-section-${key}`}
      categories={categories}
    />
  )
}

function renderOffer(
  section: PublishedHomepageSection,
  key: string,
): ReactNode {
  const typed = section as PublishedOfferStripSection
  if (!Array.isArray(typed.products) || !isCampaignCopy(typed.copy)) {
    return logMalformed('OFFER_STRIP', key, 'missing products or copy')
  }
  if (typed.mode !== 'offer' && typed.mode !== 'featured') {
    return logMalformed('OFFER_STRIP', key, 'invalid mode')
  }
  const products = toProductCards(typed.products)
  if (products.length === 0) {
    return logMalformed('OFFER_STRIP', key, 'no valid products')
  }
  return (
    <OfferStrip
      key={key}
      id={`homepage-section-${key}`}
      products={products}
      mode={typed.mode}
      endsAt={isNullableString(typed.endsAt) ? typed.endsAt : null}
      heading={toOfferHeading(typed.copy)}
    />
  )
}

function renderSpotlight(
  section: PublishedHomepageSection,
  key: string,
): ReactNode {
  const typed = section as PublishedCategorySpotlightSection
  if (
    !isPublishedCategoryTile(typed.category) ||
    !isCampaignCopy(typed.copy)
  ) {
    return logMalformed('CATEGORY_SPOTLIGHT', key, 'invalid category or copy')
  }
  return <CategorySpotlight key={key} section={typed} />
}

function renderReadyToShip(
  section: PublishedHomepageSection,
  key: string,
): ReactNode {
  const typed = section as PublishedReadyToShipSection
  if (!Array.isArray(typed.products)) {
    return logMalformed('READY_TO_SHIP', key, 'missing products')
  }
  const products = toProductCards(typed.products)
  if (products.length === 0) {
    return logMalformed('READY_TO_SHIP', key, 'no valid products')
  }
  return (
    <CompactProductList
      key={key}
      id={`homepage-section-${key}`}
      products={products}
      title={isNullableString(typed.title) ? typed.title : null}
      subtitle={isNullableString(typed.subtitle) ? typed.subtitle : null}
    />
  )
}

function renderProductRail(
  section: PublishedHomepageSection,
  key: string,
): ReactNode {
  const typed = section as PublishedProductRailSection
  if (
    typeof typed.title !== 'string' ||
    typed.title.trim() === '' ||
    !Array.isArray(typed.products)
  ) {
    return logMalformed('PRODUCT_RAIL', key, 'missing title or products')
  }
  const products = toProductCards(typed.products)
  if (products.length === 0) {
    return logMalformed('PRODUCT_RAIL', key, 'no valid products')
  }
  return (
    <ProductRail
      key={key}
      id={`homepage-rail-${key}`}
      title={typed.title}
      subtitle={
        isNullableString(typed.subtitle) ? typed.subtitle ?? undefined : undefined
      }
      actionHref={
        safeInternalHref(
          isNullableString(typed.actionHref) ? typed.actionHref : null,
        ) ?? undefined
      }
      products={products}
    />
  )
}

function renderBrandShowcase(
  section: PublishedHomepageSection,
  key: string,
): ReactNode {
  const typed = section as PublishedBrandShowcaseSection
  if (!Array.isArray(typed.groups)) {
    return logMalformed('BRAND_SHOWCASE', key, 'missing groups')
  }
  const groups = toBrandGroups(typed.groups)
  if (groups.length === 0) {
    return logMalformed('BRAND_SHOWCASE', key, 'no valid groups')
  }
  return (
    <BrandShowcase
      key={key}
      id={`homepage-section-${key}`}
      groups={groups}
    />
  )
}

function renderBlogFeature(
  section: PublishedHomepageSection,
  key: string,
): ReactNode {
  const typed = section as PublishedBlogFeatureSection
  if (!Array.isArray(typed.posts)) {
    return logMalformed('BLOG_FEATURE', key, 'missing posts')
  }
  const posts = toBlogPosts(typed.posts)
  if (posts.length === 0) {
    return logMalformed('BLOG_FEATURE', key, 'no valid posts')
  }
  return (
    <BlogFeature
      key={key}
      id={`homepage-section-${key}`}
      posts={posts}
    />
  )
}

function logMalformed(
  type: HomepageSectionType,
  key: unknown,
  reason: string,
): null {
  console.error(
    `[storefront:homepage] Skipping malformed section type=${type} key=${String(key)}: ${reason}`,
  )
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}
