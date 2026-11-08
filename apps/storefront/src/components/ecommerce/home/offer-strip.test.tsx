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
    <div data-testid="offer-card" data-density={density}>
      {product.name}
    </div>
  ),
}));

vi.mock('@/components/ecommerce/ui/countdown-timer', () => ({
  CountdownTimer: ({ endsAt }: { endsAt: string }) => (
    <span data-testid="countdown">{endsAt}</span>
  ),
}));

import { OfferStrip } from './offer-strip';

function product(overrides: Partial<CatalogProductCardDto> = {}) {
  return {
    id: 'p1',
    name: 'کالای ویژه',
    slug: 'special',
    condition: 'NEW',
    brand: null,
    category: { name: 'دسته', slug: 'category' },
    priceFrom: '900000',
    compareAtPrice: '1000000',
    callForPrice: false,
    promotionEndsAt: null,
    variantCount: 1,
    inStock: true,
    ratingAverage: null,
    ratingCount: 0,
    primaryImageUrl: null,
    primaryThumbnailUrl: null,
    ...overrides,
  } satisfies CatalogProductCardDto;
}

afterEach(cleanup);

describe('OfferStrip', () => {
  it('hides the section when no products are eligible', () => {
    const { container } = render(
      <OfferStrip products={[]} mode="offer" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the real-offer presentation with compact Product Card v2', () => {
    render(
      <OfferStrip products={[product()]} mode="offer" endsAt={null} />,
    );
    expect(
      screen.getByRole('heading', { name: 'پیشنهادهای منتخب' }),
    ).toBeTruthy();
    expect(screen.getByTestId('offer-card').getAttribute('data-density')).toBe(
      'compact',
    );
    expect(screen.queryByTestId('countdown')).toBeNull();
  });

  it('only shows a countdown when a real future end is supplied', () => {
    render(
      <OfferStrip
        products={[product()]}
        mode="offer"
        endsAt="2026-12-01T00:00:00.000Z"
      />,
    );
    expect(screen.getByTestId('countdown').textContent).toBe(
      '2026-12-01T00:00:00.000Z',
    );
  });

  it('degrades to a truthful featured presentation without offer language', () => {
    render(
      <OfferStrip
        products={[product({ compareAtPrice: null })]}
        mode="featured"
      />,
    );
    expect(
      screen.getByRole('heading', { name: 'منتخب فروشگاه' }),
    ).toBeTruthy();
    expect(screen.queryByText(/قیمت ویژه/)).toBeNull();
    expect(screen.queryByTestId('countdown')).toBeNull();
  });

  it('links to the existing catalogue route', () => {
    render(<OfferStrip products={[product()]} mode="offer" />);
    expect(
      screen.getByRole('link', { name: 'مشاهده همه محصولات' }).getAttribute(
        'href',
      ),
    ).toBe('/products');
  });
});
