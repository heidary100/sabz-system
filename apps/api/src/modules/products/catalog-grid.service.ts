import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProductMediaType, ProductStatus, Prisma, PriceStatus } from '@prisma/client';
import type {
  CatalogGridBatchRowInput,
  CatalogGridBatchResponse,
  CatalogGridListResponse,
  CatalogGridRow,
  CatalogGridRowResult,
} from '@sabz/types';
import { PrismaService } from '../../common/database/prisma.service';
import { StorefrontCacheService } from '../../common/storefront-cache/storefront-cache.service';
import {
  CATALOG_PRODUCTS_TAG,
  productDetailTag,
} from '../../common/storefront-cache/catalog-tags';
import { AuditService } from '../audit/audit.service';
import {
  activeInventoryWhere,
  aggregateVariantStock,
} from '../inventory/inventory-aggregate';
import { InventoryService } from '../inventory/inventory.service';
import { recomputeProductMinPrice } from './min-price';
import { PUBLIC_MEDIA_URL_PREFIX } from './public-catalog.service';
import { VariantsService } from './variants.service';
import {
  CatalogGridBatchDto,
  ListCatalogGridQueryDto,
} from './dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;
const DEFAULT_LOCK_TIMEOUT_MS = 3000;

/** Mandatory movement reason for grid-driven absolute stock sets. */
const GRID_ADJUST_REASON = 'ویرایش از شبکه کاتالوگ';

const GRID_ROW_SELECT = {
  id: true,
  sku: true,
  price: true,
  compareAtPrice: true,
  priceStatus: true,
  updatedAt: true,
  product: {
    select: {
      id: true,
      name: true,
      slug: true,
      brand: { select: { name: true } },
      category: { select: { name: true } },
      media: {
        select: { id: true, mediaType: true, thumbnailKey: true },
        orderBy: { createdAt: 'asc' as const },
      },
    },
  },
} satisfies Prisma.ProductVariantSelect;

type GridRowPayload = Prisma.ProductVariantGetPayload<{
  select: typeof GRID_ROW_SELECT;
}>;

function escapeLike(search: string): string {
  return search.replace(/[\\%_]/g, '\\$&');
}

/**
 * Audit §A.7: a row locked by another transaction must surface as a per-row
 * outcome, never as a request-wide exception. Postgres cancels the blocked
 * statement once `lock_timeout` elapses ("canceling statement due to lock
 * timeout", SQLSTATE 55P03) — matched narrowly here so unrelated database
 * failures keep their real semantics.
 */
function isLockTimeoutError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /55P03|lock timeout|canceling statement due to lock timeout/i.test(
    message,
  );
}

/**
 * SS-257 catalog grid: a server-paginated, variant-keyed view over the
 * catalog with inline price/stock editing behind an explicit batch save.
 *
 * Writes go through the established domain behavior — pricing through the
 * SS-251 invariant (`VariantsService.validatePricing`, plus the structural
 * DB CHECK) and stock through the SS-113 absolute-set core
 * (`InventoryService.applyAbsoluteSet`). This service never re-implements
 * either rule.
 *
 * Transaction model: each submitted row commits inside ONE interactive
 * transaction (price fields + stock move together or not at all); rows are
 * independent so a failed row never aborts unrelated rows (partial success).
 */
