import { describe, expect, it, vi } from 'vitest'
import type { PublishedHeroSlide } from '@sabz/types'
import { allSectionsFixture, blogCard, categoryTile, productCard } from './__fixtures__/published-homepage'

vi.mock('@/lib/catalog', () => ({
  mediaUrl: (path: string | null | undefined) =>
    path ? new URL(path, 'https://media.example/api/v1').toString() : null,
  mediaImageUrl: (path: string | null | undefined) =>
    path
      ? new URL(path, 'https://optimizer.example/api/v1').toString()
      : null,
}))

import {
  isKnownHomepageSectionType,
  safeInternalHref,
  toBlogPosts,
  toBrandGroups,
  toCategoryViews,
  toHeroSlides,
  toOfferHeading,
} from './homepage-view'

function heroSlide(overrides: Partial<PublishedHeroSlide> = {}): PublishedHeroSlide {
  return {
    campaignType: 'SEASONAL',
    eyebrowFa: 'ویژه',
    titleFa: 'عنوان',
    subtitleFa: 'زیرعنوان',
    ctaLabel: 'مشاهده',
    cta: { kind: 'ALL_PRODUCTS' },
    href: '/products',
    desktopImageUrl: '/api/v1/catalog/merch-media/desktop',
    mobileImageUrl: '/api/v1/catalog/merch-media/mobile',
    focalX: 20,
    focalY: 80,
    altFa: 'تصویر',
    images: [],
    ...overrides,
  }
}

describe('homepage section adapters', () => {
  it('maps published hero fields and resolves media against the API origins', () => {
    const [slide] = toHeroSlides([
      heroSlide({
        images: [
          '/api/v1/catalog/media/one/thumbnail',
          'https://cdn.example/absolute.jpg',
          'javascript:alert(1)',
        ],
      }),
    ])

    expect(slide).toMatchObject({
      eyebrow: 'ویژه',
      title: 'عنوان',
      subtitle: 'زیرعنوان',
      href: '/products',
      ctaLabel: 'مشاهده',
      desktopImageUrl: 'https://media.example/api/v1/catalog/merch-media/desktop',
      mobileImageUrl: 'https://media.example/api/v1/catalog/merch-media/mobile',
      focalX: 20,
      focalY: 80,
      altFa: 'تصویر',
    })
    expect(slide!.images).toEqual([
      'https://optimizer.example/api/v1/catalog/media/one/thumbnail',
      'https://cdn.example/absolute.jpg',
    ])
  })

  it('keeps nullable hero CTA and media fields nullable', () => {
    const [slide] = toHeroSlides([
      heroSlide({
        eyebrowFa: null,
        subtitleFa: null,
        ctaLabel: null,
        href: null,
        desktopImageUrl: null,
        mobileImageUrl: null,
        altFa: null,
        focalX: -20,
        focalY: 180,
      }),
    ])

    expect(slide).toMatchObject({
      eyebrow: null,
      subtitle: null,
      href: null,
      ctaLabel: null,
      desktopImageUrl: null,
      mobileImageUrl: null,
      altFa: null,
      focalX: 0,
      focalY: 100,
    })
  })

  it('drops hero slides without a usable title and preserves order', () => {
    const slides = toHeroSlides([
      heroSlide({ titleFa: 'یکی' }),
      heroSlide({ titleFa: '' }),
      heroSlide({ titleFa: 'سه' }),
    ])

    expect(slides.map((slide) => slide.title)).toEqual(['یکی', 'سه'])
  })

  it('maps category tiles and resolves covers for the image optimizer', () => {
    const [tile] = toCategoryViews([
      categoryTile('a', { coverUrl: '/api/v1/catalog/media/a/thumbnail' }),
      categoryTile('b', { coverUrl: null }),
    ])

    expect(tile).toMatchObject({
      id: 'a',
      name: 'دسته a',
      slug: 'category-a',
      publishedProductCount: 4,
      coverUrl:
        'https://optimizer.example/api/v1/catalog/media/a/thumbnail',
    })
    expect(
      toCategoryViews([categoryTile('b', { coverUrl: null })])[0]!.coverUrl,
    ).toBeNull()
  })


  it('preserves every published blog field while resolving its cover', () => {
    const [post] = toBlogPosts([
      blogCard('fields', {
        title: 'عنوان کامل',
        excerpt: 'خلاصه',
        category: { name: 'دسته', slug: 'cat' },
        authorName: 'نویسنده',
        publishedAt: '2026-11-01T00:00:00.000Z',
        coverImageUrl: '/api/v1/catalog/media/fields',
      }),
    ])

    expect(post).toMatchObject({
      id: 'fields',
      slug: 'post-fields',
      title: 'عنوان کامل',
      excerpt: 'خلاصه',
      category: { name: 'دسته', slug: 'cat' },
      authorName: 'نویسنده',
      publishedAt: '2026-11-01T00:00:00.000Z',
      coverImageUrl: 'https://media.example/api/v1/catalog/media/fields',
    })
  })

  it('resolves relative blog covers and preserves absolute external covers', () => {
    const posts = toBlogPosts([
      blogCard('1', { coverImageUrl: '/api/v1/catalog/media/blog-1' }),
      blogCard('2', { coverImageUrl: 'https://cdn.example/cover.jpg' }),
      blogCard('3', { coverImageUrl: null }),
    ])

    expect(posts.map((post) => post.coverImageUrl)).toEqual([
      'https://media.example/api/v1/catalog/media/blog-1',
      'https://cdn.example/cover.jpg',
      null,
    ])
  })

  it('maps nested brand groups without inventing logos or names', () => {
    const groups = toBrandGroups([
      {
        brand: { name: 'برند الف', slug: 'brand-a' },
        products: [productCard('a-1')],
      },
    ])

    expect(groups).toEqual([
      {
        name: 'برند الف',
        slug: 'brand-a',
        products: [productCard('a-1')],
      },
    ])
  })

  it('maps campaign copy and only accepts internal CTA destinations', () => {
    const section = allSectionsFixture().find(
      (item) => item.type === 'OFFER_STRIP',
    )!
    const heading = toOfferHeading(section.copy)

    expect(heading).toEqual({
      eyebrow: 'ویژه',
      title: 'پیشنهاد آزمون',
      subtitle: 'زیرعنوان کمپین',
      actionLabel: 'مشاهده',
      actionHref: '/products',
    })
    expect(safeInternalHref('https://example.com')).toBeNull()
    expect(safeInternalHref('//example.com')).toBeNull()
    expect(safeInternalHref('/categories/a')).toBe('/categories/a')
  })

  it('recognizes only the nine supported section types', () => {
    expect(isKnownHomepageSectionType('BLOG_FEATURE')).toBe(true)
    expect(isKnownHomepageSectionType('FUTURE_SECTION')).toBe(false)
    expect(isKnownHomepageSectionType(null)).toBe(false)
  })
})
