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
import { ProductsService } from './products.service'
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

/** Message reused from the variants service for a duplicate SKU row outcome. */
export const DUPLICATE_SKU_MESSAGE = 'یک واریانت با این sku قبلاً وجود دارد.';

const GRID_ROW_SELECT = {
  id: true,
  sku: true,
  barcode: true,
  name: true,
  price: true,
  compareAtPrice: true,
  priceStatus: true,
  updatedAt: true,
  product: {
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      condition: true,
      createdAt: true,
      updatedAt: true,
      brandId: true,
      categoryId: true,
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

type GridVariantData = {
  sku?: string;
  barcode?: string | null;
  name?: string | null;
  price?: string;
  compareAtPrice?: string | null;
  priceStatus?: PriceStatus;
};

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
 * catalog with inline variant-field editing behind an explicit batch save.
 *
 * Writes go through the established domain behavior — pricing through the
 * SS-251 invariant (`VariantsService.validatePricing`, plus the structural
 * DB CHECK) and stock through the SS-113 absolute-set core
 * (`InventoryService.applyAbsoluteSet`). This service never re-implements
 * either rule.
 *
 * Transaction model: each submitted row commits inside ONE interactive
 * transaction (variant fields + stock move together or not at all); rows are
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
    private readonly productsService: ProductsService,
    private readonly configService: ConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // Read API
  // ---------------------------------------------------------------------------

  async list(query: ListCatalogGridQueryDto): Promise<CatalogGridListResponse> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const skip = (page - 1) * limit;
    const baseWhere = this.buildVariantWhere(query);

    // Stock-status filtering and stock sorting are aggregate-backed: one
    // grouped scan over the filtered universe (≈1,100 rows today) decides
    // the id set / order, then the page is fetched and reordered. Past ~10×
    // catalog growth this moves into SQL (HAVING / lateral aggregate).
    if (query.sortBy === 'stock' || query.stockStatus !== undefined) {
      return this.listWithStockAggregate(query, baseWhere, page, limit, skip);
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.productVariant.count({ where: baseWhere }),
      this.prisma.productVariant.findMany({
        where: baseWhere,
        select: GRID_ROW_SELECT,
        orderBy: this.buildOrderBy(query),
        skip,
        take: limit,
      }),
    ]);

    return {
      items: await this.toGridRows(rows),
      total,
      page,
      limit,
    };
  }

  private buildVariantWhere(
    query: ListCatalogGridQueryDto,
  ): Prisma.ProductVariantWhereInput {
    const search = query.search?.trim();
    const sku = query.sku?.trim();
    const searchLike = search ? escapeLike(search) : '';

    const statusFilter =
      query.statuses !== undefined && query.statuses.length > 0
        ? { in: query.statuses }
        : query.status;
    const categoryFilter =
      query.categoryIds !== undefined && query.categoryIds.length > 0
        ? { in: query.categoryIds }
        : query.categoryId;
    const brandFilter =
      query.brandIds !== undefined && query.brandIds.length > 0
        ? { in: query.brandIds }
        : query.brandId;

    return {
      deletedAt: null,
      ...(sku ? { sku: { contains: escapeLike(sku), mode: 'insensitive' } } : {}),
      ...(query.priceStatus !== undefined
        ? { priceStatus: query.priceStatus }
        : {}),
      ...(query.minPrice !== undefined || query.maxPrice !== undefined
        ? {
            price: {
              ...(query.minPrice !== undefined
                ? { gte: new Prisma.Decimal(query.minPrice) }
                : {}),
              ...(query.maxPrice !== undefined
                ? { lte: new Prisma.Decimal(query.maxPrice) }
                : {}),
            },
          }
        : {}),
      product: {
        deletedAt: null,
        ...(statusFilter !== undefined ? { status: statusFilter } : {}),
        ...(categoryFilter !== undefined ? { categoryId: categoryFilter } : {}),
        ...(brandFilter !== undefined ? { brandId: brandFilter } : {}),
        ...(query.condition !== undefined ? { condition: query.condition } : {}),
      },
      // Global search spans the variant SKU and the product/brand/category
      // names, AND-composed with the structured filters above.
      ...(search
        ? {
            OR: [
              { sku: { contains: searchLike, mode: 'insensitive' } },
              {
                product: {
                  is: {
                    OR: [
                      { name: { contains: searchLike, mode: 'insensitive' } },
                      { slug: { contains: searchLike, mode: 'insensitive' } },
                      {
                        brand: {
                          is: {
                            OR: [
                              { name: { contains: searchLike, mode: 'insensitive' } },
                              { nameEn: { contains: searchLike, mode: 'insensitive' } },
                            ],
                          },
                        },
                      },
                      {
                        category: {
                          is: { name: { contains: searchLike, mode: 'insensitive' } },
                        },
                      },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    };
  }

  private buildOrderBy(
    query: ListCatalogGridQueryDto,
  ): Prisma.ProductVariantOrderByWithRelationInput[] {
    const dir = query.sortDir ?? 'asc';
    switch (query.sortBy) {
      case 'name':
        return [{ product: { name: dir } }, { id: 'desc' }];
      case 'sku':
        return [{ sku: dir }, { id: 'desc' }];
      case 'price':
        return [{ price: dir }, { id: 'desc' }];
      case 'compareAtPrice':
        return [{ compareAtPrice: { sort: dir, nulls: 'last' } }, { id: 'desc' }];
      case 'createdAt':
        return [{ product: { createdAt: dir } }, { id: 'desc' }];
      default:
        return [{ product: { createdAt: 'desc' } }, { id: 'desc' }];
    }
  }

  /**
   * Stock-status filter / stock-sort path. Resolves aggregate totals for the
   * filtered universe, applies the bucket filter to the id set, orders by
   * total when sorting on stock (Prisma `in` does not preserve order, so the
   * page is fetched by id and remapped), then loads the page rows.
   */
  private async listWithStockAggregate(
    query: ListCatalogGridQueryDto,
    baseWhere: Prisma.ProductVariantWhereInput,
    page: number,
    limit: number,
    skip: number,
  ): Promise<CatalogGridListResponse> {
    const universe = await this.prisma.productVariant.findMany({
      where: baseWhere,
      select: { id: true },
    });
    const universeIds = universe.map((row) => row.id);
    const totals = await this.qualifyingStockTotals(universeIds);

    let candidateIds = universeIds;
    if (query.stockStatus === 'IN_STOCK') {
      candidateIds = universeIds.filter((id) => (totals.get(id) ?? 0) > 0);
    } else if (query.stockStatus === 'OUT_OF_STOCK') {
      candidateIds = universeIds.filter((id) => (totals.get(id) ?? 0) === 0);
    }

    const dir = query.sortDir ?? 'asc';
    const orderedIds = [...candidateIds].sort((a, b) => {
      const diff = (totals.get(a) ?? 0) - (totals.get(b) ?? 0);
      if (diff !== 0) {
        return dir === 'asc' ? diff : -diff;
      }
      // Deterministic tiebreak keeps pagination stable.
      return a < b ? -1 : 1;
    });

    const total = orderedIds.length;
    const pageIds = orderedIds.slice(skip, skip + limit);
    const rows = await this.prisma.productVariant.findMany({
      where: { id: { in: pageIds } },
      select: GRID_ROW_SELECT,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const orderedRows = pageIds
      .map((id) => byId.get(id))
      .filter((row): row is GridRowPayload => row !== undefined);

    return {
      items: await this.toGridRows(orderedRows),
      total,
      page,
      limit,
    };
  }

  /** SUM(quantityOnHand) per variant over qualifying (active) inventory rows. */
  private async qualifyingStockTotals(
    variantIds: string[],
  ): Promise<Map<string, number>> {
    if (variantIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.inventoryItem.groupBy({
      by: ['variantId'],
      where: {
        variantId: { in: variantIds },
        ...activeInventoryWhere(),
      },
      _sum: { quantityOnHand: true },
    });
    return new Map(
      rows.map((row) => [row.variantId, row._sum.quantityOnHand ?? 0]),
    );
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

  private async toGridRows(rows: GridRowPayload[]): Promise<CatalogGridRow[]> {
    const variantIds = rows.map((row) => row.id);
    const [stockTotals, itemCounts] = await Promise.all([
      aggregateVariantStock(this.prisma, variantIds),
      this.countQualifyingWarehouses(variantIds),
    ]);
    return rows.map((row) => this.toGridRow(row, stockTotals, itemCounts));
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
      productStatus: row.product.status,
      condition: row.product.condition,
      createdAt: row.product.createdAt.toISOString(),
      sku: row.sku,
      barcode: row.barcode,
      variantName: row.name,
      brandName: row.product.brand?.name ?? null,
      brandId: row.product.brandId,
      categoryId: row.product.categoryId,
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
      productUpdatedAt: row.product.updatedAt.toISOString(),
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
   * invariant, the variant write is a conditional `updateMany` on the
   * submitted `updatedAt` version (single statement — no application-code
   * read/compare/write race), and the stock write reuses the SS-113
   * conditional absolute set inside the same transaction so all of a row's
   * fields commit together.
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
            sku: true,
            barcode: true,
            name: true,
            price: true,
            compareAtPrice: true,
            priceStatus: true,
            updatedAt: true,
            product: {
              select: {
                slug: true,
                deletedAt: true,
                status: true,
                name: true,
                brandId: true,
                categoryId: true,
              },
            },
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

        const variantData: GridVariantData = {};
        if (row.sku !== undefined) {
          variantData.sku = row.sku;
        }
        if (row.barcode !== undefined) {
          variantData.barcode = row.barcode;
        }
        if (row.variantName !== undefined) {
          variantData.name = row.variantName;
        }
        if (row.price !== undefined) {
          variantData.price = row.price;
        }
        if (row.compareAtPrice !== undefined) {
          variantData.compareAtPrice = row.compareAtPrice;
        }
        if (row.priceStatus !== undefined) {
          variantData.priceStatus = row.priceStatus;
        }
        const variantFieldsChanged = Object.keys(variantData).length > 0;
        // Any pricing field submission re-validates the whole effective
        // pricing triple (a compareAt-only row still needs the SS-251 rule).
        const pricingFieldsSubmitted =
          row.price !== undefined ||
          row.compareAtPrice !== undefined ||
          row.priceStatus !== undefined;
        // Only price/priceStatus moves can change the denormalized minimum.
        const priceFieldsChanged =
          row.price !== undefined || row.priceStatus !== undefined;

        if (variantFieldsChanged) {
          if (pricingFieldsSubmitted) {
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
            data: { ...variantData, updatedBy: actorId },
          });
          if (updated.count === 0) {
            return {
              result: await this.resolveNoMatchOutcome(tx, row.variantId),
              productSlug: null,
            };
          }
        }

        // SS-270 product-level fields: written in the SAME per-row
        // transaction, guarded by the product's own concurrency token.
        // assertBrandAndCategory runs on effective values (partial updates
        // cannot bypass it) — the shared rule, not a second implementation.
        const productFieldsSubmitted =
          row.productName !== undefined ||
          row.brandId !== undefined ||
          row.categoryId !== undefined;
        if (productFieldsSubmitted) {
          if (row.expectedProductUpdatedAt === undefined) {
            return {
              result: {
                variantId: row.variantId,
                outcome: 'VALIDATION_ERROR',
                message:
                  'برای ویرایش نام/برند/دسته‌بندی محصول، نسخهٔ محصول (expectedProductUpdatedAt) لازم است.',
                fieldErrors: { productName: 'نسخهٔ محصول ارسال نشده است.' },
              },
              productSlug: null,
            };
          }
          const expectedProduct = new Date(row.expectedProductUpdatedAt);
          const productData: Record<string, string | null> = {};
          const productBefore: Record<string, string | null> = {};
          const productAfter: Record<string, string | null> = {};
          if (row.productName !== undefined) {
            productBefore.name = variant.product.name;
            productAfter.name = row.productName;
            productData.name = row.productName;
          }
          if (row.brandId !== undefined) {
            productBefore.brandId = variant.product.brandId;
            productAfter.brandId = row.brandId;
            productData.brandId = row.brandId;
          }
          if (row.categoryId !== undefined) {
            productBefore.categoryId = variant.product.categoryId;
            productAfter.categoryId = row.categoryId;
            productData.categoryId = row.categoryId;
          }
          if (row.brandId !== undefined || row.categoryId !== undefined) {
            try {
              await this.productsService.assertBrandAndCategory(
                tx,
                row.brandId !== undefined ? row.brandId : variant.product.brandId,
                row.categoryId !== undefined ? row.categoryId : variant.product.categoryId,
              );
            } catch (error) {
              const message =
                error instanceof BadRequestException
                  ? error.message
                  : 'برند یا دسته‌بندی معتبر نیستند.';
              return {
                result: {
                  variantId: row.variantId,
                  outcome: 'VALIDATION_ERROR',
                  message,
                  fieldErrors: {
                    ...(row.brandId !== undefined ? { brandId: message } : {}),
                    ...(row.categoryId !== undefined ? { categoryId: message } : {}),
                  },
                },
                productSlug: null,
              };
            }
          }
          const updatedProduct = await tx.product.updateMany({
            where: {
              id: variant.productId,
              deletedAt: null,
              status: { not: ProductStatus.ARCHIVED },
              updatedAt: expectedProduct,
            },
            data: { ...productData, updatedBy: actorId },
          });
          if (updatedProduct.count === 0) {
            return {
              result: {
                variantId: row.variantId,
                outcome: 'CONFLICT_CHANGED',
                message:
                  'نسخهٔ محصول از زمان بارگذاری تغییر کرده است؛ ردیف را دوباره بارگذاری کنید.',
              },
              productSlug: null,
            };
          }
          await this.auditService.log(
            {
              userId: actorId,
              action: 'PRODUCT_UPDATED',
              entity: 'Product',
              entityId: variant.productId,
              before: productBefore,
              after: productAfter,
              ipAddress,
            },
            tx,
          );
        }

        let appliedStock: number | undefined;
        if (row.stock !== undefined) {
          if (!variantFieldsChanged) {
            // Stock-only row: the variant is not written by the field path,
            // so guard the submitted version with a row-locked read (same
            // FOR UPDATE discipline as recomputeProductMinPrice). The stock
            // write itself stays a conditional expected-value update.
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

        if (variantFieldsChanged) {
          const before: Record<string, string | null> = {};
          const after: Record<string, string | null> = {};
          if (row.sku !== undefined) {
            before.sku = variant.sku;
            after.sku = row.sku;
          }
          if (row.barcode !== undefined) {
            before.barcode = variant.barcode;
            after.barcode = row.barcode;
          }
          if (row.variantName !== undefined) {
            before.name = variant.name;
            after.name = row.variantName;
          }
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

          if (priceFieldsChanged) {
            await recomputeProductMinPrice(tx, variant.productId);
          }
        }

        const current = await tx.productVariant.findUnique({
          where: { id: variant.id },
          select: {
            sku: true,
            barcode: true,
            name: true,
            price: true,
            compareAtPrice: true,
            priceStatus: true,
            updatedAt: true,
            deletedAt: true,
            product: {
              select: {
                name: true,
                updatedAt: true,
                brandId: true,
                brand: { select: { name: true } },
                categoryId: true,
                category: { select: { name: true } },
              },
            },
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
            sku: current.sku,
            barcode: current.barcode,
            variantName: current.name,
            priceStatus: current.priceStatus,
            ...(appliedStock !== undefined ? { stock: appliedStock } : {}),
            product: {
              updatedAt: current.product.updatedAt.toISOString(),
              name: current.product.name,
              brandId: current.product.brandId,
              brandName: current.product.brand?.name ?? null,
              categoryId: current.product.categoryId,
              categoryName: current.product.category.name,
            },
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
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        error.meta?.modelName === 'ProductVariant'
      ) {
        return {
          result: {
            variantId: row.variantId,
            outcome: 'VALIDATION_ERROR',
            message: DUPLICATE_SKU_MESSAGE,
            fieldErrors: { sku: DUPLICATE_SKU_MESSAGE },
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
