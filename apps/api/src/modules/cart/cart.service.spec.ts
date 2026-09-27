import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import { CartService } from './cart.service';

const USER_ID = 'user-1';
const CART_ID = 'cart-1';
const VARIANT_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';

function makeLine(
  overrides: Record<string, unknown> = {},
  variantOverrides: Record<string, unknown> = {},
) {
  return {
    id: 'line-1',
    quantity: 2,
    unitPriceAtAdd: new Prisma.Decimal('5000'),
    createdAt: new Date('2026-09-03T00:00:00.000Z'),
    variantId: VARIANT_ID,
    variant: {
      sku: 'SKU-1',
      name: 'مدل مشکی',
      price: new Prisma.Decimal('5000'),
      priceStatus: 'PRICED',
      deletedAt: null,
      product: {
        id: PRODUCT_ID,
        name: 'گوشی موبایل',
        slug: 'phone-1',
        status: 'PUBLISHED',
        deletedAt: null,
      },
      ...variantOverrides,
    },
    ...overrides,
  };
}

describe('CartService', () => {
  let service: CartService;
  let pricing: {
    tierDiscountForUser: jest.Mock;
    activePromotionsFor: jest.Mock;
  };
  let prisma: {
    cart: { findUnique: jest.Mock; create: jest.Mock; findUniqueOrThrow: jest.Mock };
    cartItem: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      deleteMany: jest.Mock;
    };
    product: { findFirst: jest.Mock };
    productVariant: { findFirst: jest.Mock; findMany: jest.Mock };
    inventoryItem: { findMany: jest.Mock };
    productMedia: { findMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      cart: { findUnique: jest.fn(), create: jest.fn(), findUniqueOrThrow: jest.fn() },
      cartItem: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      product: { findFirst: jest.fn() },
      productVariant: { findFirst: jest.fn(), findMany: jest.fn() },
      inventoryItem: { findMany: jest.fn() },
      productMedia: { findMany: jest.fn() },
    };
    prisma.inventoryItem.findMany.mockResolvedValue([
      { variantId: VARIANT_ID, quantityOnHand: 10, quantityReserved: 2 },
    ]);
    prisma.productMedia.findMany.mockResolvedValue([]);
    // SS-235: retail by default (no tier, no promotions) so legacy price
    // assertions keep proving the base-price path.
    pricing = {
      tierDiscountForUser: jest.fn().mockResolvedValue(new Prisma.Decimal(0)),
      activePromotionsFor: jest.fn().mockResolvedValue([]),
    };
    service = new CartService(
      prisma as unknown as PrismaService,
      pricing as unknown as PricingService,
    );
  });

  describe('list', () => {
    it('returns an empty cart without touching inventory when the user has no cart', async () => {
      prisma.cart.findUnique.mockResolvedValue(null);

      await expect(service.list(USER_ID)).resolves.toEqual({
        items: [],
        totalQuantity: 0,
        subtotal: '0',
      });
      expect(prisma.inventoryItem.findMany).not.toHaveBeenCalled();
    });

    it('hydrates visible lines with live prices, totals, and stock', async () => {
      prisma.cart.findUnique.mockResolvedValue({ id: CART_ID });
      prisma.cartItem.findMany.mockResolvedValue([makeLine()]);

      const result = await service.list(USER_ID);

      expect(result.totalQuantity).toBe(2);
      expect(result.subtotal).toBe('10000');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        variantId: VARIANT_ID,
        productId: PRODUCT_ID,
        productSlug: 'phone-1',
        productName: 'گوشی موبایل',
        variantSku: 'SKU-1',
        variantName: 'مدل مشکی',
        quantity: 2,
        unitPrice: '5000',
        unitPriceAtAdd: '5000',
        lineTotal: '10000',
        priceChanged: false,
        priceStatus: 'PRICED',
        available: 8,
        inStock: true,
        primaryImageUrl: null,
        addedAt: '2026-09-03T00:00:00.000Z',
      });
    });

    it('flags lines whose live price drifted from the snapshot', async () => {
      prisma.cart.findUnique.mockResolvedValue({ id: CART_ID });
      prisma.cartItem.findMany.mockResolvedValue([
        makeLine({}, { price: new Prisma.Decimal('6000') }),
      ]);

      const result = await service.list(USER_ID);

      expect(result.items[0]).toMatchObject({
        unitPrice: '6000',
        unitPriceAtAdd: '5000',
        lineTotal: '12000',
        priceChanged: true,
      });
      expect(result.subtotal).toBe('12000');
    });

    it('skips lines whose variant or product is no longer visible', async () => {
      prisma.cart.findUnique.mockResolvedValue({ id: CART_ID });
      prisma.cartItem.findMany.mockResolvedValue([
        makeLine({ variantId: 'gone-1' }, { deletedAt: new Date() }),
        makeLine({ variantId: 'live-1' }),
      ]);

      const result = await service.list(USER_ID);

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.variantId).toBe('live-1');
      expect(result.totalQuantity).toBe(2);
    });
  });

  describe('add', () => {
    beforeEach(() => {
      prisma.productVariant.findFirst.mockResolvedValue({
        price: new Prisma.Decimal('5000'),
        priceStatus: 'PRICED',
      });
      prisma.cart.findUnique.mockResolvedValue({ id: CART_ID });
      prisma.cartItem.findUnique.mockResolvedValue(null);
    });

    function mockSingleHydration() {
      prisma.cartItem.findUniqueOrThrow.mockResolvedValue(makeLine());
    }

    it('creates the line and returns 201 semantics', async () => {
      prisma.cartItem.create.mockResolvedValue({ id: 'line-1' });
      mockSingleHydration();

      const result = await service.add(USER_ID, { variantId: VARIANT_ID }, 2);

      expect(result.created).toBe(true);
      expect(prisma.cartItem.create).toHaveBeenCalledWith({
        data: {
          cartId: CART_ID,
          variantId: VARIANT_ID,
          quantity: 2,
          unitPriceAtAdd: new Prisma.Decimal('5000'),
        },
      });
      expect(result.item.quantity).toBe(2);
    });

    it('increments an existing line (200 semantics) without touching the snapshot', async () => {
      prisma.cartItem.findUnique.mockResolvedValue({ id: 'line-1', quantity: 2 });
      prisma.cartItem.update.mockResolvedValue({ id: 'line-1' });
      mockSingleHydration();

      const result = await service.add(USER_ID, { variantId: VARIANT_ID }, 3);

      expect(result.created).toBe(false);
      expect(prisma.cartItem.update).toHaveBeenCalledWith({
        where: { id: 'line-1' },
        data: { quantity: 5 },
      });
      expect(prisma.cartItem.create).not.toHaveBeenCalled();
    });

    it('creates the cart on first add', async () => {
      prisma.cart.findUnique.mockResolvedValue(null);
      prisma.cart.create.mockResolvedValue({ id: CART_ID });
      prisma.cartItem.create.mockResolvedValue({ id: 'line-1' });
      mockSingleHydration();

      const result = await service.add(USER_ID, { variantId: VARIANT_ID }, 1);

      expect(prisma.cart.create).toHaveBeenCalledWith({
        data: { userId: USER_ID },
        select: { id: true },
      });
      expect(result.created).toBe(true);
    });

    it('rejects unknown or unpublished variants with 404', async () => {
      prisma.productVariant.findFirst.mockResolvedValue(null);

      await expect(service.add(USER_ID, { variantId: VARIANT_ID }, 1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.cartItem.create).not.toHaveBeenCalled();
    });

    it('rejects call-for-price variants with 422', async () => {
      prisma.productVariant.findFirst.mockResolvedValue({
        price: new Prisma.Decimal('0'),
        priceStatus: 'CALL_FOR_PRICE',
      });

      await expect(service.add(USER_ID, { variantId: VARIANT_ID }, 1)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(prisma.cartItem.create).not.toHaveBeenCalled();
    });

    it('rejects quantities above available stock with a 409 carrying the count', async () => {
      prisma.cartItem.create.mockResolvedValue({ id: 'line-1' });

      const error = await service
        .add(USER_ID, { variantId: VARIANT_ID }, 9)
        .catch((error: unknown) => error);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        statusCode: 409,
        available: 8,
      });
      expect(prisma.cartItem.create).not.toHaveBeenCalled();
    });

    it('survives a concurrent-insert race as a non-create increment', async () => {
      prisma.cartItem.create.mockRejectedValue(new Error('P2002 race'));
      prisma.cartItem.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'line-1',
        quantity: 1,
      });
      prisma.cartItem.update.mockResolvedValue({ id: 'line-1' });
      mockSingleHydration();

      const result = await service.add(USER_ID, { variantId: VARIANT_ID }, 2);

      expect(result.created).toBe(false);
      expect(prisma.cartItem.update).toHaveBeenCalledWith({
        where: { id: 'line-1' },
        data: { quantity: 3 },
      });
    });
  });

  describe('add by productId (quick-add)', () => {
    const PRODUCT_UUID = '22222222-2222-4222-8222-222222222222';

    beforeEach(() => {
      prisma.cart.findUnique.mockResolvedValue({ id: CART_ID });
      prisma.cartItem.findUnique.mockResolvedValue(null);
      prisma.cartItem.create.mockResolvedValue({ id: 'line-1' });
      prisma.product.findFirst.mockResolvedValue({ id: PRODUCT_UUID });
      prisma.productVariant.findFirst.mockResolvedValue({
        price: new Prisma.Decimal('5000'),
        priceStatus: 'PRICED',
      });
    });

    it('resolves the first in-stock PRICED variant in catalog order', async () => {
      prisma.productVariant.findMany.mockResolvedValue([{ id: 'v-oos' }, { id: 'v-live' }]);
      prisma.inventoryItem.findMany.mockResolvedValue([
        { variantId: 'v-oos', quantityOnHand: 0, quantityReserved: 0 },
        { variantId: 'v-live', quantityOnHand: 5, quantityReserved: 0 },
      ]);
      prisma.cartItem.findUniqueOrThrow.mockResolvedValue(
        makeLine({ variantId: 'v-live' }),
      );

      const result = await service.add(USER_ID, { productId: PRODUCT_UUID }, 2);

      expect(result.created).toBe(true);
      expect(prisma.cartItem.create).toHaveBeenCalledWith({
        data: {
          cartId: CART_ID,
          variantId: 'v-live',
          quantity: 2,
          unitPriceAtAdd: new Prisma.Decimal('5000'),
        },
      });
      expect(result.item.variantId).toBe('v-live');
    });

    it('rejects a missing identity with 400', async () => {
      await expect(service.add(USER_ID, {}, 1)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.cartItem.create).not.toHaveBeenCalled();
    });

    it('rejects unknown products with 404', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(
        service.add(USER_ID, { productId: PRODUCT_UUID }, 1),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects products without PRICED variants with 422', async () => {
      prisma.productVariant.findMany.mockResolvedValue([]);

      await expect(
        service.add(USER_ID, { productId: PRODUCT_UUID }, 1),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('rejects fully out-of-stock products with 409 (available 0)', async () => {
      prisma.productVariant.findMany.mockResolvedValue([{ id: 'v-oos' }]);
      prisma.inventoryItem.findMany.mockResolvedValue([
        { variantId: 'v-oos', quantityOnHand: 0, quantityReserved: 0 },
      ]);

      const error = await service
        .add(USER_ID, { productId: PRODUCT_UUID }, 1)
        .catch((error: unknown) => error);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        available: 0,
      });
    });
  });

  describe('setQuantity', () => {
    it('sets the absolute quantity', async () => {
      prisma.cart.findUnique.mockResolvedValue({ id: CART_ID });
      prisma.cartItem.findUnique.mockResolvedValue({ id: 'line-1' });
      prisma.productVariant.findFirst.mockResolvedValue({
        price: new Prisma.Decimal('5000'),
        priceStatus: 'PRICED',
      });
      prisma.cartItem.update.mockResolvedValue({ id: 'line-1' });
      prisma.cartItem.findUniqueOrThrow.mockResolvedValue(makeLine({ quantity: 5 }));

      const item = await service.setQuantity(USER_ID, VARIANT_ID, 5);

      expect(prisma.cartItem.update).toHaveBeenCalledWith({
        where: { id: 'line-1' },
        data: { quantity: 5 },
      });
      expect(item.quantity).toBe(5);
    });

    it('rejects lines not in the cart with 404', async () => {
      prisma.cart.findUnique.mockResolvedValue(null);

      await expect(
        service.setQuantity(USER_ID, VARIANT_ID, 1),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.cartItem.update).not.toHaveBeenCalled();
    });

    it('rejects quantities above available stock with 409', async () => {
      prisma.cart.findUnique.mockResolvedValue({ id: CART_ID });
      prisma.cartItem.findUnique.mockResolvedValue({ id: 'line-1' });
      prisma.productVariant.findFirst.mockResolvedValue({
        price: new Prisma.Decimal('5000'),
        priceStatus: 'PRICED',
      });

      await expect(
        service.setQuantity(USER_ID, VARIANT_ID, 99),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.cartItem.update).not.toHaveBeenCalled();
    });
  });

  describe('remove / clear', () => {
    it('reports removed:true when a line was deleted', async () => {
      prisma.cart.findUnique.mockResolvedValue({ id: CART_ID });
      prisma.cartItem.deleteMany.mockResolvedValue({ count: 1 });

      await expect(service.remove(USER_ID, VARIANT_ID)).resolves.toEqual({
        removed: true,
      });
    });

    it('reports removed:false with no cart or no line (idempotent)', async () => {
      prisma.cart.findUnique.mockResolvedValue(null);

      await expect(service.remove(USER_ID, VARIANT_ID)).resolves.toEqual({
        removed: false,
      });

      prisma.cart.findUnique.mockResolvedValue({ id: CART_ID });
      prisma.cartItem.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.remove(USER_ID, VARIANT_ID)).resolves.toEqual({
        removed: false,
      });
    });

    it('clears all lines idempotently', async () => {
      prisma.cart.findUnique.mockResolvedValue({ id: CART_ID });
      prisma.cartItem.deleteMany.mockResolvedValue({ count: 3 });

      await expect(service.clear(USER_ID)).resolves.toEqual({ cleared: true });
      expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith({
        where: { cartId: CART_ID },
      });

      prisma.cart.findUnique.mockResolvedValue(null);

      await expect(service.clear(USER_ID)).resolves.toEqual({ cleared: true });
    });
  });
});
