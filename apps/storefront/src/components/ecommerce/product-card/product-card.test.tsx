// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CatalogProductCardDto } from '@sabz/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  add: vi.fn(),
  toggle: vi.fn(),
  addWishlist: vi.fn(),
  removeWishlist: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('next/image', () => ({
  default: function MockImage({
    src,
    alt,
    className,
    onError,
  }: {
    src: string;
    alt: string;
    className?: string;
    onError?: () => void;
  }) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} className={className} onError={onError} />;
  },
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

vi.mock('@/lib/catalog', () => ({
  mediaImageUrl: (path: string | null | undefined) => path ?? null,
}));

vi.mock('@/components/ecommerce/cart/cart-provider', () => ({
  useCart: () => ({ add: mocks.add }),
}));

vi.mock('@/components/ecommerce/compare/compare-provider', () => ({
  useCompare: () => ({
    ready: true,
    isCompared: () => false,
    toggle: mocks.toggle,
  }),
}));

vi.mock('@/components/ecommerce/wishlist/use-has-session', () => ({
  useHasSession: () => true,
}));

vi.mock('@/lib/wishlist', () => ({
  addToWishlist: mocks.addWishlist,
  removeFromWishlist: mocks.removeWishlist,
}));

import { ProductCard } from './product-card';
import { ProductCardWithWishlist } from '@/components/ecommerce/wishlist/product-card-wishlist';
import {
  formatCardPrice,
  formatToman,
  salePercentFrom,
} from '@/lib/format';

function product(
  overrides: Partial<CatalogProductCardDto> = {},
): CatalogProductCardDto {
  return {
    id: 'product-1',
    name: 'ماوس بی‌سیم پرووان مدل NIX PMW50',
    slug: 'nix-pmw50',
    condition: 'NEW',
    brand: { name: 'proone', slug: 'proone' },
    category: { name: 'کیبورد و ماوس', slug: 'keyboards-mice' },
    priceFrom: '16000000',
    compareAtPrice: null,
    callForPrice: false,
    promotionEndsAt: null,
    variantCount: 1,
    inStock: true,
    ratingAverage: null,
    ratingCount: 0,
    primaryImageUrl: '/catalog/media/1',
    primaryThumbnailUrl: '/catalog/media/1/thumbnail',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.add.mockResolvedValue({ ok: true });
  mocks.toggle.mockReturnValue(true);
  mocks.addWishlist.mockResolvedValue(undefined);
  mocks.removeWishlist.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe('ProductCard rendering', () => {
  it('renders a regular priced product with brand and availability', () => {
    render(<ProductCard product={product()} />);
    expect(screen.getByText('proone')).toBeTruthy();
    expect(screen.getByText(product().name)).toBeTruthy();
    expect(screen.getByText('موجود')).toBeTruthy();
    expect(
      screen.getByText(
        formatCardPrice(product().priceFrom, 1, false),
      ),
    ).toBeTruthy();
  });

  it('renders a discount badge, price and compare-at reference', () => {
    const discounted = product({
      priceFrom: '16000000',
      compareAtPrice: '20000000',
    });
    render(<ProductCard product={discounted} />);
    const percent = salePercentFrom(
      discounted.priceFrom,
      discounted.compareAtPrice,
    );
    expect(
      screen.getByText(
        `تخفیف ${percent!.toLocaleString('fa-IR', { useGrouping: false })}٪`,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(formatToman(discounted.compareAtPrice!)),
    ).toBeTruthy();
  });

  it('keeps a call-for-price product quotation-first, with no invented number', () => {
    render(
      <ProductCardWithWishlist
        product={product({ priceFrom: '', callForPrice: true })}
      />,
    );
    expect(
      screen.getByRole('link', { name: 'استعلام قیمت' }).getAttribute('href'),
    ).toBe(`/products/${product().slug}`);
    expect(
      screen.queryByRole('button', { name: /افزودن .* به سبد خرید/ }),
    ).toBeNull();
  });

  it('shows a real out-of-stock state without a quick-add action', () => {
    render(
      <ProductCardWithWishlist product={product({ inStock: false })} />,
    );
    expect(screen.getAllByText('ناموجود').length).toBeGreaterThan(0);
    expect(
      screen.queryByRole('button', { name: /افزودن .* به سبد خرید/ }),
    ).toBeNull();
    expect(
      screen.getByRole('button', { name: /افزودن .* به مقایسه/ }),
    ).toBeTruthy();
  });

  it('omits the brand line for genuinely unbranded products', () => {
    render(<ProductCard product={product({ brand: null })} />);
    expect(screen.queryByText('بدون برند')).toBeNull();
    expect(screen.getByText(product().name)).toBeTruthy();
  });

  it('clamps a long Persian name to two lines and preserves direction', () => {
    const longName =
      'هدفون بلوتوثی حرفه‌ای با نویز کنسلینگ فعال و باتری بسیار طولانی برای استفاده روزانه در محیط‌های پرصدا';
    render(<ProductCard product={product({ name: longName })} />);
    const heading = screen.getByRole('heading', { level: 3 });
    expect(heading.textContent).toBe(longName);
    expect(heading.className).toContain('line-clamp-2');
    expect(heading.getAttribute('dir')).toBe('auto');
  });

  it('keeps Latin brand and model text in an auto direction', () => {
    render(
      <ProductCard
        product={product({
          name: 'Green Lion Hyper Air Portable Tire Inflator',
          brand: { name: 'Green Lion', slug: 'green-lion-2' },
        })}
      />,
    );
    expect(screen.getByText('Green Lion').getAttribute('dir')).toBe('auto');
    expect(
      screen.getByText('Green Lion Hyper Air Portable Tire Inflator'),
    ).toBeTruthy();
  });

  it('renders the missing-image fallback for null media', () => {
    render(
      <ProductCard
        product={product({
          primaryImageUrl: null,
          primaryThumbnailUrl: null,
        })}
      />,
    );
    expect(screen.getByTestId('product-image-fallback')).toBeTruthy();
  });

  it('replaces a failed image request with the fallback', () => {
    const { container } = render(<ProductCard product={product()} />);
    const image = container.querySelector('img');
    expect(image).not.toBeNull();
    fireEvent.error(image!);
    expect(screen.getByTestId('product-image-fallback')).toBeTruthy();
  });

  it('uses the from-price and variant context for multi-variant products', () => {
    render(<ProductCard product={product({ variantCount: 3 })} />);
    expect(
      screen.getByText(formatCardPrice(product().priceFrom, 3, false)),
    ).toBeTruthy();
    expect(screen.getByText('۳ گزینه')).toBeTruthy();
  });

  it('supports default and compact densities without changing the structure', () => {
    const { container, rerender } = render(<ProductCard product={product()} />);
    expect(
      container.querySelector('[data-density="default"]'),
    ).not.toBeNull();
    rerender(<ProductCard product={product()} density="compact" />);
    expect(
      container.querySelector('[data-density="compact"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-card-price]'),
    ).not.toBeNull();
  });
});

describe('ProductCard structure and actions', () => {
  it('navigates through a single product anchor and keeps buttons outside it', () => {
    const { container } = render(
      <ProductCardWithWishlist product={product()} />,
    );
    const anchor = container.querySelector('a[href="/products/nix-pmw50"]');
    expect(anchor).not.toBeNull();
    expect(container.querySelectorAll('a[href="/products/nix-pmw50"]').length).toBe(1);
    expect(container.querySelector('a button')).toBeNull();
    expect(container.querySelectorAll('button').length).toBeGreaterThanOrEqual(3);
  });

  it('keeps price and actions in distinct, non-absolute regions', () => {
    const { container } = render(
      <ProductCardWithWishlist product={product()} />,
    );
    const price = container.querySelector('[data-card-price]');
    const actions = container.querySelector('[data-card-actions]');
    expect(price).not.toBeNull();
    expect(actions).not.toBeNull();
    expect(price?.contains(actions as Node)).toBe(false);
    expect(actions?.contains(price as Node)).toBe(false);
    expect(price?.className).not.toContain('absolute');
    expect(actions?.className).not.toContain('absolute');
  });

  it('wires quick-add to the existing cart action', async () => {
    render(<ProductCardWithWishlist product={product()} />);
    const add = screen.getByRole('button', {
      name: `افزودن ${product().name} به سبد خرید`,
    });
    fireEvent.click(add);
    await waitFor(() =>
      expect(mocks.add).toHaveBeenCalledWith({ productId: product().id }, 1),
    );
  });

  it('wires wishlist and compare controls with accessible names', async () => {
    render(<ProductCardWithWishlist product={product()} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'افزودن به علاقه‌مندی‌ها' }),
    );
    await waitFor(() =>
      expect(mocks.addWishlist).toHaveBeenCalledWith(product().id),
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: `افزودن ${product().name} به مقایسه`,
      }),
    );
    expect(mocks.toggle).toHaveBeenCalledWith({
      id: product().id,
      slug: product().slug,
    });
  });

  it('offers quote and compare actions for a call-for-price card', () => {
    render(
      <ProductCardWithWishlist
        product={product({ priceFrom: '', callForPrice: true })}
      />,
    );
    expect(
      screen.getByRole('link', { name: 'استعلام قیمت' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /افزودن .* به مقایسه/ }),
    ).toBeTruthy();
  });

  it('keeps the action row present in compact density', () => {
    const { container } = render(
      <ProductCardWithWishlist product={product()} density="compact" />,
    );
    expect(container.querySelector('[data-density="compact"]')).not.toBeNull();
    expect(container.querySelector('[data-card-actions]')).not.toBeNull();
    expect(
      screen.getByRole('button', {
        name: `افزودن ${product().name} به سبد خرید`,
      }),
    ).toBeTruthy();
  });
});
