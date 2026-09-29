import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import { PricingService } from '../pricing/pricing.service';
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
  let audit: { log: jest.Mock };
  let prisma: {
    cart: { findUnique: jest.Mock };
    cartItem: { findMany: jest.Mock };
    inventoryItem: { findMany: jest.Mock };
    address: { findFirst: jest.Mock };
    order: {
      count: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      cart: { findUnique: jest.fn() },
      cartItem: { findMany: jest.fn() },
      inventoryItem: { findMany: jest.fn() },
      address: { findFirst: jest.fn() },
      order: {
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    const inventory = {} as unknown as InventoryService;
    // SS-235: retail by default (no tier, no promotions) so legacy totals
    // keep proving the base-price path.
    const pricing = {
      tierDiscountForUser: jest.fn().mockResolvedValue(new Prisma.Decimal(0)),
      activePromotionsFor: jest.fn().mockResolvedValue([]),
      categoryRuleFor: jest.fn().mockResolvedValue(null),
      productOverrideFor: jest.fn().mockResolvedValue(null),
    } as unknown as PricingService;
    audit = { log: jest.fn() };
    service = new CheckoutService(
      prisma as unknown as PrismaService,
      inventory,
      pricing,
      audit as unknown as AuditService,
    );
  });

  it('serves static shipping and payment method lists', () => {
    const previousOnline = process.env.PAYMENTS_ONLINE_ENABLED;
    const previousCod = process.env.COD_ENABLED;
    delete process.env.PAYMENTS_ONLINE_ENABLED;
    delete process.env.COD_ENABLED;
    try {
      const shipping = service.shippingMethods();
      const payment = service.paymentMethods();

      expect(shipping.items.length).toBeGreaterThan(0);
      expect(Object.keys(shipping.items[0]!).sort()).toEqual(
        ['code', 'etaFa', 'fee', 'titleFa'].sort(),
      );
      expect(payment.items.map((item) => item.code).sort()).toEqual(['COD', 'ONLINE']);
      expect(Object.keys(payment.items[0]!).sort()).toEqual(
        ['code', 'descFa', 'enabled', 'titleFa'].sort(),
      );
      // SS-234 COD-only defaults: ONLINE listed but disabled, COD enabled.
      expect(payment.items.find((item) => item.code === 'ONLINE')).toMatchObject({
        enabled: false,
      });
      expect(payment.items.find((item) => item.code === 'COD')).toMatchObject({
        enabled: true,
      });
    } finally {
      if (previousOnline === undefined) {
        delete process.env.PAYMENTS_ONLINE_ENABLED;
      } else {
        process.env.PAYMENTS_ONLINE_ENABLED = previousOnline;
      }
      if (previousCod === undefined) {
        delete process.env.COD_ENABLED;
      } else {
        process.env.COD_ENABLED = previousCod;
      }
    }
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

  it('rejects ONLINE checkout with 422 while the gateway is disabled (SS-234)', async () => {
    const previous = process.env.PAYMENTS_ONLINE_ENABLED;
    delete process.env.PAYMENTS_ONLINE_ENABLED;
    try {
      await expect(
        service.placeOrder(USER_ID, VARIANT_ID, 'ONLINE'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    } finally {
      if (previous === undefined) {
        delete process.env.PAYMENTS_ONLINE_ENABLED;
      } else {
        process.env.PAYMENTS_ONLINE_ENABLED = previous;
      }
    }
    // The guard runs before any stock/address reads.
    expect(prisma.address.findFirst).not.toHaveBeenCalled();
    expect(prisma.cart.findUnique).not.toHaveBeenCalled();
  });

  describe('placeQuotedOrder (SS-235 B2)', () => {
    const RFQ_ID = '8fa85f64-5717-4562-b3fc-2c963f66afa6';
    const ADDRESS_ID = '9fa85f64-5717-4562-b3fc-2c963f66afa6';

    let quoted: CheckoutService;
    let stores: {
      address: { findFirst: jest.Mock };
      productVariant: { findFirst: jest.Mock };
      inventoryItem: { findMany: jest.Mock };
      $queryRaw: jest.Mock;
      $transaction: jest.Mock;
    };
    let ledger: {
      reserve: jest.Mock;
      consumeReservation: jest.Mock;
      releaseReservation: jest.Mock;
      receive: jest.Mock;
    };
    let tx: {
      order: { create: jest.Mock };
      rfq: { update: jest.Mock };
    };

    const quotedInput = (overrides: Record<string, unknown> = {}) => ({
      rfqId: RFQ_ID,
      variantId: VARIANT_ID,
      quantity: 5,
      unitPrice: new Prisma.Decimal('900'),
      addressId: ADDRESS_ID,
      paymentMethod: 'COD' as const,
      ...overrides,
    });

    beforeEach(() => {
      stores = {
        address: { findFirst: jest.fn() },
        productVariant: { findFirst: jest.fn() },
        inventoryItem: { findMany: jest.fn() },
        $queryRaw: jest.fn(),
        $transaction: jest.fn(),
      };
      ledger = {
        reserve: jest.fn(),
        consumeReservation: jest.fn(),
        releaseReservation: jest.fn(),
        receive: jest.fn(),
      };
      tx = {
        order: { create: jest.fn() },
        rfq: { update: jest.fn() },
      };
      quoted = new CheckoutService(
        stores as unknown as PrismaService,
        ledger as unknown as InventoryService,
        {} as unknown as PricingService,
        { log: jest.fn() } as unknown as AuditService,
      );
      stores.address.findFirst.mockResolvedValue({
        fullName: 'علی احمدی',
        phone: '09123456789',
        province: 'مازندران',
        city: 'ساری',
        address: 'ساری، بلوار پاسداران',
        postalCode: '4814938662',
      });
      stores.productVariant.findFirst.mockResolvedValue({
        sku: 'SKU-CFP',
        name: 'مدل مشکی',
        product: { name: 'گوشی بدون قیمت' },
      });
      stores.inventoryItem.findMany.mockResolvedValue([stockRow(20)]);
      ledger.reserve.mockResolvedValue({ id: 'res-1' });
      ledger.consumeReservation.mockResolvedValue({ id: 'res-1' });
      stores.$queryRaw.mockResolvedValue([{ n: 100002 }]);
      stores.$transaction.mockImplementation(
        async (cb: (client: unknown) => Promise<unknown>) => cb(tx),
      );
      tx.order.create.mockResolvedValue({ id: 'order-1' });
      tx.rfq.update.mockResolvedValue({ id: RFQ_ID });
    });

    it('freezes the quoted unit into a single-line order and flips the RFQ', async () => {
      const result = await quoted.placeQuotedOrder(USER_ID, quotedInput());

      expect(result).toEqual({
        orderId: 'order-1',
        orderNumber: 100002,
        status: 'PENDING',
        total: '4500',
      });
      const created = tx.order.create.mock.calls[0][0].data;
      expect(created.items.create).toHaveLength(1);
      expect(created.items.create[0]).toMatchObject({
        variantId: VARIANT_ID,
        quantity: 5,
        unitPrice: new Prisma.Decimal('900'),
      });
      expect(created.items.create[0].lineTotal.toString()).toBe('4500');
      expect(tx.rfq.update).toHaveBeenCalledWith({
        where: { id: RFQ_ID, status: 'QUOTED' },
        data: expect.objectContaining({
          status: 'ACCEPTED',
          orderId: 'order-1',
        }),
      });
    });

    it('rejects a shortfall with 409 before reserving', async () => {
      stores.inventoryItem.findMany.mockResolvedValue([stockRow(2)]);

      await expect(
        quoted.placeQuotedOrder(USER_ID, quotedInput()),
      ).rejects.toMatchObject({ status: 409 });
      expect(ledger.reserve).not.toHaveBeenCalled();
    });

    it('rejects a non-positive quoted unit with 400', async () => {
      await expect(
        quoted.placeQuotedOrder(
          USER_ID,
          quotedInput({ unitPrice: new Prisma.Decimal('0') }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(ledger.reserve).not.toHaveBeenCalled();
    });

    it('restocks consumed slices when the order create fails', async () => {
      tx.order.create.mockRejectedValue(new Error('create failed'));

      await expect(
        quoted.placeQuotedOrder(USER_ID, quotedInput()),
      ).rejects.toThrow('create failed');
      expect(ledger.receive).toHaveBeenCalledWith(
        expect.objectContaining({ variantId: VARIANT_ID, quantity: 5 }),
        USER_ID,
      );
    });

  describe('operator transitions (SS-240A)', () => {
    const OPERATOR_ID = 'operator-1';

    function storedOrder(overrides: Record<string, unknown> = {}) {
      return {
        id: 'order-1',
        orderNumber: 100001,
        status: 'PENDING',
        paymentMethod: 'COD',
        paymentStatus: 'PENDING',
        items: [],
        ...overrides,
      };
    }

    it('moves PENDING → PROCESSING and audits the transition', async () => {
      prisma.order.findUnique.mockResolvedValue(storedOrder());
      prisma.order.update.mockResolvedValue({
        status: 'PROCESSING',
        paymentStatus: 'PENDING',
      });
      prisma.order.findUnique.mockResolvedValueOnce(storedOrder());
      // adminDetail re-reads the row for the response.
      prisma.order.findUnique.mockResolvedValueOnce({
        ...storedOrder(),
        id: 'order-1',
        orderNumber: 100001,
        status: 'PROCESSING',
        paymentMethod: 'COD',
        paymentStatus: 'PENDING',
        subtotal: new Prisma.Decimal('10000'),
        shippingFee: new Prisma.Decimal('0'),
        total: new Prisma.Decimal('10000'),
        fullName: 'علی احمدی',
        phone: '09123456789',
        province: 'مازندران',
        city: 'ساری',
        address: 'ساری',
        postalCode: null,
        createdAt: new Date('2026-09-29T00:00:00.000Z'),
        userId: USER_ID,
        user: { mobile: '+989170000001' },
        items: [],
      });

      const result = await service.transitionStatus(
        OPERATOR_ID,
        'order-1',
        'PROCESSING',
      );

      expect(result.status).toBe('PROCESSING');
      expect(result.paymentStatus).toBe('PENDING');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: OPERATOR_ID,
          action: 'ORDER_STATUS_CHANGED',
          entity: 'Order',
          entityId: 'order-1',
        }),
      );
    });

    it('flips COD to PAID exactly on the DELIVERED transition', async () => {
      prisma.order.findUnique.mockResolvedValueOnce(
        storedOrder({ status: 'SHIPPED' }),
      );
      prisma.order.update.mockResolvedValue({
        status: 'DELIVERED',
        paymentStatus: 'PAID',
      });
      prisma.order.findUnique.mockResolvedValueOnce({
        ...storedOrder(),
        status: 'DELIVERED',
        paymentMethod: 'COD',
        paymentStatus: 'PAID',
        subtotal: new Prisma.Decimal('10000'),
        shippingFee: new Prisma.Decimal('0'),
        total: new Prisma.Decimal('10000'),
        fullName: 'علی احمدی',
        phone: '09123456789',
        province: null,
        city: null,
        address: 'ساری',
        postalCode: null,
        createdAt: new Date('2026-09-29T00:00:00.000Z'),
        userId: USER_ID,
        user: { mobile: '+989170000001' },
        items: [],
      });

      const result = await service.transitionStatus(
        OPERATOR_ID,
        'order-1',
        'DELIVERED',
      );

      expect(result.status).toBe('DELIVERED');
      expect(result.paymentStatus).toBe('PAID');
      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ paymentStatus: 'PAID' }),
        }),
      );
    });

    it('409s an illegal jump (PENDING → DELIVERED)', async () => {
      prisma.order.findUnique.mockResolvedValue(storedOrder());

      await expect(
        service.transitionStatus(OPERATOR_ID, 'order-1', 'DELIVERED'),
      ).rejects.toMatchObject({ status: 409 });
      expect(prisma.order.update).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('409s transitions out of terminal states', async () => {
      prisma.order.findUnique.mockResolvedValue(
        storedOrder({ status: 'DELIVERED', paymentStatus: 'PAID' }),
      );

      await expect(
        service.transitionStatus(OPERATOR_ID, 'order-1', 'CANCELLED'),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('404s unknown orders', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await expect(
        service.transitionStatus(OPERATOR_ID, 'missing', 'PROCESSING'),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('operator reads (SS-240A)', () => {
    it('lists every row newest-first with owner + mobile', async () => {
      prisma.$transaction.mockResolvedValue([
        1,
        [
          {
            id: 'order-1',
            orderNumber: 100001,
            status: 'PENDING',
            total: new Prisma.Decimal('10000'),
            createdAt: new Date('2026-09-29T00:00:00.000Z'),
            userId: USER_ID,
            paymentMethod: 'COD',
            paymentStatus: 'PENDING',
            user: { mobile: '+989170000001' },
            _count: { items: 2 },
          },
        ],
      ]);

      const result = await service.listAllOrders({ page: 1, limit: 10 });

      expect(result.total).toBe(1);
      expect(result.items[0]).toMatchObject({
        id: 'order-1',
        userId: USER_ID,
        customerMobile: '+989170000001',
        paymentMethod: 'COD',
        statusFa: 'در انتظار بررسی',
      });
      expect(Object.keys(result.items[0]!).sort()).toEqual(
        [
          'createdAt',
          'customerMobile',
          'id',
          'itemCount',
          'orderNumber',
          'paymentMethod',
          'paymentStatus',
          'status',
          'statusFa',
          'total',
          'userId',
        ].sort(),
      );
    });

    it('returns admin detail with owner + mobile', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        orderNumber: 100001,
        status: 'PENDING',
        paymentMethod: 'COD',
        paymentStatus: 'PENDING',
        subtotal: new Prisma.Decimal('10000'),
        shippingFee: new Prisma.Decimal('0'),
        total: new Prisma.Decimal('10000'),
        fullName: 'علی احمدی',
        phone: '09123456789',
        province: null,
        city: null,
        address: 'ساری',
        postalCode: null,
        createdAt: new Date('2026-09-29T00:00:00.000Z'),
        userId: USER_ID,
        user: { mobile: '+989170000001' },
        items: [],
      });

      const result = await service.adminDetail('order-1');

      expect(result.userId).toBe(USER_ID);
      expect(result.customerMobile).toBe('+989170000001');
      expect(Object.keys(result).sort()).toEqual(
        [
          'addressSnapshot',
          'createdAt',
          'customerMobile',
          'id',
          'items',
          'orderNumber',
          'paymentMethod',
          'paymentStatus',
          'shippingFee',
          'status',
          'statusFa',
          'subtotal',
          'total',
          'userId',
        ].sort(),
      );
    });
  });

    it('replays the winner\u2019s order when the accept race is lost (P2025)', async () => {
      const raceError = Object.assign(new Error('No record found'), {
        code: 'P2025',
      });
      Object.setPrototypeOf(
        raceError,
        Prisma.PrismaClientKnownRequestError.prototype,
      );
      tx.rfq.update.mockRejectedValue(raceError);
      (stores as Record<string, unknown>).rfq = {
        findUnique: jest.fn().mockResolvedValue({
          status: 'ACCEPTED',
          order: {
            id: 'order-winner',
            orderNumber: 100007,
            status: 'PENDING',
            total: new Prisma.Decimal('4500'),
          },
        }),
      };

      const result = await quoted.placeQuotedOrder(USER_ID, quotedInput());

      expect(result).toEqual({
        orderId: 'order-winner',
        orderNumber: 100007,
        status: 'PENDING',
        total: '4500',
      });
      // Consumed stock re-entered availability before the replay.
      expect(ledger.receive).toHaveBeenCalledWith(
        expect.objectContaining({ variantId: VARIANT_ID, quantity: 5 }),
        USER_ID,
      );
    });
  });
});
