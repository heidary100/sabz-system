import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, ReviewStatus } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { roundRatingAverage, ReviewsService } from './reviews.service';

const USER_ID = 'user-1';
const OPERATOR_ID = 'operator-1';
const REVIEW_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const PRODUCT_ID = '7fa85f64-5717-4562-b3fc-2c963f66afa6';

function reviewRow(overrides: Record<string, unknown> = {}) {
  return {
    id: REVIEW_ID,
    productId: PRODUCT_ID,
    rating: 5,
    comment: 'عالی بود.',
    status: ReviewStatus.PENDING,
    createdAt: new Date('2026-09-28T00:00:00.000Z'),
    ...overrides,
  };
}

describe('ReviewsService (SS-236)', () => {
  let service: ReviewsService;
  let prisma: {
    product: { findFirst: jest.Mock };
    review: {
      findUnique: jest.Mock;
      create: jest.Mock;
      count: jest.Mock;
      findMany: jest.Mock;
      aggregate: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let audit: { log: jest.Mock };

  beforeEach(() => {
    prisma = {
      product: { findFirst: jest.fn() },
      review: {
        findUnique: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
        aggregate: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    audit = { log: jest.fn() };
    service = new ReviewsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
  });

  describe('create', () => {
    it('files a PENDING review for a published product with an audit event', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: PRODUCT_ID });
      prisma.review.findUnique.mockResolvedValue(null);
      prisma.review.create.mockResolvedValue(reviewRow());

      const result = await service.create(
        USER_ID,
        { productId: PRODUCT_ID, rating: 5, comment: 'عالی بود.' },
        '1.2.3.4',
      );

      expect(result.status).toBe('PENDING');
      expect(result.statusFa).toBe('در انتظار بررسی');
      expect(result.rating).toBe(5);
      expect(prisma.review.create).toHaveBeenCalledWith({
        data: {
          userId: USER_ID,
          productId: PRODUCT_ID,
          rating: 5,
          comment: 'عالی بود.',
          status: ReviewStatus.PENDING,
          createdBy: USER_ID,
        },
        select: expect.anything(),
      });
      expect(audit.log).toHaveBeenCalledWith({
        userId: USER_ID,
        action: 'REVIEW_CREATED',
        entity: 'Review',
        entityId: REVIEW_ID,
        after: { productId: PRODUCT_ID, rating: 5 },
        ipAddress: '1.2.3.4',
      });
    });

    it('rejects unpublished products with 404', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(
        service.create(USER_ID, { productId: PRODUCT_ID, rating: 4 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.review.create).not.toHaveBeenCalled();
    });

    it('rejects a second review of the same product with 409', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: PRODUCT_ID });
      prisma.review.findUnique.mockResolvedValue({ id: REVIEW_ID });

      await expect(
        service.create(USER_ID, { productId: PRODUCT_ID, rating: 4 }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.review.create).not.toHaveBeenCalled();
    });

    it('maps a concurrent-insert race to 409 instead of a 500', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: PRODUCT_ID });
      prisma.review.findUnique.mockResolvedValue(null);
      prisma.review.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002',
          clientVersion: 'x',
        }),
      );

      await expect(
        service.create(USER_ID, { productId: PRODUCT_ID, rating: 4 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('listByProduct', () => {
    it('returns APPROVED rows with the aggregate average and audit-free reads', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: PRODUCT_ID });
      prisma.$transaction.mockResolvedValue([
        2,
        [reviewRow(), reviewRow({ id: 'other', rating: 4 })],
        {
          _avg: { rating: new Prisma.Decimal('4.5') },
          _count: { _all: 2 },
        },
      ]);

      const result = await service.listByProduct(PRODUCT_ID, {});

      expect(result.total).toBe(2);
      expect(result.ratingAverage).toBe(4.5);
      expect(result.ratingCount).toBe(2);
      expect(result.items).toHaveLength(2);
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('returns null average when no approved reviews exist', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: PRODUCT_ID });
      prisma.$transaction.mockResolvedValue([
        0,
        [],
        { _avg: { rating: null }, _count: { _all: 0 } },
      ]);

      const result = await service.listByProduct(PRODUCT_ID, {});

      expect(result).toMatchObject({
        items: [],
        total: 0,
        ratingAverage: null,
        ratingCount: 0,
      });
    });

    it('404s for unpublished products', async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      await expect(service.listByProduct(PRODUCT_ID, {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('moderation', () => {
    it('approves a pending review with an audit event', async () => {
      prisma.review.findUnique.mockResolvedValue({
        id: REVIEW_ID,
        status: ReviewStatus.PENDING,
      });
      prisma.review.update.mockResolvedValue(
        reviewRow({ status: ReviewStatus.APPROVED }),
      );

      const result = await service.approve(OPERATOR_ID, REVIEW_ID, '1.2.3.4');

      expect(result.status).toBe('APPROVED');
      expect(audit.log).toHaveBeenCalledWith({
        userId: OPERATOR_ID,
        action: 'REVIEW_APPROVED',
        entity: 'Review',
        entityId: REVIEW_ID,
        before: { status: 'PENDING' },
        after: { status: 'APPROVED' },
        ipAddress: '1.2.3.4',
      });
    });

    it('rejects a pending review with an audit event', async () => {
      prisma.review.findUnique.mockResolvedValue({
        id: REVIEW_ID,
        status: ReviewStatus.PENDING,
      });
      prisma.review.update.mockResolvedValue(
        reviewRow({ status: ReviewStatus.REJECTED }),
      );

      const result = await service.reject(OPERATOR_ID, REVIEW_ID);

      expect(result.status).toBe('REJECTED');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REVIEW_REJECTED' }),
      );
    });

    it('404s on unknown ids and 409s on already-moderated rows', async () => {
      prisma.review.findUnique.mockResolvedValue(null);
      await expect(service.approve(OPERATOR_ID, REVIEW_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      prisma.review.findUnique.mockResolvedValue({
        id: REVIEW_ID,
        status: ReviewStatus.APPROVED,
      });
      await expect(service.reject(OPERATOR_ID, REVIEW_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.review.update).not.toHaveBeenCalled();
    });
  });

  describe('roundRatingAverage', () => {
    it('rounds to 1 decimal', () => {
      expect(roundRatingAverage(new Prisma.Decimal('4.666'))).toBe(4.7);
      expect(roundRatingAverage(3)).toBe(3);
    });
  });
});
