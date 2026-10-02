import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductStatus, ReviewStatus } from '@prisma/client';
import type {
  AdminReviewListResponse,
  ReviewDto,
  ReviewListResponse,
  ReviewStatus as ReviewStatusDto,
} from '@sabz/types';
import { REVIEW_STATUS_FA } from '@sabz/types';
import { PrismaService } from '../../common/database/prisma.service';
import {
  productDetailTag,
  reviewProductTag,
} from '../../common/storefront-cache/catalog-tags';
import { StorefrontCacheService } from '../../common/storefront-cache/storefront-cache.service';
import { AuditService } from '../audit/audit.service';
import { CreateReviewDto, ListProductReviewsQueryDto } from './dto';

const REVIEW_SELECT = {
  id: true,
  productId: true,
  rating: true,
  comment: true,
  status: true,
  createdAt: true,
} as const;

const ADMIN_REVIEW_SELECT = {
  ...REVIEW_SELECT,
  product: { select: { name: true, slug: true } },
} as const;

type ReviewRow = Prisma.ReviewGetPayload<{ select: typeof REVIEW_SELECT }>;

type AdminReviewRow = Prisma.ReviewGetPayload<{
  select: typeof ADMIN_REVIEW_SELECT;
}>;

/** Round an aggregate average to 1 decimal (JSON-safe number). */
export function roundRatingAverage(value: Prisma.Decimal | number): number {
  return Math.round(Number(value) * 10) / 10;
}

