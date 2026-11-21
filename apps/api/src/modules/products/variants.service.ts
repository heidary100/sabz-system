import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PriceSourceCurrency, PriceStatus, Prisma, ProductStatus } from '@prisma/client';
import type { VariantSummary } from '@sabz/types';
import { PrismaService } from '../../common/database/prisma.service';
import { StorefrontCacheService } from '../../common/storefront-cache/storefront-cache.service';
import {
  CATALOG_PRODUCTS_TAG,
  productDetailTag,
} from '../../common/storefront-cache/catalog-tags';
import { AuditService } from '../audit/audit.service';
import { CurrencyService } from '../currency/currency.service';
import { roundRialUp } from '../../common/money/rial';
import { recomputeProductMinPrice } from './min-price';
import { CreateVariantDto, UpdateVariantDto } from './dto';

const variantSelect = {
  id: true,
  productId: true,
  sku: true,
  barcode: true,
  name: true,
  price: true,
  compareAtPrice: true,
  priceStatus: true,
  priceSourceCurrency: true,
  priceSourceAmount: true,
  compareAtSourceAmount: true,
  priceSourceRate: true,
  priceSourceRateAt: true,
  priceSourceRateId: true,
  deletedAt: true,
} satisfies Prisma.ProductVariantSelect;

type VariantRow = Prisma.ProductVariantGetPayload<{
  select: typeof variantSelect;
}>;

const PRODUCT_ENTITY = 'ProductVariant';

