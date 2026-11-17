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

  it('renders every supplied ready-to-ship card', () => {
    render(
      <CompactProductList
        products={[product(1), product(2), product(3), product(4), product(5)]}
      />,
    );
    expect(screen.getAllByTestId('ready-card')).toHaveLength(5);
    expect(
      screen.getAllByTestId('ready-card')[0]!.getAttribute('data-density'),
    ).toBe('compact');
    expect(screen.getByText(`${formatFaNumber(5)} کالا`)).toBeTruthy();
  });


  it('uses published title and subtitle and omits them when null', () => {
    const { rerender } = render(
      <CompactProductList
        products={[product(1)]}
        title="عنوان منتشرشده"
        subtitle="زیرعنوان منتشرشده"
      />,
    )
    expect(screen.getByRole('heading', { name: 'عنوان منتشرشده' })).toBeTruthy()
    expect(screen.getByText('زیرعنوان منتشرشده')).toBeTruthy()

    rerender(
      <CompactProductList products={[product(1)]} title={null} subtitle={null} />,
    )
    expect(screen.queryByRole('heading', { name: 'آماده ارسال' })).toBeNull()
    expect(screen.queryByText(/گزیده‌ای از کالاهایی/)).toBeNull()
    expect(screen.queryByText('موجودی انبار')).toBeNull()
  })

  it('does not invent a promotional action for published content', () => {
    render(
      <CompactProductList
        products={[product(1)]}
        title="عنوان منتشرشده"
        subtitle={null}
      />,
    );
    expect(screen.queryByRole('link')).toBeNull();
  });
});
