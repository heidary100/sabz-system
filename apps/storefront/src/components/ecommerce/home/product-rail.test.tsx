// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { CatalogProductCardDto } from '@sabz/types';
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

vi.mock('@/components/ecommerce/wishlist/product-card-wishlist', () => ({
  ProductCardWithWishlist: ({
    product,
    density,
  }: {
    product: CatalogProductCardDto;
    density?: string;
  }) => (
    <div data-testid="rail-card" data-density={density}>
      {product.name}
    </div>
  ),
}));

import { ProductRail } from './product-rail';

function product(index: number): CatalogProductCardDto {
  return {
    id: `p-${index}`,
    name: `کالای ${index}`,
    slug: `product-${index}`,
    condition: 'NEW',
    brand: null,
    category: { name: 'دسته', slug: 'category' },
    priceFrom: '1000000',
    compareAtPrice: null,
    callForPrice: false,
    promotionEndsAt: null,
    variantCount: 1,
    inStock: true,
    ratingAverage: null,
    ratingCount: 0,
    primaryImageUrl: null,
    primaryThumbnailUrl: null,
  };
}

function rail(products = [1, 2, 3, 4, 5, 6, 7].map(product)) {
  return (
    <ProductRail
      id="new-arrivals-heading"
      title="تازه‌ها"
      subtitle="جدیدترین کالاها"
      actionHref="/products?sort=newest"
      products={products}
    />
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ProductRail', () => {
  it('omits the rail when there are no new arrivals', () => {
    const { container } = render(rail([]));
    expect(container.firstChild).toBeNull();
  });

  it('renders at most six compact cards with the real see-all destination', () => {
    render(rail());
    expect(screen.getAllByTestId('rail-card')).toHaveLength(6);
    expect(screen.getAllByTestId('rail-card')[0]!.getAttribute('data-density')).toBe(
      'compact',
    );
    expect(
      screen.getByRole('link', { name: 'همه محصولات' }).getAttribute('href'),
    ).toBe('/products?sort=newest');
  });

  it('exposes labelled previous/next controls and scrolls in RTL', () => {
    render(rail());
    const track = screen.getByRole('list', { name: 'تازه‌ها — ریل محصولات' });
    Object.defineProperty(track, 'clientWidth', { value: 800 });
    Object.defineProperty(track, 'scrollWidth', { value: 2400 });
    track.scrollLeft = 0;
    const scrollBy = vi.fn();
    Object.defineProperty(track, 'scrollBy', { value: scrollBy });
    fireEvent.scroll(track);

    const previous = screen.getByRole('button', { name: 'محصولات قبلی' });
    const next = screen.getByRole('button', { name: 'محصولات بعدی' });
    expect(previous.hasAttribute('disabled')).toBe(true);
    expect(next.hasAttribute('disabled')).toBe(false);

    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      direction: 'rtl',
    } as CSSStyleDeclaration);
    fireEvent.click(next);
    expect(scrollBy).toHaveBeenCalledWith({
      left: -680,
      behavior: 'smooth',
    });
  });

  it('keeps the track keyboard focusable with an accessible label', () => {
    render(rail());
    const track = screen.getByRole('list', { name: 'تازه‌ها — ریل محصولات' });
    expect(track.getAttribute('tabindex')).toBe('0');
  });
});
