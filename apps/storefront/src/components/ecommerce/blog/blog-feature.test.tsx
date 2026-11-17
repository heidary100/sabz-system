// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { blogCard } from '@/lib/__fixtures__/published-homepage'

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

import { BlogFeature } from './blog-feature'

afterEach(cleanup)

describe('BlogFeature', () => {
  it('renders only the supplied published posts in order', () => {
    render(
      <BlogFeature
        posts={[
          blogCard('1', { title: 'مقاله نخست' }),
          blogCard('2', { title: 'مقاله دوم' }),
          blogCard('3', { title: 'مقاله سوم' }),
        ]}
      />,
    )

    const headings = screen.getAllByRole('heading', { level: 3 })
    expect(headings.map((heading) => heading.textContent)).toEqual([
      'مقاله نخست',
      'مقاله دوم',
      'مقاله سوم',
    ])
    expect(screen.getByRole('link', { name: /مقاله نخست/ }).getAttribute('href')).toBe(
      '/blog/post-1',
    )
  })

  it('gives the compact companions a cover and readable excerpt', () => {
    const { container } = render(
      <BlogFeature
        posts={[blogCard('1'), blogCard('2'), blogCard('3')]}
      />,
    )
    const articles = container.querySelectorAll('article')
    expect(articles).toHaveLength(3)
    for (const index of [1, 2]) {
      const article = articles[index]!
      expect(article.textContent).toContain(`خلاصه مقاله ${index + 1}`)
      expect(
        article.querySelector('img')?.getAttribute('src'),
      ).toBe(`/api/v1/catalog/media/${index + 1}`)
    }
  })

  it('renders nothing when the published feature has no posts', () => {
    const { container } = render(<BlogFeature posts={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('does not add arbitrary static blog copy when optional fields are absent', () => {
    render(
      <BlogFeature
        posts={[blogCard('1', { title: 'مقاله بدون خلاصه', excerpt: null })]}
      />,
    )

    expect(screen.getByRole('heading', { name: 'مقاله بدون خلاصه' })).toBeTruthy()
    expect(screen.queryByText(/تازه‌های فروشگاه/)).toBeTruthy()
    expect(screen.queryByText('خلاصه')).toBeNull()
  })
})
