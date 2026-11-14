// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PublishedCategorySpotlightSection } from '@sabz/types'
import { campaignCopy, categoryTile } from '@/lib/__fixtures__/published-homepage'
import { formatFaNumber } from '@/lib/format'

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

import { CategorySpotlight } from './category-spotlight'

function section(
  overrides: Partial<PublishedCategorySpotlightSection> = {},
): PublishedCategorySpotlightSection {
  return {
    key: 'spotlight',
    type: 'CATEGORY_SPOTLIGHT',
    order: 0,
    category: categoryTile('b', { name: 'دسته ویژه' }),
    secondaryCount: 3,
    copy: campaignCopy({
      eyebrowFa: 'دسته‌بندی ویژه',
      titleFa: 'عنوان ویژه',
      subtitleFa: 'توضیح ویژه',
      ctaLabelFa: 'مشاهده دسته',
      href: '/categories/category-b',
    }),
    ...overrides,
  }
}

afterEach(cleanup)

describe('CategorySpotlight', () => {
  it('renders published category, counts, copy and CTA', () => {
    const { container } = render(<CategorySpotlight section={section()} />)

    expect(screen.getByRole('heading', { name: 'عنوان ویژه' })).toBeTruthy()
    expect(screen.getByText('دسته‌بندی ویژه')).toBeTruthy()
    expect(screen.getByText('توضیح ویژه')).toBeTruthy()
    expect(screen.getByText(formatFaNumber(3))).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'مشاهده دسته' }).getAttribute('href'),
    ).toBe('/categories/category-b')
    expect(container.querySelector('img')?.getAttribute('src')).toContain(
      '/catalog/media/b/thumbnail',
    )
  })

  it('does not invent optional copy or a CTA when the payload omits them', () => {
    render(
      <CategorySpotlight
        section={section({
          secondaryCount: null,
          copy: campaignCopy({
            eyebrowFa: null,
            titleFa: null,
            subtitleFa: null,
            ctaLabelFa: null,
            href: null,
          }),
        })}
      />,
    )

    expect(screen.getByRole('heading', { name: 'دسته ویژه' })).toBeTruthy()
    expect(screen.queryByText('دسته‌بندی ویژه')).toBeNull()
    expect(screen.queryByText('توضیح ویژه')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByText('3')).toBeNull()
  })

  it('keeps the semantic cover fallback when no cover is published', () => {
    const { container } = render(
      <CategorySpotlight
        section={section({ category: categoryTile('b', { coverUrl: null }) })}
      />,
    )

    expect(container.querySelectorAll('img')).toHaveLength(0)
    expect(screen.getByRole('heading', { name: 'عنوان ویژه' })).toBeTruthy()
  })
})
