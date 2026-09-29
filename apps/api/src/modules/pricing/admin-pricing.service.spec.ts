import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PromotionType } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AdminPricingService } from './admin-pricing.service';

const OPERATOR_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const RULE_ID = '4fa85f64-5717-4562-b3fc-2c963f66afa6';
const OVERRIDE_ID = '5fa85f64-5717-4562-b3fc-2c963f66afa6';
const PROMO_ID = '6fa85f64-5717-4562-b3fc-2c963f66afa6';
const CATEGORY_ID = '7fa85f64-5717-4562-b3fc-2c963f66afa6';
const PRODUCT_ID = '8fa85f64-5717-4562-b3fc-2c963f66afa6';
const UNKNOWN_ID = '9fa85f64-5717-4562-b3fc-2c963f66afa6';

function ruleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: RULE_ID,
    categoryId: CATEGORY_ID,
    category: { name: 'لوازم خانگی' },
    type: PromotionType.PERCENT,
    value: new Prisma.Decimal('10.00'),
    isActive: true,
    startsAt: null,
    endsAt: null,
    priority: 0,
    createdAt: new Date('2026-09-29T00:00:00.000Z'),
    updatedAt: new Date('2026-09-29T00:00:00.000Z'),
    ...overrides,
  };
}

function overrideRow(overrides: Record<string, unknown> = {}) {
  return {
    id: OVERRIDE_ID,
    productId: PRODUCT_ID,
    product: { name: 'پاوربانک' },
    type: PromotionType.FIXED,
    value: new Prisma.Decimal('5000.00'),
    isActive: true,
    startsAt: null,
    endsAt: null,
    createdAt: new Date('2026-09-29T00:00:00.000Z'),
    updatedAt: new Date('2026-09-29T00:00:00.000Z'),
    ...overrides,
  };
}

function promotionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PROMO_ID,
    code: 'YALDA-10',
    titleFa: 'فروش ویژه یلدا',
    type: PromotionType.PERCENT,
    value: new Prisma.Decimal('10.00'),
    startsAt: new Date('2026-10-01T00:00:00.000Z'),
    endsAt: new Date('2026-12-31T00:00:00.000Z'),
    isActive: true,
    productId: null,
    categoryId: null,
    brandId: null,
    minQuantity: 1,
    createdAt: new Date('2026-09-29T00:00:00.000Z'),
    updatedAt: new Date('2026-09-29T00:00:00.000Z'),
    ...overrides,
  };
}