@Injectable()
export class CatalogGridService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly storefrontCache: StorefrontCacheService,
    private readonly variantsService: VariantsService,
    private readonly inventoryService: InventoryService,
    private readonly configService: ConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // Read API
  // ---------------------------------------------------------------------------

  async list(query: ListCatalogGridQueryDto): Promise<CatalogGridListResponse> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const skip = (page - 1) * limit;
    const search = query.search?.trim();
    const sku = query.sku?.trim();

    const where: Prisma.ProductVariantWhereInput = {
      deletedAt: null,
      ...(sku ? { sku: { contains: escapeLike(sku), mode: 'insensitive' } } : {}),
      product: {
        deletedAt: null,
        ...(query.status !== undefined ? { status: query.status } : {}),
        ...(query.categoryId !== undefined
          ? { categoryId: query.categoryId }
          : {}),
        ...(query.brandId !== undefined ? { brandId: query.brandId } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: escapeLike(search), mode: 'insensitive' } },
                { slug: { contains: escapeLike(search), mode: 'insensitive' } },
              ],
            }
          : {}),
      },
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.productVariant.count({ where }),
      this.prisma.productVariant.findMany({
        where,
        select: GRID_ROW_SELECT,
        orderBy: [{ product: { createdAt: 'desc' } }, { id: 'desc' }],
        skip,
        take: limit,
      }),
    ]);

    const variantIds = rows.map((row) => row.id);
    const [stockTotals, itemCounts] = await Promise.all([
      aggregateVariantStock(this.prisma, variantIds),
      this.countQualifyingWarehouses(variantIds),
    ]);

    return {
      items: rows.map((row) => this.toGridRow(row, stockTotals, itemCounts)),
      total,
      page,
      limit,
    };
  }

  /** Count of qualifying (active variant × active warehouse) inventory rows per variant. */
  private async countQualifyingWarehouses(
    variantIds: string[],
  ): Promise<Map<string, number>> {
    if (variantIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.inventoryItem.groupBy({
      by: ['variantId'],
      where: { variantId: { in: variantIds }, ...activeInventoryWhere() },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.variantId, row._count._all]));
  }

  private toGridRow(
    row: GridRowPayload,
    stockTotals: Map<string, number>,
    itemCounts: Map<string, number>,
  ): CatalogGridRow {
    const thumbnail = row.product.media.find(
      (media) =>
        media.mediaType === ProductMediaType.IMAGE &&
        media.thumbnailKey !== null,
    );
    return {
      variantId: row.id,
      productId: row.product.id,
      productName: row.product.name,
      productSlug: row.product.slug,
      sku: row.sku,
      brandName: row.product.brand?.name ?? null,
      categoryName: row.product.category.name,
      thumbnailUrl:
        thumbnail !== undefined
          ? `${PUBLIC_MEDIA_URL_PREFIX}/${thumbnail.id}/thumbnail`
          : null,
      priceStatus: row.priceStatus,
      price: row.price.toString(),
      compareAtPrice: row.compareAtPrice?.toString() ?? null,
      stock: stockTotals.get(row.id) ?? 0,
      stockEditable: (itemCounts.get(row.id) ?? 0) === 1,
      expectedUpdatedAt: row.updatedAt.toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Batch API
  // ---------------------------------------------------------------------------

  /**
   * Explicit batch save. Every submitted row receives an outcome; rows are
   * processed sequentially (no parallel transactions → no pool exhaustion
   * and deterministic lock ordering), each in its own transaction so a
   * failed row leaves unrelated rows untouched.
   */
  async batch(
    dto: CatalogGridBatchDto,
    actorId: string,
    ipAddress?: string,
  ): Promise<CatalogGridBatchResponse> {
    const variantIds = dto.rows.map((row) => row.variantId);
    if (new Set(variantIds).size !== variantIds.length) {
      throw new BadRequestException(
        'هر واریانت فقط یکبار در هر درخواست مجاز است.',
      );
    }

    const lockTimeoutMs = this.resolveLockTimeoutMs();
    const results: CatalogGridRowResult[] = [];
    const touchedSlugs = new Set<string>();

    for (const row of dto.rows) {
      const applied = await this.applyRow(row, actorId, ipAddress, lockTimeoutMs);
      results.push(applied.result);
      if (applied.productSlug !== null) {
        touchedSlugs.add(applied.productSlug);
      }
    }

    for (const slug of touchedSlugs) {
      void this.storefrontCache.invalidate([
        CATALOG_PRODUCTS_TAG,
        productDetailTag(slug),
      ]);
    }

    const succeeded = results.filter((row) => row.outcome === 'SUCCESS').length;
    return {
      results,
      summary: { succeeded, failed: results.length - succeeded },
    };
  }

  private resolveLockTimeoutMs(): number {
    const raw = this.configService.get<string | number>(
      'LOCK_TIMEOUT_MS',
      DEFAULT_LOCK_TIMEOUT_MS,
    );
    const parsed = typeof raw === 'number' ? raw : Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : DEFAULT_LOCK_TIMEOUT_MS;
  }

  /**
   * Execute one submitted row as a single transaction and always resolve to
   * a row outcome instead of throwing for expected row-level conditions:
   * the pricing validation runs on effective values through the SS-251
   * invariant, the price write is a conditional `updateMany` on the submitted
   * `updatedAt` version (single statement — no application-code read/compare/
   * write race), and the stock write reuses the SS-113 conditional absolute
   * set inside the same transaction so all of a row's fields commit together.
   */
  private async applyRow(
    row: CatalogGridBatchRowInput,
    actorId: string,
    ipAddress: string | undefined,
    lockTimeoutMs: number,
  ): Promise<{ result: CatalogGridRowResult; productSlug: string | null }> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRawUnsafe(`SET LOCAL lock_timeout = '${lockTimeoutMs}ms'`);

        const variant = await tx.productVariant.findUnique({
          where: { id: row.variantId },
          select: {
            id: true,
            productId: true,
            deletedAt: true,
            price: true,
            compareAtPrice: true,
            priceStatus: true,
            updatedAt: true,
            product: { select: { slug: true, deletedAt: true, status: true } },
          },
        });
        if (
          !variant ||
          variant.deletedAt !== null ||
          !variant.product ||
          variant.product.deletedAt !== null
        ) {
          return {
            result: {
              variantId: row.variantId,
              outcome: 'NOT_FOUND',
              message: 'واریانت یافت نشد.',
            },
            productSlug: null,
          };
        }
        if (variant.product.status === ProductStatus.ARCHIVED) {
          return {
            result: {
              variantId: row.variantId,
              outcome: 'CONFLICT_CHANGED',
              message:
                'محصول آرشیوشده قابل ویرایش نیست؛ ابتدا وضعیت آن را بازگردانید.',
            },
            productSlug: null,
          };
        }

        const expected = new Date(row.expectedUpdatedAt);

        const priceData: {
          price?: string;
          compareAtPrice?: string | null;
          priceStatus?: PriceStatus;
        } = {};
        if (row.price !== undefined) {
          priceData.price = row.price;
        }
        if (row.compareAtPrice !== undefined) {
          priceData.compareAtPrice = row.compareAtPrice;
        }
        if (row.priceStatus !== undefined) {
          priceData.priceStatus = row.priceStatus;
        }
        const priceChanged = Object.keys(priceData).length > 0;

        if (priceChanged) {
          // SS-251 invariant on effective values (partial updates cannot
          // sneak past it) — the shared rule, not a second implementation.
          try {
            this.variantsService.validatePricing({
              price: row.price ?? variant.price.toString(),
              compareAtPrice:
                row.compareAtPrice !== undefined
                  ? row.compareAtPrice
                  : (variant.compareAtPrice?.toString() ?? null),
              priceStatus: row.priceStatus ?? variant.priceStatus,
            });
          } catch (error) {
            const message =
              error instanceof BadRequestException
                ? error.message
                : 'مقادیر قیمت معتبر نیستند.';
            return {
              result: {
                variantId: row.variantId,
                outcome: 'VALIDATION_ERROR',
                message,
                fieldErrors: { compareAtPrice: message },
              },
              productSlug: null,
            };
          }

          const updated = await tx.productVariant.updateMany({
            where: {
              id: variant.id,
              deletedAt: null,
              updatedAt: expected,
              product: {
                is: { deletedAt: null, status: { not: ProductStatus.ARCHIVED } },
              },
            },
            data: { ...priceData, updatedBy: actorId },
          });
          if (updated.count === 0) {
            return {
              result: await this.resolveNoMatchOutcome(tx, row.variantId),
              productSlug: null,
            };
          }
        }

        let appliedStock: number | undefined;
        if (row.stock !== undefined) {
          if (!priceChanged) {
            // Stock-only row: the price path is not writing the variant, so
            // guard the submitted version with a row-locked read (same FOR
            // UPDATE discipline as recomputeProductMinPrice). The stock write
            // itself stays a conditional expected-value update.
            const locked = await tx.$queryRaw<Array<{ updatedAt: Date }>>(
              Prisma.sql`SELECT "updatedAt" FROM "ProductVariant" WHERE "id" = ${row.variantId} AND "deletedAt" IS NULL FOR UPDATE`,
            );
            if (locked.length === 0) {
              return {
                result: {
                  variantId: row.variantId,
                  outcome: 'NOT_FOUND',
                  message: 'واریانت یافت نشد.',
                },
                productSlug: null,
              };
            }
            if (locked[0]!.updatedAt.getTime() !== expected.getTime()) {
              return {
                result: {
                  variantId: row.variantId,
                  outcome: 'CONFLICT_CHANGED',
                  message:
                    'این ردیف از زمان بارگذاری تغییر کرده است؛ نسخه جدید را ببینید.',
                },
                productSlug: null,
              };
            }
          }

          const items = await tx.inventoryItem.findMany({
            where: { variantId: variant.id, ...activeInventoryWhere() },
            select: { id: true, warehouseId: true, quantityOnHand: true },
          });
          if (items.length === 0) {
            const message = 'این واریانت ردیف موجودی قابل ویرایش ندارد.';
            return {
              result: {
                variantId: row.variantId,
                outcome: 'VALIDATION_ERROR',
                message,
                fieldErrors: { stock: message },
              },
              productSlug: null,
            };
          }
          if (items.length > 1) {
            const message =
              'این واریانت در چند انبار موجودی دارد؛ ویرایش موجودی آن از صفحه انبار واریانت انجام میشود.';
            return {
              result: {
                variantId: row.variantId,
                outcome: 'VALIDATION_ERROR',
                message,
                fieldErrors: { stock: message },
              },
              productSlug: null,
            };
          }

          const item = items[0]!;
          const applied = await this.inventoryService.applyAbsoluteSet(tx, {
            variantId: variant.id,
            warehouseId: item.warehouseId,
            requested: row.stock,
            reason: GRID_ADJUST_REASON,
            notes: null,
            actorId,
            createIfMissing: false,
          });
          appliedStock = applied.onHandAfter;

          await this.auditService.log(
            {
              userId: actorId,
              action: 'INVENTORY_ADJUSTED',
              entity: 'InventoryItem',
              entityId: applied.itemId,
              before: null,
              after: {
                variantId: variant.id,
                warehouseId: item.warehouseId,
                requestedQuantity: row.stock,
                delta: applied.delta,
                reason: GRID_ADJUST_REASON,
                onHandBefore: applied.onHandBefore,
                onHandAfter: applied.onHandAfter,
                source: 'catalog-grid',
              },
              ipAddress,
            },
            tx,
          );
        }

        if (priceChanged) {
          const before: Record<string, string | null> = {};
          const after: Record<string, string | null> = {};
          if (row.price !== undefined) {
            before.price = variant.price.toString();
            after.price = row.price;
          }
          if (row.compareAtPrice !== undefined) {
            before.compareAtPrice = variant.compareAtPrice?.toString() ?? null;
            after.compareAtPrice = row.compareAtPrice;
          }
          if (row.priceStatus !== undefined) {
            before.priceStatus = variant.priceStatus;
            after.priceStatus = row.priceStatus;
          }

          await this.auditService.log(
            {
              userId: actorId,
              action: 'PRODUCT_VARIANT_UPDATED',
              entity: 'ProductVariant',
              entityId: variant.id,
              before,
              after,
              ipAddress,
            },
            tx,
          );

          await recomputeProductMinPrice(tx, variant.productId);
        }

        const current = await tx.productVariant.findUnique({
          where: { id: variant.id },
          select: {
            price: true,
            compareAtPrice: true,
            updatedAt: true,
            deletedAt: true,
          },
        });
        if (!current || current.deletedAt !== null) {
          return {
            result: {
              variantId: row.variantId,
              outcome: 'NOT_FOUND',
              message: 'واریانت یافت نشد.',
            },
            productSlug: null,
          };
        }

        return {
          result: {
            variantId: row.variantId,
            outcome: 'SUCCESS',
            updatedAt: current.updatedAt.toISOString(),
            price: current.price.toString(),
            compareAtPrice: current.compareAtPrice?.toString() ?? null,
            ...(appliedStock !== undefined ? { stock: appliedStock } : {}),
          },
          productSlug: variant.product.slug,
        };
      });
    } catch (error) {
      if (isLockTimeoutError(error)) {
        return {
          result: {
            variantId: row.variantId,
            outcome: 'CONFLICT_LOCKED',
            message:
              'این ردیف در حال حاضر توسط عملیات دیگری قفل شده است؛ کمی بعد دوباره تلاش کنید.',
          },
          productSlug: null,
        };
      }
      if (error instanceof NotFoundException) {
        return {
          result: {
            variantId: row.variantId,
            outcome: 'NOT_FOUND',
            message: error.message,
          },
          productSlug: null,
        };
      }
      if (error instanceof ConflictException) {
        return {
          result: {
            variantId: row.variantId,
            outcome: 'CONFLICT_CHANGED',
            message: error.message,
          },
          productSlug: null,
        };
      }
      throw error;
    }
  }

  /**
   * Resolve why a conditional update matched nothing: a concurrently
   * soft-deleted variant is NOT_FOUND, anything else (the submitted
   * `updatedAt` no longer current, concurrent archive) is CONFLICT_CHANGED.
   */
  private async resolveNoMatchOutcome(
    tx: Prisma.TransactionClient,
    variantId: string,
  ): Promise<CatalogGridRowResult> {
    const current = await tx.productVariant.findUnique({
      where: { id: variantId },
      select: { deletedAt: true },
    });
    if (!current || current.deletedAt !== null) {
      return {
        variantId,
        outcome: 'NOT_FOUND',
        message: 'واریانت یافت نشد.',
      };
    }
    return {
      variantId,
      outcome: 'CONFLICT_CHANGED',
      message: 'این ردیف از زمان بارگذاری تغییر کرده است؛ نسخه جدید را ببینید.',
    };
  }
}
