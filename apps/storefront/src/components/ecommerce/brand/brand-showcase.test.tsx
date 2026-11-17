// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
    <div data-testid="brand-card" data-density={density}>
      {product.name}
    </div>
  ),
}));

import { BrandShowcase } from './brand-showcase';

function product(id: string, name: string): CatalogProductCardDto {
  return {
    id,
    name,
    slug: id,
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

const groups = [
  { name: 'آلفا', slug: 'alpha', products: [product('a1', 'کالای آلفا')] },
  { name: 'خالی', slug: 'empty', products: [] },
  { name: 'بتا', slug: 'beta', products: [product('b1', 'کالای بتا')] },
];

afterEach(cleanup);

describe('BrandShowcase', () => {
  it('hides the section when no brand has eligible products', () => {
    const { container } = render(
      <BrandShowcase
        groups={[{ name: 'خالی', slug: 'empty', products: [] }]}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('builds tabs only for brands with products', () => {
    render(<BrandShowcase groups={groups} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['آلفا', 'بتا']);
    expect(screen.getByRole('tab', { name: 'آلفا' }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('switches the visible Product Card v2 panel on selection', () => {
    render(<BrandShowcase groups={groups} />);
    fireEvent.click(screen.getByRole('tab', { name: 'بتا' }));
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByText('کالای بتا')).toBeTruthy();
    expect(within(panel).queryByText('کالای آلفا')).toBeNull();
    expect(
      within(panel).getByTestId('brand-card').getAttribute('data-density'),
    ).toBe('compact');
  });

  it('supports arrow, Home and End keys with roving focus', () => {
    render(<BrandShowcase groups={groups} />);
    const tablist = screen.getByRole('tablist', { name: 'انتخاب برند' });
    fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'بتا' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    fireEvent.keyDown(tablist, { key: 'Home' });
    expect(screen.getByRole('tab', { name: 'آلفا' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    fireEvent.keyDown(tablist, { key: 'End' });
    expect(screen.getByRole('tab', { name: 'بتا' }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('links to the real brand-filtered catalogue route', () => {
    render(<BrandShowcase groups={groups} />);
    expect(
      screen.getByRole('link', { name: 'مشاهده همه' }).getAttribute('href'),
    ).toBe('/products?brand=alpha');
  });
});
