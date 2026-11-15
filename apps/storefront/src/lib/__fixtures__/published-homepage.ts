import type {
  BlogPostCardDto,
  CatalogProductCardDto,
  PublishedCampaignCopy,
  PublishedCategoryTile,
  PublishedHomepageDto,
  PublishedHomepageSection,
} from '@sabz/types'

export function productCard(
  id: string,
  overrides: Partial<CatalogProductCardDto> = {},
): CatalogProductCardDto {
  return {
    id,
    name: `محصول ${id}`,
    slug: `product-${id}`,
    condition: 'NEW',
    brand: { name: 'برند آزمون', slug: 'test-brand' },
    category: { name: 'دسته آزمون', slug: 'test-category' },
    priceFrom: '1000000',
    compareAtPrice: null,
    callForPrice: false,
    promotionEndsAt: null,
    variantCount: 1,
    inStock: true,
    ratingAverage: null,
    ratingCount: 0,
    primaryImageUrl: `/api/v1/catalog/media/${id}`,
    primaryThumbnailUrl: `/api/v1/catalog/media/${id}/thumbnail`,
    ...overrides,
  }
}

export function blogCard(
  id: string,
  overrides: Partial<BlogPostCardDto> = {},
): BlogPostCardDto {
  return {
    id,
    slug: `post-${id}`,
    title: `مقاله ${id}`,
    excerpt: `خلاصه مقاله ${id}`,
    coverImageUrl: `/api/v1/catalog/media/${id}`,
    category: { name: 'راهنما', slug: 'guides' },
    authorName: 'تحریریه',
    publishedAt: '2026-11-01T10:00:00.000Z',
    ...overrides,
  }
}

export function categoryTile(
  id: string,
  overrides: Partial<PublishedCategoryTile> = {},
): PublishedCategoryTile {
  return {
    id,
    name: `دسته ${id}`,
    slug: `category-${id}`,
    publishedProductCount: 4,
    coverUrl: `/api/v1/catalog/media/${id}/thumbnail`,
    ...overrides,
  }
}

export function campaignCopy(
  overrides: Partial<PublishedCampaignCopy> = {},
): PublishedCampaignCopy {
  return {
    campaignType: 'SEASONAL',
    eyebrowFa: 'ویژه',
    titleFa: 'عنوان کمپین',
    subtitleFa: 'زیرعنوان کمپین',
    ctaLabelFa: 'مشاهده',
    cta: { kind: 'ALL_PRODUCTS' },
    href: '/products',
    ...overrides,
  }
}

export function allSectionsFixture(): PublishedHomepageSection[] {
  return [
    {
      key: 'hero',
      type: 'HERO_CAROUSEL',
      order: 0,
      slides: [
        {
          campaignType: 'SEASONAL',
          eyebrowFa: 'پیشنهاد فصل',
          titleFa: 'اسلاید نخست',
          subtitleFa: 'زیرعنوان نخست',
          ctaLabel: 'مشاهده دسته',
          cta: { kind: 'CATEGORY', categoryId: 'category-b' },
          href: '/categories/category-b',
          desktopImageUrl: '/api/v1/catalog/merch-media/hero-desktop',
          mobileImageUrl: '/api/v1/catalog/merch-media/hero-mobile',
          focalX: 30,
          focalY: 40,
          altFa: 'تصویر کمپین نخست',
          images: [],
        },
        {
          campaignType: 'EDITORIAL',
          eyebrowFa: null,
          titleFa: 'اسلاید دوم',
          subtitleFa: null,
          ctaLabel: null,
          cta: { kind: 'NONE' },
          href: null,
          desktopImageUrl: null,
          mobileImageUrl: null,
          focalX: 50,
          focalY: 50,
          altFa: null,
          images: ['/api/v1/catalog/media/fallback'],
        },
      ],
    },
    {
      key: 'trust',
      type: 'TRUST_STRIP',
      order: 1,
      items: [
        { icon: 'truck', title: 'ارسال آزمون' },
        { icon: 'shield', title: 'ضمانت آزمون', body: 'توضیح' },
        { icon: 'badge', title: 'اصالت آزمون' },
        { icon: 'support', title: 'پشتیبانی آزمون' },
      ],
    },
    {
      key: 'discovery',
      type: 'CATEGORY_DISCOVERY',
      order: 2,
      categories: [categoryTile('a'), categoryTile('b')],
    },
    {
      key: 'offer',
      type: 'OFFER_STRIP',
      order: 3,
      products: [productCard('offer-1'), productCard('offer-2')],
      mode: 'offer',
      endsAt: null,
      copy: campaignCopy({ titleFa: 'پیشنهاد آزمون', href: '/products' }),
    },
    {
      key: 'spotlight',
      type: 'CATEGORY_SPOTLIGHT',
      order: 4,
      category: categoryTile('b', { name: 'دسته ویژه' }),
      secondaryCount: 3,
      copy: campaignCopy({
        titleFa: 'دسته ویژه آزمون',
        eyebrowFa: 'دسته‌بندی ویژه',
        href: '/categories/category-b',
      }),
    },
    {
      key: 'ready',
      type: 'READY_TO_SHIP',
      order: 5,
      products: [productCard('ready-1')],
      title: 'آماده ارسال آزمون',
      subtitle: null,
    },
    {
      key: 'rail',
      type: 'PRODUCT_RAIL',
      order: 6,
      title: 'ریل آزمون',
      subtitle: 'زیرعنوان ریل',
      actionHref: '/products?sort=newest',
      products: [productCard('rail-1'), productCard('rail-2')],
    },
    {
      key: 'brands',
      type: 'BRAND_SHOWCASE',
      order: 7,
      groups: [
        {
          brand: { name: 'برند الف', slug: 'brand-a' },
          products: [productCard('brand-a-1')],
        },
      ],
    },
    {
      key: 'blog',
      type: 'BLOG_FEATURE',
      order: 8,
      posts: [blogCard('1'), blogCard('2')],
    },
  ]
}

export function publishedHomepageFixture(
  overrides: Partial<PublishedHomepageDto> = {},
): PublishedHomepageDto {
  return {
    version: 7,
    schemaVersion: 1,
    publishedAt: '2026-11-10T10:00:00.000Z',
    sections: allSectionsFixture(),
    ...overrides,
  }
}