describe('AdminPricingService (SS-240B)', () => {
  let service: AdminPricingService;
  let prisma: {
    category: { findFirst: jest.Mock };
    product: { findFirst: jest.Mock };
    categoryPriceRule: {
      count: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    productPriceOverride: {
      count: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    promotion: {
      count: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let audit: { log: jest.Mock };

  beforeEach(() => {
    prisma = {
      category: { findFirst: jest.fn() },
      product: { findFirst: jest.fn() },
      categoryPriceRule: {
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      productPriceOverride: {
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      promotion: {
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    audit = { log: jest.fn() };
    service = new AdminPricingService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
  });

  describe('category rules', () => {
    it('creates a rule with a CREATED audit event and string Decimal', async () => {
      prisma.category.findFirst.mockResolvedValue({ id: CATEGORY_ID });
      prisma.categoryPriceRule.create.mockResolvedValue(ruleRow());

      const result = await service.createRule(
        OPERATOR_ID,
        { categoryId: CATEGORY_ID, type: 'PERCENT', value: '10.00' },
        '1.2.3.4',
      );

      expect(result).toMatchObject({
        id: RULE_ID,
        categoryId: CATEGORY_ID,
        categoryName: 'لوازم خانگی',
        type: 'PERCENT',
        value: '10',
        priority: 0,
      });
      expect(prisma.categoryPriceRule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ createdBy: OPERATOR_ID }),
        }),
      );
      expect(audit.log).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: OPERATOR_ID,
          action: 'CATEGORY_PRICE_RULE_CREATED',
          entity: 'CategoryPriceRule',
          entityId: RULE_ID,
          ipAddress: '1.2.3.4',
        }),
      );
    });

    it('404s when the category is missing or soft-deleted', async () => {
      prisma.category.findFirst.mockResolvedValue(null);

      await expect(
        service.createRule(OPERATOR_ID, {
          categoryId: UNKNOWN_ID,
          type: 'PERCENT',
          value: '10.00',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('400s on an inverted window and on PERCENT > 100', async () => {
      prisma.category.findFirst.mockResolvedValue({ id: CATEGORY_ID });

      await expect(
        service.createRule(OPERATOR_ID, {
          categoryId: CATEGORY_ID,
          type: 'PERCENT',
          value: '10.00',
          startsAt: '2026-12-31T00:00:00.000Z',
          endsAt: '2026-10-01T00:00:00.000Z',
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.createRule(OPERATOR_ID, {
          categoryId: CATEGORY_ID,
          type: 'PERCENT',
          value: '101.00',
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.createRule(OPERATOR_ID, {
          categoryId: CATEGORY_ID,
          type: 'FIXED',
          value: '0.00',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('lists newest-first with the page/limit envelope', async () => {
      prisma.$transaction.mockResolvedValue([1, [ruleRow()]]);

      const result = await service.listRules({ page: 1, limit: 20 });

      expect(result).toMatchObject({ total: 1, page: 1, limit: 20 });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.value).toBe('10');
      expect(prisma.categoryPriceRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
      );
    });

    it('404s unknown rule ids on read, update and delete', async () => {
      prisma.categoryPriceRule.findUnique.mockResolvedValue(null);

      await expect(service.getRule(UNKNOWN_ID)).rejects.toThrow(NotFoundException);
      await expect(
        service.updateRule(OPERATOR_ID, UNKNOWN_ID, { priority: 5 }),
      ).rejects.toThrow(NotFoundException);
      await expect(service.deleteRule(OPERATOR_ID, UNKNOWN_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('updates with before/after snapshots and deletes with one audit each', async () => {
      prisma.categoryPriceRule.findUnique.mockResolvedValue(ruleRow());
      prisma.categoryPriceRule.update.mockResolvedValue(
        ruleRow({ priority: 5, value: new Prisma.Decimal('15.00') }),
      );

      const updated = await service.updateRule(
        OPERATOR_ID,
        RULE_ID,
        { priority: 5, value: '15.00' },
        '1.2.3.4',
      );

      expect(updated.priority).toBe(5);
      expect(updated.value).toBe('15');
      expect(audit.log).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CATEGORY_PRICE_RULE_UPDATED',
          entity: 'CategoryPriceRule',
          before: expect.objectContaining({ priority: 0 }),
          after: expect.objectContaining({ priority: 5 }),
        }),
      );

      prisma.categoryPriceRule.delete.mockResolvedValue(ruleRow());
      const deleted = await service.deleteRule(OPERATOR_ID, RULE_ID);
      expect(deleted.id).toBe(RULE_ID);
      expect(audit.log).toHaveBeenCalledTimes(2);
      expect(audit.log).toHaveBeenLastCalledWith(
        expect.objectContaining({
          action: 'CATEGORY_PRICE_RULE_DELETED',
          after: null,
        }),
      );
    });
  });

  describe('product overrides', () => {
    it('creates an override with a CREATED audit event', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: PRODUCT_ID });
      prisma.productPriceOverride.findUnique.mockResolvedValue(null);
      prisma.productPriceOverride.create.mockResolvedValue(overrideRow());

      const result = await service.createOverride(OPERATOR_ID, {
        productId: PRODUCT_ID,
        type: 'FIXED',
        value: '5000.00',
      });

      expect(result).toMatchObject({
        id: OVERRIDE_ID,
        productId: PRODUCT_ID,
        productName: 'پاوربانک',
        value: '5000',
      });
      expect(audit.log).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PRODUCT_PRICE_OVERRIDE_CREATED',
          entity: 'ProductPriceOverride',
        }),
      );
    });

    it('404s unknown products and 409s duplicate overrides', async () => {
      prisma.product.findFirst.mockResolvedValue(null);
      await expect(
        service.createOverride(OPERATOR_ID, {
          productId: UNKNOWN_ID,
          type: 'FIXED',
          value: '5000.00',
        }),
      ).rejects.toThrow(NotFoundException);

      prisma.product.findFirst.mockResolvedValue({ id: PRODUCT_ID });
      prisma.productPriceOverride.findUnique.mockResolvedValue({ id: OVERRIDE_ID });
      await expect(
        service.createOverride(OPERATOR_ID, {
          productId: PRODUCT_ID,
          type: 'FIXED',
          value: '5000.00',
        }),
      ).rejects.toThrow(ConflictException);
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('maps a P2002 race to 409', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: PRODUCT_ID });
      prisma.productPriceOverride.findUnique.mockResolvedValue(null);
      prisma.productPriceOverride.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.createOverride(OPERATOR_ID, {
          productId: PRODUCT_ID,
          type: 'FIXED',
          value: '5000.00',
        }),
      ).rejects.toThrow(ConflictException);
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('reads, updates and deletes with audits, 404ing unknown ids', async () => {
      prisma.productPriceOverride.findUnique.mockResolvedValue(null);
      await expect(service.getOverride(UNKNOWN_ID)).rejects.toThrow(NotFoundException);

      prisma.productPriceOverride.findUnique.mockResolvedValue(overrideRow());
      expect(await service.getOverride(OVERRIDE_ID)).toMatchObject({
        productName: 'پاوربانک',
      });

      prisma.productPriceOverride.update.mockResolvedValue(
        overrideRow({ value: new Prisma.Decimal('7000.00') }),
      );
      const updated = await service.updateOverride(OPERATOR_ID, OVERRIDE_ID, {
        value: '7000.00',
      });
      expect(updated.value).toBe('7000');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PRODUCT_PRICE_OVERRIDE_UPDATED' }),
      );

      prisma.productPriceOverride.delete.mockResolvedValue(overrideRow());
      await service.deleteOverride(OPERATOR_ID, OVERRIDE_ID);
      expect(audit.log).toHaveBeenLastCalledWith(
        expect.objectContaining({ action: 'PRODUCT_PRICE_OVERRIDE_DELETED' }),
      );
    });
  });

  describe('promotions', () => {
    const createInput = {
      code: 'YALDA-10',
      titleFa: 'فروش ویژه یلدا',
      type: 'PERCENT' as const,
      value: '10.00',
      startsAt: '2026-10-01T00:00:00.000Z',
      endsAt: '2026-12-31T00:00:00.000Z',
    };

    it('creates a sitewide promotion with a CREATED audit event', async () => {
      prisma.promotion.findUnique.mockResolvedValue(null);
      prisma.promotion.create.mockResolvedValue(promotionRow());

      const result = await service.createPromotion(OPERATOR_ID, createInput);

      expect(result).toMatchObject({
        code: 'YALDA-10',
        titleFa: 'فروش ویژه یلدا',
        productId: null,
        categoryId: null,
        brandId: null,
        minQuantity: 1,
      });
      expect(audit.log).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PROMOTION_CREATED',
          entity: 'Promotion',
        }),
      );
    });

    it('409s duplicate codes and 400s bad windows', async () => {
      prisma.promotion.findUnique.mockResolvedValue({ id: PROMO_ID });
      await expect(service.createPromotion(OPERATOR_ID, createInput)).rejects.toThrow(
        ConflictException,
      );

      prisma.promotion.findUnique.mockResolvedValue(null);
      await expect(
        service.createPromotion(OPERATOR_ID, {
          ...createInput,
          code: 'OTHER',
          startsAt: '2026-12-31T00:00:00.000Z',
          endsAt: '2026-12-31T00:00:00.000Z',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('updates with code-conflict detection and deletes with audits', async () => {
      prisma.promotion.findUnique.mockResolvedValue(null);
      await expect(service.getPromotion(UNKNOWN_ID)).rejects.toThrow(
        NotFoundException,
      );
      await expect(
        service.updatePromotion(OPERATOR_ID, UNKNOWN_ID, { titleFa: 'x' }),
      ).rejects.toThrow(NotFoundException);

      prisma.promotion.findUnique.mockResolvedValue(promotionRow());
      prisma.promotion.update.mockResolvedValue(
        promotionRow({ titleFa: 'ویرایش‌شده' }),
      );
      const updated = await service.updatePromotion(OPERATOR_ID, PROMO_ID, {
        titleFa: 'ویرایش‌شده',
      });
      expect(updated.titleFa).toBe('ویرایش‌شده');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PROMOTION_UPDATED' }),
      );

      prisma.promotion.findUnique
        .mockResolvedValueOnce(promotionRow())
        .mockResolvedValueOnce(promotionRow({ id: 'other-promo-id' }));
      await expect(
        service.updatePromotion(OPERATOR_ID, PROMO_ID, { code: 'TAKEN' }),
      ).rejects.toThrow(ConflictException);

      prisma.promotion.findUnique.mockResolvedValue(promotionRow());
      prisma.promotion.delete.mockResolvedValue(promotionRow());
      await service.deletePromotion(OPERATOR_ID, PROMO_ID);
      expect(audit.log).toHaveBeenLastCalledWith(
        expect.objectContaining({ action: 'PROMOTION_DELETED', after: null }),
      );
    });
  });
});