/**
 * Product reviews (SS-236, master plan §5.8).
 *
 * Authors file once per published product (unique [userId, productId]);
 * every review starts PENDING and becomes publicly visible only after
 * operator moderation. Public reads (list + catalog aggregates) filter
 * APPROVED in the query, never in the component. Every transition writes
 * an audit event (spec §11 style: UPPER_SNAKE, entity 'Review').
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storefrontCache: StorefrontCacheService,
  ) {}

  /** Authenticated customer files a review for a published product. */
  async create(
    userId: string,
    dto: CreateReviewDto,
    ipAddress?: string,
  ): Promise<ReviewDto> {
    await this.requirePublishedProduct(dto.productId);

    const existing = await this.prisma.review.findUnique({
      where: { userId_productId: { userId, productId: dto.productId } },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('برای این محصول قبلاً دیدگاه ثبت کرده‌اید.');
    }

    try {
      const created = await this.prisma.review.create({
        data: {
          userId,
          productId: dto.productId,
          rating: dto.rating,
          comment: dto.comment ?? null,
          status: ReviewStatus.PENDING,
          createdBy: userId,
        },
        select: REVIEW_SELECT,
      });
      await this.audit.log({
        userId,
        action: 'REVIEW_CREATED',
        entity: 'Review',
        entityId: created.id,
        after: { productId: dto.productId, rating: dto.rating },
        ipAddress,
      });
      return toDto(created);
    } catch {
      // Lost a concurrent-insert race (unique [userId, productId]): the row
      // exists now, so report a 409 instead of a 500.
      throw new ConflictException('برای این محصول قبلاً دیدگاه ثبت کرده‌اید.');
    }
  }

  /** Public approved-review list for a published product, newest first. */
  async listByProduct(
    productId: string,
    query: ListProductReviewsQueryDto,
  ): Promise<ReviewListResponse> {
    await this.requirePublishedProduct(productId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const approved = { productId, status: ReviewStatus.APPROVED };
    const [total, rows, aggregate] = await this.prisma.$transaction([
      this.prisma.review.count({ where: approved }),
      this.prisma.review.findMany({
        where: approved,
        select: REVIEW_SELECT,
        orderBy: [
          { createdAt: 'desc' as const },
          { id: 'desc' as const },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.review.aggregate({
        where: approved,
        _avg: { rating: true },
        _count: { _all: true },
      }),
    ]);
    const ratingCount = aggregate._count._all;
    return {
      items: rows.map(toDto),
      total,
      page,
      limit,
      ratingAverage:
        ratingCount === 0 || aggregate._avg.rating === null
          ? null
          : roundRatingAverage(aggregate._avg.rating),
      ratingCount,
    };
  }

  /**
   * Moderation queue (SS-240D). Unscoped across all products, newest first
   * (createdAt DESC, id DESC). Defaults to the PENDING worklist; callers may
   * pass any status to audit already-moderated rows. Read-only — no audit.
   */
  async listForModeration(query: {
    status?: ReviewStatusDto;
    page?: number;
    limit?: number;
  }): Promise<AdminReviewListResponse> {
    const status = query.status ?? 'PENDING';
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = { status: status as ReviewStatus };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.review.count({ where }),
      this.prisma.review.findMany({
        where,
        select: ADMIN_REVIEW_SELECT,
        orderBy: [
          { createdAt: 'desc' as const },
          { id: 'desc' as const },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return {
      items: rows.map(toAdminDto),
      total,
      page,
      limit,
    };
  }

  /** Operator approves a pending review (→ APPROVED, publicly visible). */
  async approve(
    reviewerId: string,
    id: string,
    ipAddress?: string,
  ): Promise<ReviewDto> {
    const pending = await this.requirePending(id);
    const updated = await this.prisma.review.update({
      where: { id },
      data: { status: ReviewStatus.APPROVED, updatedBy: reviewerId },
      select: REVIEW_SELECT,
    });
    await this.audit.log({
      userId: reviewerId,
      action: 'REVIEW_APPROVED',
      entity: 'Review',
      entityId: id,
      before: { status: 'PENDING' },
      after: { status: 'APPROVED' },
      ipAddress,
    });
    this.invalidateProductReviews(pending);
    return toDto(updated);
  }

  /** Operator rejects a pending review (stays invisible forever). */
  async reject(
    reviewerId: string,
    id: string,
    ipAddress?: string,
  ): Promise<ReviewDto> {
    const pending = await this.requirePending(id);
    const updated = await this.prisma.review.update({
      where: { id },
      data: { status: ReviewStatus.REJECTED, updatedBy: reviewerId },
      select: REVIEW_SELECT,
    });
    await this.audit.log({
      userId: reviewerId,
      action: 'REVIEW_REJECTED',
      entity: 'Review',
      entityId: id,
      before: { status: 'PENDING' },
      after: { status: 'REJECTED' },
      ipAddress,
    });
    this.invalidateProductReviews(pending);
    return toDto(updated);
  }

  private async requirePublishedProduct(productId: string): Promise<void> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null, status: ProductStatus.PUBLISHED },
      select: { id: true },
    });
    if (!product) {
      throw new NotFoundException('محصول یافت نشد.');
    }
  }

  private async requirePending(
    id: string,
  ): Promise<{ id: string; productId: string; product: { slug: string } }> {
    const review = await this.prisma.review.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        productId: true,
        product: { select: { slug: true } },
      },
    });
    if (!review) {
      throw new NotFoundException('دیدگاه یافت نشد.');
    }
    if (review.status !== ReviewStatus.PENDING) {
      throw new ConflictException('این دیدگاه قبلاً بررسی شده است.');
    }
    return review;
  }

  /**
   * Drops the cached approved-review list plus the catalog detail entry
   * (card/detail `ratingAverage` aggregates are embedded in catalog DTOs,
   * not served from the review endpoint). Best-effort: creation writes
   * PENDING rows (invisible), so only moderation transitions invalidate.
   */
  private invalidateProductReviews(pending: {
    productId: string;
    product: { slug: string };
  }): void {
    void this.storefrontCache.invalidate([
      reviewProductTag(pending.productId),
      productDetailTag(pending.product.slug),
    ]);
  }
}

function toDto(row: ReviewRow): ReviewDto {
  return {
    id: row.id,
    productId: row.productId,
    rating: row.rating,
    comment: row.comment,
    status: row.status,
    statusFa: REVIEW_STATUS_FA[row.status],
    createdAt: row.createdAt.toISOString(),
  };
}

function toAdminDto(row: AdminReviewRow): AdminReviewListResponse['items'][number] {
  return {
    ...toDto(row),
    productName: row.product.name,
    productSlug: row.product.slug,
  };
}
