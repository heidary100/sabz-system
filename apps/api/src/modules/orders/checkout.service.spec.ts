import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { CheckoutService } from './checkout.service';

const USER_ID = 'user-1';
const CART_ID = 'cart-1';
const VARIANT_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

function makeLine(overrides: Record<string, unknown> = {}) {
  return {
    id: 'line-1',
    cartId: CART_ID,
    quantity: 2,
    unitPriceAtAdd: new Prisma.Decimal('5000'),
    variantId: VARIANT_ID,
    variant: {
      sku: 'SKU-1',
      name: 'مدل مشکی',
      price: new Prisma.Decimal('5000'),
      priceStatus: 'PRICED',
      deletedAt: null,
      product: {
        id: 'product-1',
        name: 'گوشی موبایل',
        status: 'PUBLISHED',
        deletedAt: null,
      },
    },
    ...overrides,
  };
}

function stockRow(available: number) {
  return {
    variantId: VARIANT_ID,
    warehouseId: 'warehouse-1',
    quantityOnHand: available,
    quantityReserved: 0,
  };
}

describe('CheckoutService', () => {
  let service: CheckoutService;
  let prisma: {
    cart: { findUnique: jest.Mock };
    cartItem: { findMany: jest.Mock };
    inventoryItem: { findMany: jest.Mock };
    address: { findFirst: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      cart: { findUnique: jest.fn() },
      cartItem: { findMany: jest.fn() },
      inventoryItem: { findMany: jest.fn() },
      address: { findFirst: jest.fn() },
    };
    const inventory = {} as unknown as InventoryService;
    service = new CheckoutService(prisma as unknown as PrismaService, inventory);
  });

  it('serves static shipping and payment method lists', () => {
    const shipping = service.shippingMethods();
    const payment = service.paymentMethods();

    expect(shipping.items.length).toBeGreaterThan(0);
    expect(Object.keys(shipping.items[0]!).sort()).toEqual(
      ['code', 'etaFa', 'fee', 'titleFa'].sort(),
    );
    expect(payment.items.map((item) => item.code).sort()).toEqual(['COD', 'ONLINE']);
    expect(Object.keys(payment.items[0]!).sort()).toEqual(
      ['code', 'descFa', 'titleFa'].sort(),
    );
  });

  it('validates an empty cart as invalid without problems', async () => {
    prisma.cart.findUnique.mockResolvedValue(null);

    const summary = await service.validate(USER_ID);

    expect(summary).toEqual({
      valid: false,
      items: [],
      subtotal: '0',
      shippingFee: '0',
      total: '0',
      problems: [],
    });
    expect(Object.keys(summary).sort()).toEqual(
      ['items', 'problems', 'shippingFee', 'subtotal', 'total', 'valid'].sort(),
    );
  });

  it('validates fulfillable lines with live-price totals', async () => {
    prisma.cart.findUnique.mockResolvedValue({ id: CART_ID });
    prisma.cartItem.findMany.mockResolvedValue([makeLine()]);
    prisma.inventoryItem.findMany.mockResolvedValue([stockRow(5)]);

    const summary = await service.validate(USER_ID);

    expect(summary.valid).toBe(true);
    expect(summary.subtotal).toBe('10000');
    expect(summary.total).toBe('10000');
    expect(summary.problems).toHaveLength(0);
    expect(Object.keys(summary.items[0]!).sort()).toEqual(
      [
        'available',
        'inStock',
        'lineTotal',
        'priceChanged',
        'productName',
        'quantity',
        'unitPrice',
        'variantId',
        'variantSku',
      ].sort(),
    );
  });

  it('flags shortages as blocking with the available count', async () => {
    prisma.cart.findUnique.mockResolvedValue({ id: CART_ID });
    prisma.cartItem.findMany.mockResolvedValue([makeLine({ quantity: 4 })]);
    prisma.inventoryItem.findMany.mockResolvedValue([stockRow(1)]);

    const summary = await service.validate(USER_ID);

    expect(summary.valid).toBe(false);
    expect(summary.problems).toEqual([
      {
        variantId: VARIANT_ID,
        code: 'OUT_OF_STOCK',
        message: expect.any(String),
        available: 1,
      },
    ]);
    expect(summary.items[0]).toMatchObject({ inStock: false, available: 1 });
  });

  it('flags call-for-price lines as blocking without stock', async () => {
    const line = makeLine();
    line.variant.priceStatus = 'CALL_FOR_PRICE';
    prisma.cart.findUnique.mockResolvedValue({ id: CART_ID });
    prisma.cartItem.findMany.mockResolvedValue([line]);
    prisma.inventoryItem.findMany.mockResolvedValue([stockRow(5)]);

    const summary = await service.validate(USER_ID);

    expect(summary.valid).toBe(false);
    expect(summary.problems[0]).toMatchObject({
      variantId: VARIANT_ID,
      code: 'CALL_FOR_PRICE',
      available: null,
    });
    expect(summary.items).toHaveLength(0);
  });

  it('flags live-price drift as informational without blocking', async () => {
    const line = makeLine();
    line.variant.price = new Prisma.Decimal('6000');
    prisma.cart.findUnique.mockResolvedValue({ id: CART_ID });
    prisma.cartItem.findMany.mockResolvedValue([line]);
    prisma.inventoryItem.findMany.mockResolvedValue([stockRow(5)]);

    const summary = await service.validate(USER_ID);

    expect(summary.valid).toBe(true);
    expect(summary.subtotal).toBe('12000');
    expect(summary.problems[0]).toMatchObject({
      code: 'PRICE_CHANGED',
      available: 5,
    });
    expect(summary.items[0]).toMatchObject({ priceChanged: true });
  });

  it('rejects placing an order from an empty cart', async () => {
    prisma.address.findFirst.mockResolvedValue({ fullName: 'علی' });
    prisma.cart.findUnique.mockResolvedValue(null);

    await expect(
      service.placeOrder(USER_ID, VARIANT_ID, 'COD'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
