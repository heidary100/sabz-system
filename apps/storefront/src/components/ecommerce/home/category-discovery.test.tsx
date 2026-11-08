// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import type { CatalogCategoryNode } from '@sabz/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('next/image', () => ({
  default: function MockImage({
    src,
    alt,
    className,
  }: {
    src: string;
    alt: string;
    className?: string;
  }) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} className={className} />;
  },
}));

import { formatFaNumber } from '@/lib/format';
import { CategoryDiscovery } from './category-discovery';

function node(
  slug: string,
  count: number,
  name = slug,
): CatalogCategoryNode {
  return {
    id: slug,
    name,
    slug,
    sortOrder: 0,
    publishedProductCount: count,
    children: [],
  };
}

afterEach(cleanup);

describe('CategoryDiscovery', () => {
  it('renders nothing for an empty category list', () => {
    const { container } = render(
      <CategoryDiscovery categories={[]} covers={{}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('hides categories with no published products', () => {
    const { container } = render(
      <CategoryDiscovery
        categories={[node('empty', 0), node('phones', 12)]}
        covers={{}}
      />,
    );
    expect(
      container.querySelectorAll('a[href^="/categories/"]'),
    ).toHaveLength(1);
    expect(screen.queryByText('empty')).toBeNull();
  });

  it('maps category order, counts, links and covers in one composition', () => {
    const { container } = render(
      <CategoryDiscovery
        categories={[
          node('phones', 12, 'گوشی'),
          node('audio', 7, 'صدا'),
          node('games', 3, 'بازی'),
        ]}
        covers={{ phones: '/media/phones', audio: '/media/audio' }}
      />,
    );
    const links = [
      ...container.querySelectorAll('a[href^="/categories/"]'),
    ];
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/categories/phones',
      '/categories/audio',
      '/categories/games',
    ]);
    expect(screen.getByText(`${formatFaNumber(12)} کالا`)).toBeTruthy();
    expect(screen.getByText(`${formatFaNumber(7)} کالا`)).toBeTruthy();
    expect(screen.getByText(`${formatFaNumber(3)} کالا`)).toBeTruthy();
    expect(
      container.querySelectorAll('img[src="/media/phones"], img[src="/media/audio"]'),
    ).toHaveLength(2);
  });

  it('uses the semantic fallback when a category cover is unavailable', () => {
    const { container } = render(
      <CategoryDiscovery
        categories={[node('phones', 12, 'گوشی')]}
        covers={{ phones: null }}
      />,
    );
    expect(container.querySelectorAll('img')).toHaveLength(0);
    expect(screen.getByRole('link', { name: /گوشی/ })).toBeTruthy();
  });
});
