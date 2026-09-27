import { PartnerApprovalStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { PricingService, bulkPercentFor } from './pricing.service';
import type { PromotionRow } from './pricing.service';

const D = (v: string | number) => new Prisma.Decimal(v);

function promo(overrides: Partial<PromotionRow> = {}): PromotionRow {
  return {
    type: 'PERCENT',
    value: D(10),
    productId: null,
    categoryId: null,
    brandId: null,
    minQuantity: 1,
    ...overrides,
  };
}

describe('PricingService (SS-235)', () => {
  describe('bulkPercentFor', () => {
    it.each([
      [1, 0],
      [9, 0],
      [10, 3],
      [49, 3],
      [50, 7],
      [99, 7],
      [100, 10],
      [500, 10],
    ])('quantity %i → %i%%', (qty, expected) => {
      expect(bulkPercentFor(qty)).toBe(expected);
    });
  });

  describe('resolveLine (pure math)', () => {
    it('passes retail through with no discounts', () => {
      expect(PricingService.resolveLine(D(5000), 2, D(0), []).toString()).toBe('5000');
    });

    it('applies the partner tier percent', () => {
      // 5000 − 10% = 4500.
      expect(PricingService.resolveLine(D(5000), 1, D(10), []).toString()).toBe('4500');
    });

    it('applies bulk after tier (PRICE-006)', () => {
      // 10000 − 10% tier = 9000; qty 10 → −3% bulk = 8730.
      expect(PricingService.resolveLine(D(10000), 10, D(10), []).toString()).toBe('8730');
    });

    it('applies a percent promotion on the post-tier, post-bulk unit', () => {
      // 10000 − 20% = 8000; covered by minQuantity.
      const result = PricingService.resolveLine(D(10000), 2, D(20), [promo()]);
      expect(result.toString()).toBe('7200');
    });

    it('applies a fixed promotion as a Rial amount off', () => {
      const result = PricingService.resolveLine(D(10000), 1, D(0), [
        promo({ type: 'FIXED', value: D(1500) }),
      ]);
      expect(result.toString()).toBe('8500');
    });

    it('skips promotions below their minQuantity', () => {
      const result = PricingService.resolveLine(D(10000), 1, D(0), [
        promo({ minQuantity: 2 }),
      ]);
      expect(result.toString()).toBe('10000');
    });

    it('picks the best promotion and ignores invalid rows', () => {
      const result = PricingService.resolveLine(D(10000), 1, D(0), [
        promo({ value: D(5) }),
        promo({ type: 'FIXED', value: D(2000) }),
        promo({ value: D(150) }),
        promo({ type: 'FIXED', value: D(-100) }),
      ]);
      // 5% → 9500; 2000 off → 8000 wins; invalid rows ignored.
      expect(result.toString()).toBe('8000');
    });

    it('never returns a negative price (PRICE-005)', () => {
      const result = PricingService.resolveLine(D(1000), 1, D(0), [
        promo({ type: 'FIXED', value: D(5000) }),
      ]);
      expect(result.toString()).toBe('0');
    });

    it('rounds fractional Rial results to integers', () => {
      // 1000 − 3% bulk (qty 10) = 970 exactly; tier 33% on 1000 = 670.
      expect(PricingService.resolveLine(D(1000), 10, D(33), []).toString()).toBe(
        '650',
      );
    });
  });

  describe('tierDiscountForUser', () => {
    function serviceWith(partner: unknown, shouldThrow = false) {
      const prisma = {
        partner: {
          findFirst: shouldThrow
            ? jest.fn().mockRejectedValue(new Error('db down'))
            : jest.fn().mockResolvedValue(partner),
        },
      } as unknown as PrismaService;
      return new PricingService(prisma);
    }

    it('returns zero when the user has no partner record', async () => {
      const service = serviceWith(null);
      await expect(service.tierDiscountForUser('user-1')).resolves.toEqual(D(0));
    });

    it('returns the APPROVED partner tier percent and scopes the lookup', async () => {
      const prisma = {
        partner: {
          findFirst: jest.fn().mockResolvedValue({
            tier: { discountPercent: new Prisma.Decimal('12.5') },
          }),
        },
      } as unknown as PrismaService;
      const service = new PricingService(prisma);

      await expect(service.tierDiscountForUser('user-1')).resolves.toEqual(D('12.5'));
      expect(prisma.partner.findFirst).toHaveBeenCalledWith({
        where: {
          profile: { userId: 'user-1' },
          approvalStatus: PartnerApprovalStatus.APPROVED,
          deletedAt: null,
        },
        select: { tier: { select: { discountPercent: true } } },
      });
    });

    it('returns zero without a tier, with an out-of-range percent, or on DB error', async () => {
      await expect(
        serviceWith({ tier: null }).tierDiscountForUser('u'),
      ).resolves.toEqual(D(0));
      await expect(
        serviceWith({ tier: { discountPercent: D(150) } }).tierDiscountForUser('u'),
      ).resolves.toEqual(D(0));
      await expect(
        serviceWith(null, true).tierDiscountForUser('u'),
      ).resolves.toEqual(D(0));
    });
  });

  describe('activePromotionsFor', () => {
    const scope = { productId: 'p-1', categoryId: 'c-1', brandId: null };

    it('queries the active window with product/category/brand/sitewide scopes', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const prisma = { promotion: { findMany } } as unknown as PrismaService;
      const service = new PricingService(prisma);

      await service.activePromotionsFor(scope);
      expect(findMany).toHaveBeenCalledWith({
        where: {
          isActive: true,
          startsAt: { lte: expect.any(Date) },
          endsAt: { gte: expect.any(Date) },
          OR: [
            { productId: 'p-1' },
            { categoryId: 'c-1' },
            { productId: null, categoryId: null, brandId: null },
          ],
        },
        select: {
          type: true,
          value: true,
          productId: true,
          categoryId: true,
          brandId: true,
          minQuantity: true,
        },
      });
    });

    it('degrades to no promotions on DB error', async () => {
      const prisma = {
        promotion: { findMany: jest.fn().mockRejectedValue(new Error('db down')) },
      } as unknown as PrismaService;
      const service = new PricingService(prisma);

      await expect(service.activePromotionsFor(scope)).resolves.toEqual([]);
    });
  });
});
