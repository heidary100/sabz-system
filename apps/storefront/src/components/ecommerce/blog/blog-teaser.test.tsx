// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import type { BlogPostCardDto } from '@sabz/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
}));

vi.mock('@/lib/blog', () => ({
  fetchBlogPosts: mocks.fetch,
}));

vi.mock('next/link', () => ({
  default: function MockLink({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  },
}));

import { BlogTeaser } from './blog-teaser';

function post(index: number): BlogPostCardDto {
  return {
    id: `post-${index}`,
    slug: `article-${index}`,
    title: `مقاله ${index}`,
    excerpt: `خلاصه مقاله ${index}`,
    coverImageUrl: null,
    category: null,
    authorName: 'نویسنده',
    publishedAt: '2026-11-01T00:00:00.000Z',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('BlogTeaser', () => {
  it('renders nothing when there are no published posts', async () => {
    mocks.fetch.mockResolvedValue({ items: [], total: 0, page: 1, limit: 3 });
    expect(await BlogTeaser()).toBeNull();
  });

  it('renders nothing when the blog endpoint fails', async () => {
    mocks.fetch.mockRejectedValue(new Error('offline'));
    expect(await BlogTeaser()).toBeNull();
  });

  it('composes one feature story with two compact companions', async () => {
    mocks.fetch.mockResolvedValue({
      items: [post(1), post(2), post(3)],
      total: 3,
      page: 1,
      limit: 3,
    });
    const { container } = render(await BlogTeaser());
    expect(
      screen.getByRole('heading', { name: 'وبلاگ' }),
    ).toBeTruthy();
    expect(screen.getByText('مقاله 1')).toBeTruthy();
    expect(screen.getByText('مقاله 2')).toBeTruthy();
    expect(screen.getByText('مقاله 3')).toBeTruthy();
    expect(container.querySelectorAll('article')).toHaveLength(3);
    expect(
      screen.getByRole('link', { name: 'مشاهده همه' }).getAttribute('href'),
    ).toBe('/blog');
  });
});
