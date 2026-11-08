// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CatalogCategoryNode } from '@sabz/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ pathname: '/' }));

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
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

import { DesktopNav } from './desktop-nav';

function node(
  id: string,
  count: number,
  children: CatalogCategoryNode[] = [],
): CatalogCategoryNode {
  return {
    id,
    name: id,
    slug: id,
    sortOrder: 0,
    publishedProductCount: count,
    children,
  };
}

beforeEach(() => {
  nav.pathname = '/';
});

afterEach(cleanup);

describe('DesktopNav', () => {
  it('renders only categories with a published subtree and canonical links', () => {
    const categories = [
      node('phones', 12, [node('phone-cases', 5)]),
      node('laptops', 8),
      node('qa-empty', 0),
    ];
    render(
      <DesktopNav
        categories={categories}
        covers={{ phones: 'http://media/cover' }}
      />,
    );
    expect(
      screen.getByRole('link', { name: /^phones/ }).getAttribute('href'),
    ).toBe('/categories/phones');
    expect(
      screen.getByRole('link', { name: /^laptops/ }).getAttribute('href'),
    ).toBe('/categories/laptops');
    expect(screen.queryByText('qa-empty')).toBeNull();
  });

  it('opens the mega menu on click, shows the child level and closes on Escape with focus restored', async () => {
    const categories = [
      node('phones', 12, [node('phone-cases', 5), node('chargers', 3)]),
      node('laptops', 8),
    ];
    render(
      <DesktopNav
        categories={categories}
        covers={{ phones: 'http://media/cover' }}
      />,
    );
    const toggle = screen.getByRole('button', {
      name: 'زیرمجموعه‌های phones',
    });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);

    const menu = await screen.findByText('phone-cases');
    expect(menu).toBeTruthy();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(
      screen
        .getByRole('link', { name: /مشاهده محصولات phones/ })
        .getAttribute('href'),
    ).toBe('/categories/phones');
    expect(screen.getByText('chargers')).toBeTruthy();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('link', { name: /مشاهده محصولات phones/ }),
      ),
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByText('phone-cases')).toBeNull());
    expect(document.activeElement).toBe(toggle);
  });

  it('opens after a short pointer intent delay', async () => {
    render(
      <DesktopNav
        categories={[
          node('phones', 12, [node('phone-cases', 5)]),
          node('laptops', 8),
        ]}
        covers={{}}
      />,
    );
    const item = screen.getByText('phones').closest('li');
    expect(item).not.toBeNull();
    fireEvent.pointerEnter(item!);
    await waitFor(
      () => expect(screen.getByText('phone-cases')).toBeTruthy(),
      { timeout: 1000 },
    );
  });

  it('marks the active category and exposes a stable aria-controls relationship', () => {
    nav.pathname = '/categories/phones';
    render(
      <DesktopNav
        categories={[
          node('phones', 12, [node('child', 4)]),
          node('laptops', 8),
        ]}
        covers={{}}
      />,
    );
    const active = screen.getByRole('link', { name: /^phones/ });
    expect(active.getAttribute('aria-current')).toBe('page');
    const toggle = screen.getByRole('button', {
      name: 'زیرمجموعه‌های phones',
    });
    expect(toggle.getAttribute('aria-controls')).toBe('megamenu-phones');
  });

  it('uses responsive overflow for more than five roots without wrapping labels', () => {
    const categories = Array.from({ length: 7 }, (_, index) =>
      node(`cat-${index}`, 5),
    );
    const { container } = render(<DesktopNav categories={categories} covers={{}} />);
    const items = [...container.querySelectorAll('ul > li')];
    expect(items[5]?.className).toContain('hidden');
    expect(items[5]?.className).toContain('xl:flex');
    expect(
      screen
        .getByRole('link', { name: 'همه دسته‌بندی‌ها' })
        .getAttribute('href'),
    ).toBe('/categories');
  });
});
