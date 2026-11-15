// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  CatalogProductCardDto,
  PublishedHomepageSection,
  PublishedOfferStripSection,
  PublishedTrustStripSection,
} from '@sabz/types'
import {
  allSectionsFixture,
  blogCard,
  campaignCopy,
  categoryTile,
  productCard,
  publishedHomepageFixture,
} from '@/lib/__fixtures__/published-homepage'

vi.mock('next/link', () => ({
  default: function MockLink({
    href,
    children,
    ...props
  }: {
    href: string
    children: React.ReactNode
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    )
  },
}))

vi.mock('next/image', () => ({
  default: function MockImage({
    src,
    alt,
    className,
  }: {
    src: string
    alt: string
    className?: string
  }) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} className={className} />
  },
}))

vi.mock('@/components/ecommerce/wishlist/product-card-wishlist', () => ({
  ProductCardWithWishlist: ({
    product,
  }: {
    product: CatalogProductCardDto
  }) => <div data-testid="product-card">{product.name}</div>,
}))

import { PublishedHomepage } from '@/components/ecommerce/home/published-homepage'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function trustSection(
  key: string,
  order: number,
  items: unknown[],
): PublishedTrustStripSection {
  return {
    key,
    type: 'TRUST_STRIP',
    order,
    items: items as PublishedTrustStripSection['items'],
  }
}

function offerSection(
  key: string,
  order: number,
  products: unknown[],
): PublishedOfferStripSection {
  return {
    key,
    type: 'OFFER_STRIP',
    order,
    products: products as PublishedOfferStripSection['products'],
    mode: 'offer',
    endsAt: null,
    copy: campaignCopy({ titleFa: `پیشنهاد ${key}` }),
  }
}

describe('PublishedHomepage nested payload resilience', () => {
  it('filters malformed trust items while preserving valid item order', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const validA = { icon: 'truck' as const, title: 'اول' }
    const validB = { icon: 'shield' as const, title: 'دوم', body: 'توضیح' }

    render(
      <PublishedHomepage
        homepage={publishedHomepageFixture({
          sections: [
            trustSection('trust-a', 0, [validA, null, { icon: 'bad' }, validB]),
            allSectionsFixture()[8]!,
          ],
        })}
      />,
    )

    const trust = document.querySelector('[data-home-section="trust"]')!
    expect(trust.textContent?.indexOf('اول')).toBeLessThan(
      trust.textContent?.indexOf('دوم') ?? -1,
    )
    expect(screen.getByText('اول')).toBeTruthy()
    expect(screen.getByText('دوم')).toBeTruthy()
    expect(screen.getByText('توضیح')).toBeTruthy()
    expect(screen.queryByText('bad')).toBeNull()
    expect(document.querySelectorAll('[data-home-section="trust"]')).toHaveLength(
      1,
    )
    expect(log).not.toHaveBeenCalledWith(
      expect.stringContaining('no valid items'),
    )
  })

  it('filters malformed offer, ready, rail and brand products without throwing', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const validA = productCard('pc-a', { name: 'کالای الف' })
    const validB = productCard('pc-b', { name: 'کالای ب' })
    const bareValid = productCard('pc-c', { name: 'کالای پ' })
    const bareValid2 = productCard('pc-d', { name: 'کالای ت' })
    const base = allSectionsFixture()

    const offer = offerSection('offer-mixed', 0, [
      validA,
      null,
      { id: 'broken' },
      validB,
    ])
    const ready = {
      ...base[5]!,
      key: 'ready-mixed',
      order: 1,
      products: [validA, null, {}, validB],
      title: 'آماده آزمون',
    } as PublishedHomepageSection
    const rail = {
      ...base[6]!,
      key: 'rail-mixed',
      order: 2,
      products: [bareValid, null, {}, bareValid2],
    } as PublishedHomepageSection
    const brand = {
      ...base[7]!,
      key: 'brand-mixed',
      order: 3,
      groups: [
        {
          brand: { name: 'برند آزمون', slug: 'brand-test' },
          products: [validA, null, {}, validB],
        },
      ],
    } as PublishedHomepageSection

    render(
      <PublishedHomepage
        homepage={publishedHomepageFixture({ sections: [offer, ready, rail, brand] })}
      />,
    )

    expect(screen.getAllByTestId('product-card').map((node) => node.textContent)).toEqual([
      'کالای الف',
      'کالای ب',
      'کالای الف',
      'کالای ب',
      'کالای پ',
      'کالای ت',
      'کالای الف',
      'کالای ب',
    ])
  })

  it('filters malformed blog posts and skips a section with no valid entries', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const valid = blogCard('valid', { title: 'مقاله سالم' })
    const after = blogCard('after', { title: 'مقاله بعدی' })
    const base = allSectionsFixture()

    render(
      <PublishedHomepage
        homepage={publishedHomepageFixture({
          sections: [
            trustSection('trust-empty', 0, [null, {}, { icon: 'x' }]),
            {
              ...base[8]!,
              key: 'blog-mixed',
              order: 1,
              posts: [valid, null, {}, after],
            } as unknown as PublishedHomepageSection,
            allSectionsFixture()[2]!,
          ],
        })}
      />,
    )

    expect(document.querySelector('[data-home-section="trust"]')).toBeNull()
    expect(screen.getByText('مقاله سالم')).toBeTruthy()
    expect(screen.getByText('مقاله بعدی')).toBeTruthy()
    expect(document.querySelector('[data-home-section="categories"]')).toBeTruthy()
  })

  it('keeps valid sibling sections when a known section has malformed nested values', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const base = allSectionsFixture()
    const malformedOffer = {
      ...base[3]!,
      key: 'offer-broken',
      order: 1,
      products: [null, {}],
    } as PublishedHomepageSection
    const validTrust = trustSection('trust-valid', 0, [
      { icon: 'truck', title: 'نوار سالم' },
    ])
    const validBlog = {
      ...base[8]!,
      key: 'blog-valid',
      order: 2,
    } as PublishedHomepageSection

    render(
      <PublishedHomepage
        homepage={publishedHomepageFixture({
          sections: [validTrust, malformedOffer, validBlog],
        })}
      />,
    )

    expect(screen.getByText('نوار سالم')).toBeTruthy()
    expect(screen.getAllByText('مقاله 1')).toHaveLength(1)
    expect(document.querySelector('[data-home-section="offer"]')).toBeNull()
  })
})

