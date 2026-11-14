// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PublishedHomepageSection } from '@sabz/types'
import { allSectionsFixture, publishedHomepageFixture } from '@/lib/__fixtures__/published-homepage'

vi.mock('@/components/ecommerce/hero/hero-slider', () => ({
  HeroStage: ({ slides }: { slides: unknown[] }) => (
    <div data-testid="hero" data-count={slides.length} />
  ),
}))

vi.mock('@/components/ecommerce/trust/trust-strip', () => ({
  TrustStrip: ({ items }: { items: unknown[] }) => (
    <div data-testid="trust" data-count={items.length} />
  ),
}))

vi.mock('@/components/ecommerce/home/category-discovery', () => ({
  CategoryDiscovery: ({ categories }: { categories: unknown[] }) => (
    <div data-testid="discovery" data-count={categories.length} />
  ),
}))

vi.mock('@/components/ecommerce/home/offer-strip', () => ({
  OfferStrip: ({
    mode,
    heading,
    products,
  }: {
    mode: string
    heading: { title: string | null; actionHref: string | null }
    products: unknown[]
  }) => (
    <div
      data-testid="offer"
      data-mode={mode}
      data-title={heading.title ?? ''}
      data-action={heading.actionHref ?? ''}
      data-count={products.length}
    />
  ),
}))

vi.mock('@/components/ecommerce/home/category-spotlight', () => ({
  CategorySpotlight: ({
    section,
  }: {
    section: { category: { name: string }; secondaryCount: number | null }
  }) => (
    <div
      data-testid="spotlight"
      data-category={section.category.name}
      data-secondary={section.secondaryCount ?? ''}
    />
  ),
}))

vi.mock('@/components/ecommerce/home/compact-product-list', () => ({
  CompactProductList: ({
    products,
    title,
  }: {
    products: unknown[]
    title: string | null
  }) => (
    <div data-testid="ready" data-count={products.length} data-title={title ?? ''} />
  ),
}))

vi.mock('@/components/ecommerce/home/product-rail', () => ({
  ProductRail: ({
    id,
    title,
    products,
    actionHref,
  }: {
    id: string
    title: string
    products: unknown[]
    actionHref?: string
  }) => (
    <div
      data-testid="rail"
      data-id={id}
      data-title={title}
      data-count={products.length}
      data-action={actionHref ?? ''}
    />
  ),
}))

vi.mock('@/components/ecommerce/brand/brand-showcase', () => ({
  BrandShowcase: ({ groups }: { groups: unknown[] }) => (
    <div data-testid="brands" data-count={groups.length} />
  ),
}))

vi.mock('@/components/ecommerce/blog/blog-feature', () => ({
  BlogFeature: ({ posts }: { posts: unknown[] }) => (
    <div data-testid="blog" data-count={posts.length} />
  ),
}))

import { PublishedHomepage } from '@/components/ecommerce/home/published-homepage'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('PublishedHomepage', () => {
  it('renders all nine published section types in API order', () => {
    render(<PublishedHomepage homepage={publishedHomepageFixture()} />)

    const rendered = [
      ...document.querySelectorAll<HTMLElement>('[data-testid]'),
    ].map((node) => node.dataset.testid)
    expect(rendered).toEqual([
      'hero',
      'trust',
      'discovery',
      'offer',
      'spotlight',
      'ready',
      'rail',
      'brands',
      'blog',
    ])
  })

  it('maps published fields into each renderer', () => {
    render(<PublishedHomepage homepage={publishedHomepageFixture()} />)

    expect(screen.getByTestId('hero').dataset.count).toBe('2')
    expect(screen.getByTestId('trust').dataset.count).toBe('4')
    expect(screen.getByTestId('discovery').dataset.count).toBe('2')
    expect(screen.getByTestId('offer')).toMatchObject({
      dataset: expect.objectContaining({
        mode: 'offer',
        title: 'پیشنهاد آزمون',
        action: '/products',
        count: '2',
      }),
    })
    expect(screen.getByTestId('spotlight').dataset).toMatchObject({
      category: 'دسته ویژه',
      secondary: '3',
    })
    expect(screen.getByTestId('ready').dataset).toMatchObject({
      count: '1',
      title: 'آماده ارسال آزمون',
    })
    expect(screen.getByTestId('rail').dataset).toMatchObject({
      id: 'homepage-rail-rail',
      title: 'ریل آزمون',
      count: '2',
      action: '/products?sort=newest',
    })
    expect(screen.getByTestId('brands').dataset.count).toBe('1')
    expect(screen.getByTestId('blog').dataset.count).toBe('2')
  })


  it('rejects unsafe and missing product-rail action destinations', () => {
    const base = allSectionsFixture()
    const renderRail = (actionHref: string | null) =>
      render(
        <PublishedHomepage
          homepage={publishedHomepageFixture({
            sections: [
              {
                ...base[6]!,
                actionHref,
              } as PublishedHomepageSection,
            ],
          })}
        />,
      )

    const unsafe = renderRail('javascript:alert(1)')
    expect(screen.getByTestId('rail').dataset.action).toBe('')
    unsafe.unmount()

    renderRail(null)
    expect(screen.getByTestId('rail').dataset.action).toBe('')
  })

  it('does not render any section absent from the payload', () => {
    const sections = [allSectionsFixture()[1]!]
    render(
      <PublishedHomepage
        homepage={publishedHomepageFixture({ sections })}
      />,
    )

    expect(screen.getByTestId('trust')).toBeTruthy()
    expect(screen.queryByTestId('hero')).toBeNull()
    expect(screen.queryByTestId('blog')).toBeNull()
  })

  it('skips unknown section types and keeps the remaining sections', () => {
    const unknown = {
      key: 'future',
      type: 'FUTURE_SECTION',
      order: 1,
      settings: {},
    } as unknown as PublishedHomepageSection
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const sections = [
      allSectionsFixture()[1]!,
      unknown,
      null as unknown as PublishedHomepageSection,
      allSectionsFixture()[2]!,
    ]

    render(
      <PublishedHomepage homepage={publishedHomepageFixture({ sections })} />,
    )

    expect(screen.getByTestId('trust')).toBeTruthy()
    expect(screen.getByTestId('discovery')).toBeTruthy()
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('Skipping unknown section type=FUTURE_SECTION'),
    )
    expect(log).toHaveBeenCalledWith(
      '[storefront:homepage] Skipping malformed non-object section',
    )
  })

  it('skips a malformed known section without breaking valid siblings', () => {
    const malformed = {
      key: 'broken-hero',
      type: 'HERO_CAROUSEL',
      order: 0,
    } as unknown as PublishedHomepageSection
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <PublishedHomepage
        homepage={publishedHomepageFixture({
          sections: [malformed, allSectionsFixture()[1]!],
        })}
      />,
    )

    expect(screen.queryByTestId('hero')).toBeNull()
    expect(screen.getByTestId('trust')).toBeTruthy()
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('Skipping malformed section type=HERO_CAROUSEL'),
    )
  })
})
