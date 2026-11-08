// @vitest-environment jsdom
import type { OrderDetailDto } from '@sabz/types';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const router = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

vi.mock('next/link', () => ({
  default: function FakeLink({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  },
}));

const authClient = vi.hoisted(() => ({
  hasSession: vi.fn(() => true),
  authFetch: vi.fn(),
}));

vi.mock('@/lib/auth-client', () => authClient);

const ordersClient = vi.hoisted(() => ({
  fetchOrderDetail: vi.fn(),
  cancelOrder: vi.fn(),
}));

vi.mock('@/lib/orders', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/orders')>();
  return {
    ...actual,
    fetchOrderDetail: ordersClient.fetchOrderDetail,
    cancelOrder: ordersClient.cancelOrder,
  };
});

import { OrderDetail } from './order-detail';

const TIPAX_NUMBER = '123456789012345';

const ORDER: OrderDetailDto = {
  id: 'order-1',
  orderNumber: 100007,
  status: 'SHIPPED',
  statusFa: 'ارسال شده',
  paymentMethod: 'COD',
  paymentStatus: 'PAID',
  subtotal: '1000000',
  shippingMethod: 'TIPAX',
  shippingFee: '250000',
  total: '1250000',
  shipment: {
    id: 'shipment-1',
    orderId: 'order-1',
    method: 'TIPAX',
    methodFa: 'تیپاکس',
    trackingNumber: TIPAX_NUMBER,
    status: 'IN_TRANSIT',
    statusFa: 'در مسیر',
    shippedAt: '2026-11-01T00:00:00.000Z',
    deliveredAt: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    events: [],
  },
  addressSnapshot: {
    fullName: 'مشتری آزمایشی',
    phone: '09120000000',
    province: 'مازندران',
    city: 'ساری',
    address: 'نشانی آزمایشی',
    postalCode: null,
  },
  items: [
    {
      id: 'line-1',
      variantId: 'variant-1',
      productName: 'محصول آزمایشی',
      variantName: null,
      sku: 'SKU-1',
      quantity: 1,
      unitPrice: '1000000',
      lineTotal: '1000000',
    },
  ],
  createdAt: '2026-11-01T00:00:00.000Z',
};

describe('OrderDetail tracking section (SS-262)', () => {
  beforeEach(() => {
    authClient.hasSession.mockReturnValue(true);
    ordersClient.fetchOrderDetail.mockReset();
  });

  afterEach(() => cleanup());

  it('renders a supported carrier number as a safe external link', async () => {
    ordersClient.fetchOrderDetail.mockResolvedValue(ORDER);

    render(<OrderDetail id="order-1" />);

    const link = await screen.findByRole('link', {
      name: /پیگیری مرسوله با تیپاکس/,
    });

    expect(new URL(link.getAttribute('href') ?? '').origin).toBe(
      'https://tipaxco.com',
    );
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('rel')).toContain('noreferrer');
    expect(link.textContent).toContain(TIPAX_NUMBER);
  });

  it('keeps an unsupported method as plain text', async () => {
    ordersClient.fetchOrderDetail.mockResolvedValue({
      ...ORDER,
      shippingMethod: 'STORE_PICKUP',
      shipment: {
        ...ORDER.shipment!,
        method: 'STORE_PICKUP',
        methodFa: 'تحویل حضوری از فروشگاه',
      },
    });

    render(<OrderDetail id="order-1" />);

    await screen.findByText('تحویل حضوری از فروشگاه');
    expect(
      screen.queryByRole('link', { name: /پیگیری مرسوله/ }),
    ).toBeNull();
    expect(screen.getByText(TIPAX_NUMBER)).toBeTruthy();
  });

  it('hides the tracking row when the number is missing', async () => {
    ordersClient.fetchOrderDetail.mockResolvedValue({
      ...ORDER,
      shipment: {
        ...ORDER.shipment!,
        trackingNumber: null,
      },
    });

    render(<OrderDetail id="order-1" />);

    await screen.findByText('ارسال و رهگیری');
    expect(screen.queryByText('کد رهگیری')).toBeNull();
    expect(
      screen.queryByRole('link', { name: /پیگیری مرسوله/ }),
    ).toBeNull();
  });
});
