import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import {
  PriceSourceCurrency,
  PriceStatus,
  Prisma,
  ProductStatus,
  PromotionType,
} from '@prisma/client';
import type {
  BulkPriceApplyRequest,
  BulkPriceApplyResponse,
  BulkPriceApplyResultRow,
  BulkPriceOperation,
  BulkPricePreviewRequest,
  BulkPricePreviewResponse,
  BulkPriceRowPreview,
  CategoryRulePreviewRequest,
  CategoryRulePreviewResponse,
  CategoryRulePreviewRow,
  PricingScope,
} from '@sabz/types';
import { PrismaService } from '../../common/database/prisma.service';
import { hasActiveProductSale } from '../../common/money/discount';
import { roundRialUp } from '../../common/money/rial';
import { StorefrontCacheService } from '../../common/storefront-cache/storefront-cache.service';
import {
  CATALOG_PRODUCTS_TAG,
  productDetailTag,
} from '../../common/storefront-cache/catalog-tags';
import { AuditService } from '../audit/audit.service';
import { recomputeProductsMinPrice } from '../products/min-price';
import { PricingService, type ProductOverride } from './pricing.service';

const MAX_SCOPE = 5_000;

interface TargetVariant {
  id: string;
  productId: string;
  productName: string;
  slug: string;
  sku: string;
  categoryId: string;
  categoryName: string;
  priceStatus: PriceStatus;
  price: Prisma.Decimal;
  discountedPrice: Prisma.Decimal | null;
  discountStartsAt: Date | null;
  discountEndsAt: Date | null;
  partnerPrice: Prisma.Decimal | null;
  updatedAt: Date;
}

interface ProductMeta {
  override: {
    id: string;
    type: PromotionType | null;
    value: Prisma.Decimal | null;
    overridePrice: Prisma.Decimal | null;
    isActive: boolean;
    startsAt: Date | null;
    endsAt: Date | null;
    updatedAt: Date;
  } | null;
  categoryRule: { type: 'PERCENT' | 'FIXED'; value: Prisma.Decimal } | null;
}

/**
 * Bulk pricing workspace service (pricing-grid spec §2.2, §2.4, §2.6, §8).
 *
 * Every financial operation is preview → token → atomic apply. The preview
 * resolves every target on the server, validates the full effective pricing
 * shape, and returns per-row affected/skipped/failed outcomes. Apply
 * recomputes the preview and rejects a stale token, so a concurrent edit can
 * never be silently overwritten.
 */
