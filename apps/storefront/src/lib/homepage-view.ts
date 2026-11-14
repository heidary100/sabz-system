import type {
  BlogPostCardDto,
  CatalogProductCardDto,
  CatalogRefDto,
  HomepageSectionType,
  MerchTrustItem,
  PublishedCampaignCopy,
  PublishedCategoryTile,
  PublishedHeroSlide,
  PublishedHomepageSection,
} from '@sabz/types'
import { MERCH_TRUST_ICONS } from '@sabz/types'
import { mediaImageUrl, mediaUrl } from '@/lib/catalog'

/** Homepage section types supported by this storefront build. */
export const SUPPORTED_HOMEPAGE_SECTION_TYPES: readonly HomepageSectionType[] = [
  'HERO_CAROUSEL',
  'TRUST_STRIP',
  'CATEGORY_DISCOVERY',
  'OFFER_STRIP',
  'CATEGORY_SPOTLIGHT',
  'READY_TO_SHIP',
  'PRODUCT_RAIL',
  'BRAND_SHOWCASE',
  'BLOG_FEATURE',
]

export function isKnownHomepageSectionType(
  type: unknown,
): type is HomepageSectionType {
  return (
    typeof type === 'string' &&
    (SUPPORTED_HOMEPAGE_SECTION_TYPES as readonly string[]).includes(type)
  )
}

/** View model for the existing hero presentation. */
export interface HomepageHeroSlideView {
  eyebrow: string | null
  title: string
  subtitle: string | null
  href: string | null
  ctaLabel: string | null
  desktopImageUrl: string | null
  mobileImageUrl: string | null
  focalX: number
  focalY: number
  altFa: string | null
  images: string[]
}

/** Published tile with its cover resolved for the category presentation. */
export interface HomepageCategoryView {
  id: string
  name: string
  slug: string
  publishedProductCount: number
  coverUrl: string | null
}

export interface HomepageOfferHeading {
  eyebrow: string | null
  title: string | null
  subtitle: string | null
  actionLabel: string | null
  actionHref: string | null
}


export interface HomepageBrandGroupView {
  name: string
  slug: string
  products: CatalogProductCardDto[]
}

export function toTrustItems(items: readonly unknown[]): MerchTrustItem[] {
  return items.flatMap((value) => {
    if (!isTrustItem(value)) {
      return []
    }
    return [
      {
        icon: value.icon,
        title: value.title,
        ...(value.body === undefined ? {} : { body: value.body }),
      },
    ]
  })
}

export function toProductCards(
  products: readonly unknown[],
): CatalogProductCardDto[] {
  return products.filter(isProductCard)
}

export function isTrustItem(value: unknown): value is MerchTrustItem {
  return (
    isRecord(value) &&
    typeof value.icon === 'string' &&
    (MERCH_TRUST_ICONS as readonly string[]).includes(value.icon) &&
    typeof value.title === 'string' &&
    value.title.trim() !== '' &&
    (value.body === undefined || typeof value.body === 'string')
  )
}

export function isProductCard(value: unknown): value is CatalogProductCardDto {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.slug === 'string' &&
    typeof value.condition === 'string' &&
    (value.brand === null || isCatalogRef(value.brand)) &&
    isCatalogRef(value.category) &&
    typeof value.priceFrom === 'string' &&
    isNullableString(value.compareAtPrice) &&
    typeof value.callForPrice === 'boolean' &&
    isNullableString(value.promotionEndsAt) &&
    typeof value.variantCount === 'number' &&
    Number.isFinite(value.variantCount) &&
    typeof value.inStock === 'boolean' &&
    (value.ratingAverage === null ||
      (typeof value.ratingAverage === 'number' &&
        Number.isFinite(value.ratingAverage))) &&
    typeof value.ratingCount === 'number' &&
    Number.isFinite(value.ratingCount) &&
    isNullableString(value.primaryImageUrl) &&
    isNullableString(value.primaryThumbnailUrl)
  )
}

export function isPublishedCategoryTile(
  value: unknown,
): value is PublishedCategoryTile {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.slug === 'string' &&
    typeof value.publishedProductCount === 'number' &&
    Number.isFinite(value.publishedProductCount) &&
    isNullableString(value.coverUrl)
  )
}

export function isCampaignCopy(
  value: unknown,
): value is PublishedCampaignCopy {
  return (
    isRecord(value) &&
    typeof value.campaignType === 'string' &&
    isNullableString(value.eyebrowFa) &&
    isNullableString(value.titleFa) &&
    isNullableString(value.subtitleFa) &&
    isNullableString(value.ctaLabelFa) &&
    isRecord(value.cta) &&
    isNullableString(value.href)
  )
}