@Injectable()
export class VariantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly storefrontCache: StorefrontCacheService,
    @Optional() private readonly currency?: CurrencyService,
  ) {}

  /** Listing + detail tags of the product a variant mutation touched. */
  private productCacheTags(productSlug: string | null): string[] {
    return [
      CATALOG_PRODUCTS_TAG,
      ...(productSlug !== null ? [productDetailTag(productSlug)] : []),
    ];
  }

  async list(productId: string): Promise<VariantSummary[]> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, deletedAt: true },
    });
    if (!product || product.deletedAt !== null) {
      throw new NotFoundException('محصول یافت نشد.');
    }

    const rows = await this.prisma.productVariant.findMany({
      where: { productId, deletedAt: null },
      select: variantSelect,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return rows.map((row) => this.toSummary(row));
  }

  async getDetail(variantId: string): Promise<VariantSummary> {
    const variant = await this.readVariant(variantId);
    return this.toSummary(variant);
  }

  async create(
    productId: string,
    dto: CreateVariantDto,
    actorId: string,
    ipAddress?: string,
  ): Promise<VariantSummary> {
    const pricing = await this.resolveCreatePricing(dto);
    this.validatePricing({
      price: pricing.price,
      compareAtPrice: pricing.compareAtPrice,
      priceStatus: dto.priceStatus ?? PriceStatus.PRICED,
    });
    try {
      let productSlug: string | null = null;
      const created = await this.prisma.$transaction(async (tx) => {
        productSlug = await this.assertProductForMutation(tx, productId);

        const row = await tx.productVariant.create({
          data: {
            productId,
            sku: dto.sku,
            barcode: dto.barcode ?? null,
            name: dto.name ?? null,
            price: pricing.price,
            compareAtPrice: pricing.compareAtPrice,
            priceStatus: dto.priceStatus ?? PriceStatus.PRICED,
            ...this.pricingColumns(pricing),
            createdBy: actorId,
          },
          select: variantSelect,
        });

        await this.auditService.log(
          {
            userId: actorId,
            action: 'PRODUCT_VARIANT_CREATED',
            entity: PRODUCT_ENTITY,
            entityId: row.id,
            before: null,
            after: {
              sku: row.sku,
              barcode: row.barcode,
              name: row.name,
              price: row.price.toString(),
              compareAtPrice: row.compareAtPrice?.toString() ?? null,
              priceStatus: row.priceStatus,
            },
            ipAddress,
          },
          tx,
        );

        await recomputeProductMinPrice(tx, productId);

        return row;
      });

      void this.storefrontCache.invalidate(this.productCacheTags(productSlug));
      return this.toSummary(created);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('یک نوع با این sku قبلاً وجود دارد.');
      }
      throw error;
    }
  }

  async update(
    variantId: string,
    dto: UpdateVariantDto,
    actorId: string,
    ipAddress?: string,
  ): Promise<VariantSummary> {
    try {
      let productSlug: string | null = null;
      const updated = await this.prisma.$transaction(async (tx) => {
        const target = await this.readVariantInTx(tx, variantId);
        productSlug = await this.assertProductForMutation(tx, target.productId);
        const pricing = await this.resolveUpdatePricing(dto, target);
        const data: VariantUpdateData = {
          ...this.buildUpdateData(dto),
          ...(pricing
            ? {
                price: pricing.price,
                compareAtPrice: pricing.compareAtPrice,
                ...this.pricingColumns(pricing),
              }
            : {}),
        };

        this.validatePricing({
          price: pricing?.price ?? target.price.toString(),
          compareAtPrice:
            pricing !== null
              ? pricing.compareAtPrice
              : (target.compareAtPrice?.toString() ?? null),
          priceStatus: data.priceStatus ?? target.priceStatus,
        });

        const before = this.businessDelta(target, data, 'before');
        const after = this.businessDelta(target, data, 'after');

        if (Object.keys(data).length === 0) {
          return target;
        }

        const updatedRows = await tx.productVariant.updateMany({
          where: {
            id: variantId,
            deletedAt: null,
            product: { is: { deletedAt: null, status: { not: ProductStatus.ARCHIVED } } },
          },
          data: { ...data, updatedBy: actorId },
        });
        if (updatedRows.count === 0) {
          await this.throwMutationConflict(tx, variantId);
        }

        await this.auditService.log(
          {
            userId: actorId,
            action: 'PRODUCT_VARIANT_UPDATED',
            entity: PRODUCT_ENTITY,
            entityId: variantId,
            before,
            after,
            ipAddress,
          },
          tx,
        );

        await recomputeProductMinPrice(tx, target.productId);

        const current = await tx.productVariant.findUnique({
          where: { id: variantId },
          select: variantSelect,
        });
        if (!current || current.deletedAt !== null) {
          throw new NotFoundException('نوع یافت نشد.');
        }
        return current;
      });

      void this.storefrontCache.invalidate(this.productCacheTags(productSlug));
      return this.toSummary(updated);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('یک نوع با این sku قبلاً وجود دارد.');
      }
      throw error;
    }
  }

  async softDelete(
    variantId: string,
    actorId: string,
    ipAddress?: string,
  ): Promise<VariantSummary> {
    let productSlug: string | null = null;
    const deleted = await this.prisma.$transaction(async (tx) => {
      const target = await this.readVariantInTx(tx, variantId);
      productSlug = await tx.product
        .findUnique({
          where: { id: target.productId },
          select: { slug: true },
        })
        .then((row) => row?.slug ?? null);

      const deletedAt = new Date();
      const updatedRows = await tx.productVariant.updateMany({
        where: { id: variantId, deletedAt: null },
        data: { deletedAt, updatedBy: actorId },
      });
      if (updatedRows.count === 0) {
        throw new NotFoundException('نوع یافت نشد.');
      }

      await this.auditService.log(
        {
          userId: actorId,
          action: 'PRODUCT_VARIANT_DELETED',
          entity: PRODUCT_ENTITY,
          entityId: variantId,
          before: { deletedAt: null },
          after: { deletedAt: deletedAt.toISOString() },
          ipAddress,
        },
        tx,
      );

      await recomputeProductMinPrice(tx, target.productId);

      return target;
    });

    void this.storefrontCache.invalidate(this.productCacheTags(productSlug));
    return this.toSummary(deleted);
  }

  private toSummary(row: VariantRow): VariantSummary {
    return {
      id: row.id,
      productId: row.productId,
      sku: row.sku,
      barcode: row.barcode,
      name: row.name,
      price: row.price.toString(),
      compareAtPrice: row.compareAtPrice?.toString() ?? null,
      priceStatus: row.priceStatus,
      priceSourceCurrency: row.priceSourceCurrency ?? PriceSourceCurrency.RIAL,
      priceSourceAmount: row.priceSourceAmount?.toString() ?? row.price.toString(),
      compareAtSourceAmount:
        row.compareAtSourceAmount?.toString() ??
        row.compareAtPrice?.toString() ??
        null,
      priceSourceRate: row.priceSourceRate?.toString() ?? null,
      priceSourceRateAt: row.priceSourceRateAt?.toISOString() ?? null,
    };
  }

  private pricingColumns(pricing: ResolvedVariantPricing) {
    return {
      priceSourceCurrency: pricing.priceSourceCurrency,
      priceSourceAmount: pricing.priceSourceAmount,
      compareAtSourceAmount: pricing.compareAtSourceAmount,
      priceSourceRate: pricing.priceSourceRate,
      priceSourceRateAt: pricing.priceSourceRateAt,
      priceSourceRateId: pricing.priceSourceRateId,
    };
  }

  private async resolveCreatePricing(
    dto: CreateVariantDto,
  ): Promise<ResolvedVariantPricing> {
    return this.resolvePricing(
      dto.priceSourceCurrency ?? PriceSourceCurrency.RIAL,
      dto.price,
      dto.compareAtPrice ?? null,
    );
  }

  private async resolveUpdatePricing(
    dto: UpdateVariantDto,
    target: VariantRow,
  ): Promise<ResolvedVariantPricing | null> {
    const pricingTouched =
      dto.price !== undefined ||
      dto.compareAtPrice !== undefined ||
      dto.priceSourceCurrency !== undefined;
    if (!pricingTouched) {
      return null;
    }
    // A partial price edit keeps the variant's existing source currency. Only
    // an explicit `priceSourceCurrency` switches it (and that switch requires
    // a price); new variants default to Rial in resolveCreatePricing.
    const currency =
      dto.priceSourceCurrency ??
      target.priceSourceCurrency ??
      PriceSourceCurrency.RIAL;
    if (
      dto.priceSourceCurrency !== undefined &&
      dto.priceSourceCurrency !== target.priceSourceCurrency &&
      dto.price === undefined
    ) {
      throw new BadRequestException(
        'برای تغییر واحد پول، مبلغ قیمت را نیز وارد کنید.',
      );
    }
    const sourcePrice =
      dto.price ??
      (currency === PriceSourceCurrency.RIAL
        ? target.price.toString()
        : (target.priceSourceAmount?.toString() ?? target.price.toString()));
    const sourceCompare =
      dto.compareAtPrice !== undefined
        ? dto.compareAtPrice
        : currency === PriceSourceCurrency.RIAL
          ? (target.compareAtPrice?.toString() ?? null)
          : (target.compareAtSourceAmount?.toString() ??
            target.compareAtPrice?.toString() ??
            null);
    return this.resolvePricing(currency, sourcePrice, sourceCompare);
  }

  private async resolvePricing(
    currency: PriceSourceCurrency,
    sourcePrice: string,
    sourceCompare: string | null,
  ): Promise<ResolvedVariantPricing> {
    const source = parseMoney(sourcePrice, 'قیمت');
    const sourceCompareAt =
      sourceCompare === null ? null : parseMoney(sourceCompare, 'قیمت قبل از تخفیف');
    if (currency === PriceSourceCurrency.RIAL) {
      return {
        price: source.toFixed(2),
        compareAtPrice: sourceCompareAt?.toFixed(2) ?? null,
        priceSourceCurrency: currency,
        priceSourceAmount: source.toFixed(2),
        compareAtSourceAmount: sourceCompareAt?.toFixed(2) ?? null,
        priceSourceRate: null,
        priceSourceRateAt: null,
        priceSourceRateId: null,
      };
    }
    let rate;
    try {
      if (!this.currency) {
        throw new Error('CurrencyService unavailable');
      }
      rate = await this.currency.current(currency);
    } catch {
      throw new BadRequestException(
        `نرخ ${currency === 'USD' ? 'دلار' : 'درهم'} ثبت نشده است؛ ابتدا نرخ ارز را در تنظیمات ثبت کنید.`,
      );
    }
    const rateValue = new Prisma.Decimal(rate.rialPerUnit);
    const rialPrice = roundRialUp(source.mul(rateValue));
    const rialCompare =
      sourceCompareAt === null ? null : roundRialUp(sourceCompareAt.mul(rateValue));
    return {
      price: rialPrice.toString(),
      compareAtPrice: rialCompare?.toString() ?? null,
      priceSourceCurrency: currency,
      priceSourceAmount: source.toFixed(2),
      compareAtSourceAmount: sourceCompareAt?.toFixed(2) ?? null,
      priceSourceRate: rateValue.toString(),
      priceSourceRateAt: new Date(rate.effectiveAt),
      priceSourceRateId: rate.id,
    };
  }

  /**
   * Cross-field pricing rules (SS-201). Runs on effective values (DTO overlaid
   * on the stored row) so partial updates cannot sneak past the invariants:
   * - compareAtPrice requires PRICED status (a call-for-price row has no
   *   meaningful reference price).
   * - compareAtPrice must strictly exceed price (it is the pre-discount mark).
   *
   * Public so the SS-257 catalog-grid batch path enforces the same SS-251
   * invariant instead of a second implementation.
   */
  validatePricing(effective: {
    price: string;
    compareAtPrice: string | null;
    priceStatus: PriceStatus;
  }): void {
    if (effective.compareAtPrice === null) {
      return;
    }
    if (effective.priceStatus !== PriceStatus.PRICED) {
      throw new BadRequestException(
        'قیمت قبل از تخفیف فقط برای نوع قیمت‌دار مجاز است.',
      );
    }
    const compareAt = new Prisma.Decimal(effective.compareAtPrice);
    const price = new Prisma.Decimal(effective.price);
    if (compareAt.comparedTo(price) <= 0) {
      throw new BadRequestException(
        'قیمت قبل از تخفیف باید بیشتر از قیمت فروش باشد.',
      );
    }
  }

  /**
   * Verify the owning product exists, is not soft-deleted, and is not
   * ARCHIVED. A variant that would be sellable must never be created or
   * mutated under an archived or deleted product.
   */
  private async assertProductForMutation(
    tx: Prisma.TransactionClient,
    productId: string,
  ): Promise<string> {
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: { id: true, slug: true, status: true, deletedAt: true },
    });

    if (!product || product.deletedAt !== null) {
      throw new NotFoundException('محصول یافت نشد.');
    }
    if (product.status === ProductStatus.ARCHIVED) {
      throw new ConflictException(
        'محصول آرشیوشده قابل ویرایش نیست؛ ابتدا وضعیت آن را بازگردانید.',
      );
    }
    return product.slug;
  }

  private async readVariant(variantId: string): Promise<VariantRow> {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      select: variantSelect,
    });
    if (!variant || variant.deletedAt !== null) {
      throw new NotFoundException('نوع یافت نشد.');
    }
    return variant;
  }

  private async readVariantInTx(
    tx: Prisma.TransactionClient,
    variantId: string,
  ): Promise<VariantRow> {
    const variant = await tx.productVariant.findUnique({
      where: { id: variantId },
      select: variantSelect,
    });
    if (!variant || variant.deletedAt !== null) {
      throw new NotFoundException('نوع یافت نشد.');
    }
    return variant;
  }

  /**
   * Resolve why a conditional updateMany matched nothing after the in-transaction
   * pre-read already validated the variant/product. Because the pre-read ruled
   * out both cases, this only fires on a concurrent interleaving: if the variant
   * is now missing/soft-deleted it returns 404, otherwise the owning product was
   * archived/deleted concurrently and it returns 409.
   */
  private async throwMutationConflict(
    tx: Prisma.TransactionClient,
    variantId: string,
  ): Promise<never> {
    const variant = await tx.productVariant.findUnique({
      where: { id: variantId },
      select: { id: true, deletedAt: true, productId: true },
    });
    if (!variant || variant.deletedAt !== null) {
      throw new NotFoundException('نوع یافت نشد.');
    }

    const product = await tx.product.findUnique({
      where: { id: variant.productId },
      select: { deletedAt: true, status: true },
    });
    if (!product || product.deletedAt !== null || product.status === ProductStatus.ARCHIVED) {
      throw new ConflictException(
        'محصول آرشیوشده قابل ویرایش نیست؛ ابتدا وضعیت آن را بازگردانید.',
      );
    }

    throw new ConflictException('وضعیت تغییر کرده است؛ مجدد تلاش کنید.');
  }

  private buildUpdateData(dto: UpdateVariantDto): VariantUpdateData {
    const data: VariantUpdateData = {};
    if (dto.sku !== undefined) data.sku = dto.sku;
    if (dto.barcode !== undefined) data.barcode = dto.barcode;
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.priceStatus !== undefined) data.priceStatus = dto.priceStatus;
    return data;
  }

  private businessDelta(
    target: VariantRow,
    data: VariantUpdateData,
    side: 'before' | 'after',
  ): Record<string, string | null | number> {
    const delta: Record<string, string | null | number> = {};
    const changed = (key: keyof VariantUpdateData) => key in data;

    if (changed('sku')) delta.sku = side === 'before' ? target.sku : (data.sku as string);
    if (changed('barcode'))
      delta.barcode = side === 'before' ? target.barcode : (data.barcode as string | null);
    if (changed('name'))
      delta.name = side === 'before' ? target.name : (data.name as string | null);
    if (changed('price'))
      delta.price =
        side === 'before' ? target.price.toString() : (data.price as string);
    if (changed('compareAtPrice'))
      delta.compareAtPrice =
        side === 'before'
          ? (target.compareAtPrice?.toString() ?? null)
          : (data.compareAtPrice as string | null);
    if (changed('priceStatus'))
      delta.priceStatus =
        side === 'before' ? target.priceStatus : (data.priceStatus as PriceStatus);
    if (changed('priceSourceCurrency'))
      delta.priceSourceCurrency =
        side === 'before'
          ? target.priceSourceCurrency
          : (data.priceSourceCurrency as PriceSourceCurrency);
    if (changed('priceSourceAmount'))
      delta.priceSourceAmount =
        side === 'before'
          ? target.priceSourceAmount?.toString() ?? null
          : (data.priceSourceAmount as string | null);
    if (changed('compareAtSourceAmount'))
      delta.compareAtSourceAmount =
        side === 'before'
          ? target.compareAtSourceAmount?.toString() ?? null
          : (data.compareAtSourceAmount as string | null);

    return delta;
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      error.meta?.modelName === 'ProductVariant'
    );
  }
}

interface VariantUpdateData {
  sku?: string;
  barcode?: string | null;
  name?: string | null;
  price?: string;
  compareAtPrice?: string | null;
  priceStatus?: PriceStatus;
  priceSourceCurrency?: PriceSourceCurrency;
  priceSourceAmount?: string | null;
  compareAtSourceAmount?: string | null;
  priceSourceRate?: string | null;
  priceSourceRateAt?: Date | null;
  priceSourceRateId?: string | null;
}

interface ResolvedVariantPricing {
  price: string;
  compareAtPrice: string | null;
  priceSourceCurrency: PriceSourceCurrency;
  priceSourceAmount: string | null;
  compareAtSourceAmount: string | null;
  priceSourceRate: string | null;
  priceSourceRateAt: Date | null;
  priceSourceRateId: string | null;
}

function parseMoney(value: string, label: string): Prisma.Decimal {
  try {
    const amount = new Prisma.Decimal(value);
    if (!amount.isFinite() || amount.lessThan(0)) {
      throw new Error('invalid');
    }
    return amount;
  } catch {
    throw new BadRequestException(`${label} معتبر نیست.`);
  }
}
