// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
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
    <div data-testid="ready-card" data-density={density}>
      {product.name}
    </div>
  ),
}));

import { formatFaNumber } from '@/lib/format';
import { CompactProductList } from './compact-product-list';

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

afterEach(cleanup);

describe('CompactProductList', () => {
  it('hides the collection when no ready-to-ship products exist', () => {
    const { container } = render(<CompactProductList products={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('caps the compact collection at four cards', () => {
    render(
      <CompactProductList
        products={[product(1), product(2), product(3), product(4), product(5)]}
      />,
    );
    expect(screen.getAllByTestId('ready-card')).toHaveLength(4);
    expect(
      screen.getAllByTestId('ready-card')[0]!.getAttribute('data-density'),
    ).toBe('compact');
    expect(screen.getByText(`${formatFaNumber(4)} کالا`)).toBeTruthy();
  });

  it('points to the real in-stock catalogue filter', () => {
    render(<CompactProductList products={[product(1)]} />);
    expect(
      screen
        .getByRole('link', { name: /مشاهده موجودی کامل/ })
        .getAttribute('href'),
    ).toBe('/products?inStockOnly=true');
  });
});