export function isBlogPostCard(value: unknown): value is BlogPostCardDto {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.slug === 'string' &&
    typeof value.title === 'string' &&
    isNullableString(value.excerpt) &&
    isNullableString(value.coverImageUrl) &&
    (value.category === null || isCatalogRef(value.category)) &&
    isNullableString(value.authorName) &&
    isNullableString(value.publishedAt)
  )
}

function isCatalogRef(value: unknown): value is CatalogRefDto {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    typeof value.slug === 'string'
  )
}

export function toHeroSlides(
  slides: readonly unknown[],
): HomepageHeroSlideView[] {
  return slides.flatMap((value) => {
    const slide = value as PublishedHeroSlide
    if (
      !isRecord(value) ||
      typeof slide.titleFa !== 'string' ||
      slide.titleFa.trim() === '' ||
      !isNullableString(slide.eyebrowFa) ||
      !isNullableString(slide.subtitleFa) ||
      !isNullableString(slide.ctaLabel) ||
      !isNullableString(slide.altFa) ||
      !isNullableString(slide.desktopImageUrl) ||
      !isNullableString(slide.mobileImageUrl)
    ) {
      return []
    }
    return [
      {
        eyebrow: slide.eyebrowFa,
        title: slide.titleFa,
        subtitle: slide.subtitleFa,
        href: safeInternalHref(slide.href),
        ctaLabel: slide.ctaLabel,
        desktopImageUrl: safeMediaUrl(slide.desktopImageUrl),
        mobileImageUrl: safeMediaUrl(slide.mobileImageUrl),
        focalX: clampPercent(slide.focalX),
        focalY: clampPercent(slide.focalY),
        altFa: slide.altFa,
        images: Array.isArray(slide.images)
          ? slide.images.flatMap((image) => {
              const safe = safeMediaImageUrl(image)
              return safe ? [safe] : []
            })
          : [],
      },
    ]
  })
}

export function toCategoryViews(
  categories: readonly unknown[],
): HomepageCategoryView[] {
  return categories.flatMap((category) => {
    if (!isPublishedCategoryTile(category)) {
      return []
    }
    return [
      {
        id: category.id,
        name: category.name,
        slug: category.slug,
        publishedProductCount: category.publishedProductCount,
        coverUrl: safeMediaImageUrl(category.coverUrl),
      },
    ]
  })
}

export function toBlogPosts(
  posts: readonly unknown[],
): BlogPostCardDto[] {
  return posts.flatMap((value) => {
    if (!isBlogPostCard(value)) {
      return []
    }
    return [
      {
        ...value,
        coverImageUrl: safeMediaUrl(value.coverImageUrl),
      },
    ]
  })
}

export function toBrandGroups(
  groups: readonly unknown[],
): HomepageBrandGroupView[] {
  return groups.flatMap((value) => {
    if (
      !isRecord(value) ||
      !isCatalogRef(value.brand) ||
      !Array.isArray(value.products)
    ) {
      return []
    }
    const products = toProductCards(value.products)
    if (products.length === 0) {
      return []
    }
    return [
      {
        name: value.brand.name,
        slug: value.brand.slug,
        products,
      },
    ]
  })
}

export function toOfferHeading(
  copy: PublishedCampaignCopy,
): HomepageOfferHeading {
  return {
    eyebrow: copy.eyebrowFa,
    title: copy.titleFa,
    subtitle: copy.subtitleFa,
    actionLabel: copy.ctaLabelFa,
    actionHref: safeInternalHref(copy.href),
  }
}

/** Resolve an API media path for browser-fetched media (plain img/picture). */
export function safeMediaUrl(path: string | null | undefined): string | null {
  return safeAbsoluteUrl(path, mediaUrl)
}

/** Resolve an API media path for next/image (server-side optimizer). */
export function safeMediaImageUrl(
  path: string | null | undefined,
): string | null {
  return safeAbsoluteUrl(path, mediaImageUrl)
}

function safeAbsoluteUrl(
  path: string | null | undefined,
  resolve: (value: string) => string | null,
): string | null {
  if (typeof path !== 'string' || path.trim() === '') {
    return null
  }
  try {
    const resolved = resolve(path)
    if (!resolved) {
      return null
    }
    const url = new URL(resolved)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null
    }
    return resolved
  } catch {
    return null
  }
}

export function safeInternalHref(value: string | null): string | null {
  if (typeof value !== 'string' || value.trim() === '') {
    return null
  }
  return value.startsWith('/') && !value.startsWith('//') ? value : null
}

function clampPercent(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 50
  }
  return Math.min(100, Math.max(0, value))
}

/** Narrow a section enough to read its discriminator safely. */
export function readSectionIdentity(
  section: PublishedHomepageSection,
): { type: unknown; key: unknown } {
  const value = section as unknown as Record<string, unknown>
  return { type: value.type, key: value.key }
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