describe('PublishedHomepage repeated section IDs', () => {
  it('keeps all heading IDs unique and every aria-labelledby resolvable', () => {
    const base = allSectionsFixture()
    const sections: PublishedHomepageSection[] = [
      trustSection('trust-one', 0, [{ icon: 'truck', title: 'اعتماد یک' }]),
      trustSection('trust-two', 1, [{ icon: 'shield', title: 'اعتماد دو' }]),
      offerSection('offer-one', 2, [productCard('o-1')]),
      offerSection('offer-two', 3, [productCard('o-2')]),
      { ...base[5]!, key: 'ready-one', order: 4 } as PublishedHomepageSection,
      { ...base[5]!, key: 'ready-two', order: 5 } as PublishedHomepageSection,
      { ...base[6]!, key: 'rail-one', order: 6 } as PublishedHomepageSection,
      { ...base[6]!, key: 'rail-two', order: 7 } as PublishedHomepageSection,
      {
        ...base[2]!,
        key: 'discovery-one',
        order: 8,
        categories: [categoryTile('c1')],
      } as PublishedHomepageSection,
      {
        ...base[2]!,
        key: 'discovery-two',
        order: 9,
        categories: [categoryTile('c2')],
      } as PublishedHomepageSection,
      {
        ...base[7]!,
        key: 'brand-one',
        order: 10,
        groups: [
          { brand: { name: 'برند یک', slug: 'brand-one' }, products: [productCard('b-1')] },
        ],
      } as PublishedHomepageSection,
      {
        ...base[8]!,
        key: 'blog-one',
        order: 11,
        posts: [blogCard('blog-1')],
      } as PublishedHomepageSection,
    ]

    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = render(
      <PublishedHomepage homepage={publishedHomepageFixture({ sections })} />,
    )

    const ids = [...container.querySelectorAll<HTMLElement>('[id]')].map(
      (element) => element.id,
    )
    const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index)
    expect(duplicateIds).toEqual([])
    expect(new Set(ids).size).toBe(ids.length)

    for (const element of container.querySelectorAll<HTMLElement>(
      '[aria-labelledby]',
    )) {
      const reference = element.getAttribute('aria-labelledby')
      if (!reference) continue
      for (const id of reference.split(/\s+/)) {
        expect(
          [...container.querySelectorAll('[id]')].filter(
            (candidate) => candidate.getAttribute('id') === id,
          ),
          `aria-labelledby target ${id} must resolve exactly once`,
        ).toHaveLength(1)
      }
    }
  })
})