@Injectable()
export class BulkPricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly audit: AuditService,
    private readonly cache: StorefrontCacheService,
  ) {}

  async preview(
    request: BulkPricePreviewRequest,
  ): Promise<BulkPricePreviewResponse> {
    const { variants, metas } = await this.resolveScope(request.scope);
    const warnings: string[] = [];
    const rows = variants.map((variant) => {
      const meta = metas.get(variant.productId) ?? {
        override: null,
        categoryRule: null,
      };
      return this.previewRow(variant, meta, request.operation, warnings);
    });
    const token = this.previewToken(request.scope, request.operation, variants, metas);
    return {
      previewToken: token,
      operation: request.operation,
      scope: request.scope,
      total: rows.length,
      affected: rows.filter((row) => row.outcome === 'AFFECTED').length,
      skipped: rows.filter((row) => row.outcome === 'SKIPPED').length,
      failed: rows.filter((row) => row.outcome === 'FAILED').length,
      rows,
      warnings: [...new Set(warnings)],
    };
  }

  async apply(
    operatorId: string,
    request: BulkPriceApplyRequest,
    ipAddress?: string,
  ): Promise<BulkPriceApplyResponse> {
    const preview = await this.preview(request);
    if (preview.previewToken !== request.previewToken) {
      throw new ConflictException(
        'داده‌های انتخاب‌شده از زمان پیش‌نمایش تغییر کرده‌اند؛ پیش‌نمایش را دوباره بگیرید.',
      );
    }
    if (preview.failed > 0) {
      return {
        applied: false,
        summary: {
          requested: preview.total,
          affected: 0,
          skipped: preview.skipped,
          failed: preview.failed,
        },
        results: preview.rows
          .filter((row) => row.outcome === 'FAILED')
          .map((row) => ({
            variantId: row.variantId,
            productId: row.productId,
            productName: row.productName,
            sku: row.sku,
            outcome: row.outcome,
            reason: row.reason,
            fieldErrors: row.fieldErrors,
          })),
        warnings: preview.warnings,
      };
    }

    const affected = preview.rows.filter((row) => row.outcome === 'AFFECTED');
    if (affected.length === 0) {
      return {
        applied: true,
        summary: {
          requested: preview.total,
          affected: 0,
          skipped: preview.skipped,
          failed: 0,
        },
        results: preview.rows.map((row) => ({
          variantId: row.variantId,
          productId: row.productId,
          productName: row.productName,
          sku: row.sku,
          outcome: row.outcome,
          reason: row.reason,
        })),
        warnings: preview.warnings,
      };
    }

    const slugs = new Set<string>();
    const batchId = createHash('sha256')
      .update(`${operatorId}:${Date.now()}:${preview.previewToken}`)
      .digest('hex');
    const touchedProductIds = new Set<string>();
    await this.prisma.$transaction(async (tx) => {
      for (const row of affected) {
        const variant = await tx.productVariant.findUnique({
          where: { id: row.variantId },
          select: {
            id: true,
            productId: true,
            price: true,
            discountedPrice: true,
            discountStartsAt: true,
            discountEndsAt: true,
            priceStatus: true,
            updatedAt: true,
            product: { select: { slug: true, status: true, deletedAt: true } },
          },
        });
        if (
          !variant ||
          variant.product.status === ProductStatus.ARCHIVED ||
          variant.product.deletedAt !== null
        ) {
          throw new ConflictException(
            `ردیف ${row.sku} از زمان پیش‌نمایش تغییر کرده است؛ دوباره تلاش کنید.`,
          );
        }
        if (variant.updatedAt.toISOString() !== row.expectedUpdatedAt) {
          throw new ConflictException(
            `ردیف ${row.sku} توسط کاربر دیگری تغییر کرده است؛ پیش‌نمایش را دوباره بگیرید.`,
          );
        }

        if (request.operation.kind === 'SET_OVERRIDE') {
          await this.applyOverride(tx, operatorId, variant.productId, request.operation);
          touchedProductIds.add(variant.productId);
          slugs.add(variant.product.slug);
          continue;
        }

        if (request.operation.kind === 'CLEAR_OVERRIDE') {
          await tx.productPriceOverride.deleteMany({
            where: { productId: variant.productId },
          });
          touchedProductIds.add(variant.productId);
          slugs.add(variant.product.slug);
          continue;
        }

        const data = this.variantUpdateFor(request.operation, row, variant.price);
        const updated = await tx.productVariant.updateMany({
          where: {
            id: variant.id,
            deletedAt: null,
            updatedAt: variant.updatedAt,
          },
          data: { ...data, updatedBy: operatorId },
        });
        if (updated.count === 0) {
          throw new ConflictException(
            `ردیف ${row.sku} توسط کاربر دیگری تغییر کرده است؛ پیش‌نمایش را دوباره بگیرید.`,
          );
        }
        touchedProductIds.add(variant.productId);
        slugs.add(variant.product.slug);
      }

      await recomputeProductsMinPrice(tx, [...touchedProductIds]);
      await this.audit.log(
        {
          userId: operatorId,
          action: 'BULK_PRICE_OPERATION_APPLIED',
          entity: 'PricingBatch',
          entityId: batchId,
          before: null,
          after: {
            operation: request.operation,
            scope: request.scope,
            affected: affected.length,
            skipped: preview.skipped,
            rows: affected.slice(0, 1000).map((row) => ({
              variantId: row.variantId,
              sku: row.sku,
              regularPriceBefore: row.regularPriceBefore,
              regularPriceAfter: row.regularPriceAfter,
              discountedPriceBefore: row.discountedPriceBefore,
              discountedPriceAfter: row.discountedPriceAfter,
            })),
          },
          ipAddress,
        },
        tx,
      );
    });

    for (const slug of slugs) {
      void this.cache.invalidate([CATALOG_PRODUCTS_TAG, productDetailTag(slug)]);
    }

    const results: BulkPriceApplyResultRow[] = [];
    const current = await this.prisma.productVariant.findMany({
      where: { id: { in: affected.map((row) => row.variantId) } },
      select: {
        id: true,
        price: true,
        discountedPrice: true,
        updatedAt: true,
        priceUpdatedAt: true,
      },
    });
    const currentById = new Map(current.map((row) => [row.id, row]));
    for (const row of preview.rows) {
      if (row.outcome !== 'AFFECTED') {
        results.push({
          variantId: row.variantId,
          productId: row.productId,
          productName: row.productName,
          sku: row.sku,
          outcome: row.outcome,
          reason: row.reason,
        });
        continue;
      }
      const after = currentById.get(row.variantId);
      results.push({
        variantId: row.variantId,
        productId: row.productId,
        productName: row.productName,
        sku: row.sku,
        outcome: 'AFFECTED',
        regularPrice: after?.price.toString() ?? row.regularPriceAfter ?? undefined,
        discountedPrice:
          after?.discountedPrice?.toString() ?? row.discountedPriceAfter,
        effectivePrice: row.effectivePriceAfter,
        updatedAt: after?.updatedAt.toISOString(),
        priceUpdatedAt: after?.priceUpdatedAt?.toISOString(),
      });
    }

    return {
      applied: true,
      summary: {
        requested: preview.total,
        affected: affected.length,
        skipped: preview.skipped,
        failed: 0,
      },
      results,
      warnings: preview.warnings,
    };
  }

  // -------------------------------------------------------------------------
  // Category rule preview
  // -------------------------------------------------------------------------

  async previewCategoryRule(
    input: CategoryRulePreviewRequest,
  ): Promise<CategoryRulePreviewResponse> {
    const category = await this.prisma.category.findFirst({
      where: { id: input.categoryId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!category) {
      throw new NotFoundException('دسته‌بندی یافت نشد.');
    }
    const categoryIds = input.includeDescendants
      ? await this.categorySubtreeIds(input.categoryId)
      : [input.categoryId];
    const exclude = new Set(input.excludeProductIds ?? []);
    const variants = await this.targetVariants({
      type: 'CATEGORY',
      categoryId: input.categoryId,
      includeDescendants: input.includeDescendants,
    });
    const rate = {
      type: input.type,
      value: this.parsePercent(input.type, input.value),
    };
    const warnings: string[] = [];
    const rows: CategoryRulePreviewRow[] = variants
      .filter((variant) => !exclude.has(variant.productId))
      .map((variant) => {
        const activeSale = hasActiveProductSale({
          price: variant.price,
          discountedPrice: variant.discountedPrice,
          discountStartsAt: variant.discountStartsAt,
          discountEndsAt: variant.discountEndsAt,
        });
        if (variant.priceStatus !== PriceStatus.PRICED) {
          return this.categoryRow(variant, 'SKIPPED', undefined, 'قیمت‌گذاری نشده است.');
        }
        if (activeSale) {
          warnings.push(
            'در برخی محصولات قیمت فروش ویژه فعال است؛ قانون دسته‌بندی روی آن‌ها اعمال نمی‌شود.',
          );
          return this.categoryRow(
            variant,
            'SKIPPED',
            undefined,
            'قیمت فروش ویژه فعال، قانون دسته‌بندی را پوشش می‌دهد.',
          );
        }
        const ruleResult = this.applyRuleToPrice(variant.price, rate);
        if (ruleResult.lessThanOrEqualTo(0)) {
          return this.categoryRow(
            variant,
            'SKIPPED',
            undefined,
            'تخفیف ثابت از قیمت این محصول بیشتر است؛ برای این محصول اعمال نمی‌شود.',
          );
        }
        const rounded = roundRialUp(ruleResult.toDecimalPlaces(0));
        return this.categoryRow(variant, 'AFFECTED', rounded.toString());
      });
    const conflicts = await this.prisma.categoryPriceRule.findMany({
      where: {
        categoryId: { in: categoryIds },
        isActive: true,
      },
      include: { category: { select: { name: true } } },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      take: 100,
    });
    return {
      categoryId: category.id,
      includeDescendants: input.includeDescendants,
      productCount: new Set(rows.map((row) => row.productId)).size,
      affected: rows.filter((row) => row.outcome === 'AFFECTED').length,
      skipped: rows.filter((row) => row.outcome === 'SKIPPED').length,
      failed: rows.filter((row) => row.outcome === 'FAILED').length,
      rows,
      conflicts: conflicts.map((row) => ({
        id: row.id,
        categoryId: row.categoryId,
        categoryName: row.category.name,
        type: row.type,
        value: row.value.toString(),
        includeDescendants: row.includeDescendants,
        priority: row.priority,
        status: this.ruleStatus(row.isActive, row.startsAt, row.endsAt),
        startsAt: row.startsAt?.toISOString() ?? null,
        endsAt: row.endsAt?.toISOString() ?? null,
      })),
      warnings: [...new Set(warnings)],
    };
  }

  // -------------------------------------------------------------------------
  // Scope + preview resolution
  // -------------------------------------------------------------------------

  private async resolveScope(scope: PricingScope): Promise<{
    variants: TargetVariant[];
    metas: Map<string, ProductMeta>;
  }> {
    const variants = await this.targetVariants(scope);
    if (variants.length > MAX_SCOPE) {
      throw new BadRequestException(
        `حداکثر ${MAX_SCOPE} ردیف در هر عملیات گروهی مجاز است.`,
      );
    }
    return { variants, metas: await this.productMetas(scope) };
  }

  private async targetVariants(scope: PricingScope): Promise<TargetVariant[]> {
    const where = await this.scopeWhere(scope);
    const rows = await this.prisma.productVariant.findMany({
      where,
      select: {
        id: true,
        productId: true,
        sku: true,
        priceStatus: true,
        price: true,
        discountedPrice: true,
        discountStartsAt: true,
        discountEndsAt: true,
        partnerPrice: true,
        updatedAt: true,
        product: {
          select: {
            name: true,
            slug: true,
            categoryId: true,
            category: { select: { name: true } },
          },
        },
      },
      orderBy: [{ productId: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      productId: row.productId,
      productName: row.product.name,
      slug: row.product.slug,
      sku: row.sku,
      categoryId: row.product.categoryId,
      categoryName: row.product.category.name,
      priceStatus: row.priceStatus,
      price: row.price,
      discountedPrice: row.discountedPrice,
      discountStartsAt: row.discountStartsAt,
      discountEndsAt: row.discountEndsAt,
      partnerPrice: row.partnerPrice,
      updatedAt: row.updatedAt,
    }));
  }

  private async scopeWhere(scope: PricingScope): Promise<Prisma.ProductVariantWhereInput> {
    const base: Prisma.ProductVariantWhereInput = {
      deletedAt: null,
      product: { is: { deletedAt: null, status: { not: ProductStatus.ARCHIVED } } },
    };
    if (scope.type === 'VARIANTS') {
      if (scope.variantIds.length === 0) {
        throw new BadRequestException('حداقل یک ردیف انتخاب کنید.');
      }
      return { ...base, id: { in: [...new Set(scope.variantIds)] } };
    }
    if (scope.type === 'PRODUCTS') {
      if (scope.productIds.length === 0) {
        throw new BadRequestException('حداقل یک محصول انتخاب کنید.');
      }
      return { ...base, productId: { in: [...new Set(scope.productIds)] } };
    }
    const categoryIds = scope.includeDescendants
      ? await this.categorySubtreeIds(scope.categoryId)
      : [scope.categoryId];
    return {
      ...base,
      product: {
        is: {
          deletedAt: null,
          status: { not: ProductStatus.ARCHIVED },
          categoryId: { in: categoryIds },
        },
      },
    };
  }

  private async productMetas(scope: PricingScope): Promise<Map<string, ProductMeta>> {
    const variants = await this.prisma.productVariant.findMany({
      where: await this.scopeWhere(scope),
      select: { productId: true, product: { select: { categoryId: true } } },
    });
    const productIds = [...new Set(variants.map((row) => row.productId))];
    const categoryIds = [
      ...new Set(variants.map((row) => row.product.categoryId)),
    ];
    const [overrides, rules] = await Promise.all([
      this.prisma.productPriceOverride.findMany({
        where: { productId: { in: productIds } },
        select: {
          productId: true,
          id: true,
          type: true,
          value: true,
          overridePrice: true,
          isActive: true,
          startsAt: true,
          endsAt: true,
          updatedAt: true,
        },
      }),
      Promise.all(
        categoryIds.map(async (categoryId) => [
          categoryId,
          await this.pricing.categoryRuleFor(categoryId),
        ] as const),
      ),
    ]);
    const overrideByProduct = new Map(
      overrides.map((row) => [row.productId, row]),
    );
    const ruleByCategory = new Map(rules);
    const categoryByProduct = new Map(
      variants.map((row) => [row.productId, row.product.categoryId]),
    );
    const metas = new Map<string, ProductMeta>();
    for (const productId of productIds) {
      const override = overrideByProduct.get(productId) ?? null;
      const categoryId = categoryByProduct.get(productId) ?? null;
      metas.set(productId, {
        override,
        categoryRule: categoryId ? (ruleByCategory.get(categoryId) ?? null) : null,
      });
    }
    return metas;
  }

  private previewRow(
    variant: TargetVariant,
    meta: ProductMeta,
    operation: BulkPriceOperation,
    warnings: string[],
  ): BulkPriceRowPreview {
    const before = this.effectivePrice(variant, meta);
    const base = {
      variantId: variant.id,
      productId: variant.productId,
      productName: variant.productName,
      sku: variant.sku,
      categoryId: variant.categoryId,
      categoryName: variant.categoryName,
      priceStatus: variant.priceStatus,
      regularPriceBefore: variant.price.toString(),
      regularPriceAfter: variant.price.toString(),
      discountedPriceBefore: variant.discountedPrice?.toString() ?? null,
      discountedPriceAfter: variant.discountedPrice?.toString() ?? null,
      effectivePriceBefore: before,
      effectivePriceAfter: before,
      expectedUpdatedAt: variant.updatedAt.toISOString(),
      outcome: 'AFFECTED' as const,
    };
    if (variant.priceStatus !== PriceStatus.PRICED) {
      return {
        ...base,
        outcome: 'SKIPPED',
        reason: 'این نوع در وضعیت تماس برای قیمت است.',
      };
    }

    const activeSale = hasActiveProductSale({
      price: variant.price,
      discountedPrice: variant.discountedPrice,
      discountStartsAt: variant.discountStartsAt,
      discountEndsAt: variant.discountEndsAt,
    });
    if (activeSale && operation.kind !== 'CLEAR_DISCOUNT') {
      warnings.push(
        'قیمت فروش ویژه فعال، قانون دسته‌بندی و اورراید را پوشش می‌دهد.',
      );
    }

    switch (operation.kind) {
      case 'CLEAR_DISCOUNT': {
        if (variant.discountedPrice === null) {
          return { ...base, outcome: 'SKIPPED', reason: 'قیمت فروش ویژه ندارد.' };
        }
        const after = this.effectivePrice(
          { ...variant, discountedPrice: null, discountStartsAt: null, discountEndsAt: null },
          meta,
        );
        return {
          ...base,
          discountedPriceAfter: null,
          effectivePriceAfter: after,
        };
      }
      case 'APPLY_DISCOUNT': {
        const proposed = this.proposedDiscount(variant.price, operation);
        if (proposed.lessThanOrEqualTo(0) || proposed.greaterThanOrEqualTo(variant.price)) {
          return {
            ...base,
            outcome: 'FAILED',
            reason:
              'تخفیف باید بزرگ‌تر از صفر و نتیجه آن کمتر از قیمت عادی باشد.',
            fieldErrors: { discountedPrice: 'تخفیف نامعتبر است.' },
          };
        }
        const discounted = proposed.toDecimalPlaces(2);
        const after = this.effectivePrice(
          {
            ...variant,
            discountedPrice: discounted,
            discountStartsAt: null,
            discountEndsAt: null,
          },
          meta,
        );
        return {
          ...base,
          discountedPriceAfter: discounted.toString(),
          effectivePriceAfter: after,
        };
      }
      case 'ADJUST_REGULAR_PRICE': {
        const percent = this.parsePercent('PERCENT', operation.value, true);
        const factor =
          operation.direction === 'INCREASE'
            ? new Prisma.Decimal(100).plus(percent)
            : new Prisma.Decimal(100).minus(percent);
        if (factor.lessThanOrEqualTo(0)) {
          return {
            ...base,
            outcome: 'FAILED',
            reason: 'درصد کاهش باید کمتر از ۱۰۰ باشد.',
            fieldErrors: { value: 'درصد نامعتبر است.' },
          };
        }
        const proposed = variant.price.mul(factor).div(100).toDecimalPlaces(2);
        if (proposed.lessThanOrEqualTo(0)) {
          return {
            ...base,
            outcome: 'FAILED',
            reason: 'قیمت عادی حاصل باید بزرگ‌تر از صفر باشد.',
          };
        }
        const saleStillValid =
          variant.discountedPrice === null ||
          variant.discountedPrice.lessThan(proposed);
        if (!saleStillValid) {
          return {
            ...base,
            regularPriceAfter: proposed.toString(),
            outcome: 'FAILED',
            reason:
              'قیمت فروش ویژه فعلی از قیمت عادی جدید کمتر نیست؛ ابتدا تخفیف را پاک کنید.',
            fieldErrors: { regularPrice: 'قیمت فروش ویژه با قیمت جدید ناسازگار است.' },
          };
        }
        const after = this.effectivePrice({ ...variant, price: proposed }, meta);
        return {
          ...base,
          regularPriceAfter: proposed.toString(),
          effectivePriceAfter: after,
        };
      }
      case 'SET_OVERRIDE': {
        if (activeSale) {
          return {
            ...base,
            outcome: 'SKIPPED',
            reason:
              'قیمت فروش ویژه فعال بر اورراید اولویت دارد؛ ابتدا تخفیف را پاک کنید.',
          };
        }
        const override = this.overrideFromOperation(operation);
        const after = this.effectivePrice(variant, { ...meta, override: null }, override);
        return { ...base, effectivePriceAfter: after };
      }
      case 'CLEAR_OVERRIDE': {
        if (meta.override === null) {
          return { ...base, outcome: 'SKIPPED', reason: 'اوررایدی ثبت نشده است.' };
        }
        const after = this.effectivePrice(variant, { ...meta, override: null });
        return { ...base, effectivePriceAfter: after };
      }
    }
  }

  private proposedDiscount(
    price: Prisma.Decimal,
    operation: Extract<BulkPriceOperation, { kind: 'APPLY_DISCOUNT' }>,
  ): Prisma.Decimal {
    if (operation.mode === 'FIXED') {
      const amount = this.parsePositive(operation.value, 'مبلغ تخفیف');
      return price.sub(amount);
    }
    const percent = this.parsePercent('PERCENT', operation.value, true);
    return price.mul(new Prisma.Decimal(100).minus(percent)).div(100);
  }

  private variantUpdateFor(
    operation: BulkPriceOperation,
    row: BulkPriceRowPreview,
    currentPrice: Prisma.Decimal,
  ): Prisma.ProductVariantUpdateManyMutationInput {
    switch (operation.kind) {
      case 'APPLY_DISCOUNT':
        return {
          discountedPrice: row.discountedPriceAfter,
          discountStartsAt: null,
          discountEndsAt: null,
          priceUpdatedAt: new Date(),
        };
      case 'CLEAR_DISCOUNT':
        return {
          discountedPrice: null,
          discountStartsAt: null,
          discountEndsAt: null,
          priceUpdatedAt: new Date(),
        };
      case 'ADJUST_REGULAR_PRICE': {
        const newPrice = new Prisma.Decimal(row.regularPriceAfter ?? currentPrice);
        const changed = newPrice.comparedTo(currentPrice) !== 0;
        return {
          price: newPrice,
          ...(changed
            ? {
                priceSourceCurrency: PriceSourceCurrency.RIAL,
                priceSourceAmount: newPrice.toFixed(2),
                priceSourceRate: null,
                priceSourceRateAt: null,
                priceSourceRateId: null,
              }
            : {}),
          priceUpdatedAt: new Date(),
        };
      }
      default:
        return {};
    }
  }

  private async applyOverride(
    tx: Prisma.TransactionClient,
    operatorId: string,
    productId: string,
    operation: Extract<BulkPriceOperation, { kind: 'SET_OVERRIDE' }>,
  ): Promise<void> {
    const shape = this.overrideFromOperation(operation);
    const existing = await tx.productPriceOverride.findUnique({
      where: { productId },
      select: { id: true },
    });
    const data = {
      type: shape.type,
      value: shape.value,
      overridePrice: shape.overridePrice,
      isActive: true,
      startsAt: operation.startsAt ? new Date(operation.startsAt) : null,
      endsAt: operation.endsAt ? new Date(operation.endsAt) : null,
    };
    if (existing) {
      await tx.productPriceOverride.update({
        where: { id: existing.id },
        data: { ...data, updatedBy: operatorId },
      });
      await this.audit.log(
        {
          userId: operatorId,
          action: 'PRODUCT_PRICE_OVERRIDE_UPDATED',
          entity: 'ProductPriceOverride',
          entityId: existing.id,
          before: null,
          after: {
            productId,
            type: shape.type,
            value: shape.value?.toString() ?? null,
            overridePrice: shape.overridePrice?.toString() ?? null,
          },
        },
        tx,
      );
      return;
    }
    const created = await tx.productPriceOverride.create({
      data: { productId, ...data, createdBy: operatorId },
    });
    await this.audit.log(
      {
        userId: operatorId,
        action: 'PRODUCT_PRICE_OVERRIDE_CREATED',
        entity: 'ProductPriceOverride',
        entityId: created.id,
        before: null,
        after: {
          productId,
          type: shape.type,
          value: shape.value?.toString() ?? null,
          overridePrice: shape.overridePrice?.toString() ?? null,
        },
      },
      tx,
    );
  }

  private overrideFromOperation(
    operation: Extract<BulkPriceOperation, { kind: 'SET_OVERRIDE' }>,
  ): ProductOverride {
    if (operation.overridePrice !== undefined && operation.overridePrice !== null) {
      if (operation.type !== undefined || operation.value !== undefined) {
        throw new BadRequestException(
          'اورراید مطلق و تخفیف درصدی/مبلغی هم‌زمان مجاز نیستند.',
        );
      }
      return {
        type: null,
        value: null,
        overridePrice: this.parsePositive(operation.overridePrice, 'قیمت اورراید'),
      };
    }
    if (operation.type === undefined || operation.value === undefined) {
      throw new BadRequestException('نوع و مقدار اورراید الزامی است.');
    }
    const value = this.parsePositive(operation.value, 'مقدار اورراید');
    if (operation.type === 'PERCENT' && value.greaterThan(100)) {
      throw new BadRequestException('درصد اورراید نمی‌تواند بیشتر از ۱۰۰ باشد.');
    }
    return { type: operation.type, value, overridePrice: null };
  }

  private effectivePrice(
    variant: Pick<
      TargetVariant,
      | 'price'
      | 'discountedPrice'
      | 'discountStartsAt'
      | 'discountEndsAt'
    >,
    meta: ProductMeta,
    overrideOverride?: ProductOverride | null,
  ): string | null {
    const override =
      overrideOverride !== undefined
        ? overrideOverride
        : this.activeOverride(meta.override);
    return PricingService.resolveLine(
      variant.price,
      1,
      new Prisma.Decimal(0),
      [],
      { categoryRule: meta.categoryRule, override },
      {
        regularPrice: variant.price,
        discountedPrice: variant.discountedPrice,
        discountStartsAt: variant.discountStartsAt,
        discountEndsAt: variant.discountEndsAt,
      },
    ).toString();
  }

  private activeOverride(
    override: ProductMeta['override'],
  ): ProductOverride | null {
    if (!override || !override.isActive) {
      return null;
    }
    const now = Date.now();
    if (override.startsAt !== null && override.startsAt.getTime() > now) {
      return null;
    }
    if (override.endsAt !== null && override.endsAt.getTime() < now) {
      return null;
    }
    if (override.overridePrice !== null) {
      return {
        type: null,
        value: null,
        overridePrice: new Prisma.Decimal(override.overridePrice.toString()),
      };
    }
    if (override.type === null || override.value === null) {
      return null;
    }
    return {
      type: override.type,
      value: new Prisma.Decimal(override.value.toString()),
      overridePrice: null,
    };
  }

  private previewToken(
    scope: PricingScope,
    operation: BulkPriceOperation,
    variants: TargetVariant[],
    metas: Map<string, ProductMeta>,
  ): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          scope,
          operation,
          variants: variants.map((variant) => ({
            id: variant.id,
            updatedAt: variant.updatedAt.toISOString(),
            price: variant.price.toString(),
            discountedPrice: variant.discountedPrice?.toString() ?? null,
            discountStartsAt: variant.discountStartsAt?.toISOString() ?? null,
            discountEndsAt: variant.discountEndsAt?.toISOString() ?? null,
            partnerPrice: variant.partnerPrice?.toString() ?? null,
          })),
          overrides: [...metas.entries()]
            .map(([productId, meta]) => ({
              productId,
              override: meta.override
                ? {
                    id: meta.override.id,
                    updatedAt: meta.override.updatedAt.toISOString(),
                  }
                : null,
            }))
            .sort((a, b) => a.productId.localeCompare(b.productId)),
        }),
      )
      .digest('hex');
  }

  private async categorySubtreeIds(categoryId: string): Promise<string[]> {
    const ids = new Set<string>([categoryId]);
    let frontier = [categoryId];
    for (let depth = 0; depth < 32 && frontier.length > 0; depth += 1) {
      const children = await this.prisma.category.findMany({
        where: {
          parentId: { in: frontier },
          deletedAt: null,
        },
        select: { id: true },
      });
      frontier = [];
      for (const child of children) {
        if (!ids.has(child.id)) {
          ids.add(child.id);
          frontier.push(child.id);
        }
      }
    }
    return [...ids];
  }

  private applyRuleToPrice(
    price: Prisma.Decimal,
    rate: { type: PromotionType; value: Prisma.Decimal },
  ): Prisma.Decimal {
    if (rate.type === 'PERCENT') {
      return price.mul(new Prisma.Decimal(100).minus(rate.value)).div(100);
    }
    return price.sub(rate.value);
  }

  private parsePercent(
    type: PromotionType,
    raw: string,
    positiveOnly = false,
  ): Prisma.Decimal {
    const value = this.parsePositive(raw, 'درصد');
    if (type === 'PERCENT' && value.greaterThan(100)) {
      throw new BadRequestException('درصد نمی‌تواند بیشتر از ۱۰۰ باشد.');
    }
    if (positiveOnly && value.lessThanOrEqualTo(0)) {
      throw new BadRequestException('درصد باید بزرگ‌تر از صفر باشد.');
    }
    return value;
  }

  private parsePositive(raw: string, label: string): Prisma.Decimal {
    let value: Prisma.Decimal;
    try {
      value = new Prisma.Decimal(raw);
    } catch {
      throw new BadRequestException(`${label} معتبر نیست.`);
    }
    if (!value.isFinite() || value.lessThanOrEqualTo(0)) {
      throw new BadRequestException(`${label} باید بزرگ‌تر از صفر باشد.`);
    }
    return value;
  }

  private categoryRow(
    variant: TargetVariant,
    outcome: 'AFFECTED' | 'SKIPPED' | 'FAILED',
    rulePrice: string | undefined,
    reason?: string,
  ): CategoryRulePreviewRow {
    const current = this.effectivePrice(variant, {
      override: null,
      categoryRule: null,
    });
    return {
      variantId: variant.id,
      productId: variant.productId,
      productName: variant.productName,
      sku: variant.sku,
      categoryName: variant.categoryName,
      regularPrice: variant.price.toString(),
      currentEffectivePrice: current,
      ruleEffectivePrice: rulePrice ?? null,
      outcome,
      reason,
    };
  }

  private ruleStatus(
    isActive: boolean,
    startsAt: Date | null,
    endsAt: Date | null,
  ): string {
    if (!isActive) {
      return 'INACTIVE';
    }
    const now = Date.now();
    if (startsAt !== null && startsAt.getTime() > now) {
      return 'SCHEDULED';
    }
    if (endsAt !== null && endsAt.getTime() < now) {
      return 'EXPIRED';
    }
    return 'ACTIVE';
  }
}
