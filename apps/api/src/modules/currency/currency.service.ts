import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CurrencyCode, Prisma, ProductStatus } from '@prisma/client';
import { createHash } from 'crypto';
import {
  CURRENCY_FA,
  type CurrencyConversionResponse,
  type CurrencyRateDto,
  type CurrencyRateListResponse,
  type CurrencyRecalculationPreviewResponse,
  type CurrencyRecalculationRow,
} from '@sabz/types';
import { PrismaService } from '../../common/database/prisma.service';
import { roundRialUp } from '../../common/money/rial';
import { StorefrontCacheService } from '../../common/storefront-cache/storefront-cache.service';
import {
  CATALOG_PRODUCTS_TAG,
  productDetailTag,
} from '../../common/storefront-cache/catalog-tags';
import { AuditService } from '../audit/audit.service';
import { recomputeProductsMinPrice } from '../products/min-price';
import type {
  ApplyCurrencyRecalculationDto,
  CreateCurrencyRateDto,
  CurrencyRecalculationDto,
} from './dto/currency.dto';

const MAX_RATE = new Prisma.Decimal('1000000000000');

type CurrencyRateRow = Prisma.CurrencyRateGetPayload<Record<string, never>>;

/**
 * Manual FX rate administration (SS-900).
 *
 * Rates are operator-entered values, never live market data. Every write is
 * append-only and audited; the effective rate is the newest row at/before
 * now. Conversion is admin-side only and never exposed to the storefront.
 */
@Injectable()
export class CurrencyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cache: StorefrontCacheService,
  ) {}

  async list(
    currency: CurrencyCode | undefined,
    page: number,
    limit: number,
  ): Promise<CurrencyRateListResponse> {
    const safePage = Number.isInteger(page) && page > 0 ? page : 1;
    const safeLimit =
      Number.isInteger(limit) && limit > 0 ? Math.min(limit, 200) : 50;
    const where: Prisma.CurrencyRateWhereInput = currency
      ? { currency }
      : {};
    const [total, rows, currentRows] = await this.prisma.$transaction([
      this.prisma.currencyRate.count({ where }),
      this.prisma.currencyRate.findMany({
        where,
        orderBy: [{ effectiveAt: 'desc' }, { createdAt: 'desc' }],
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      this.prisma.currencyRate.findMany({
        where: { effectiveAt: { lte: new Date() } },
        orderBy: [{ effectiveAt: 'desc' }, { createdAt: 'desc' }],
        distinct: ['currency'],
      }),
    ]);
    return {
      items: rows.map((row) => this.toDto(row)),
      total,
      page: safePage,
      limit: safeLimit,
      current: currentRows.map((row) => this.toDto(row)),
    };
  }

  async create(
    input: CreateCurrencyRateDto,
    userId: string,
    ipAddress?: string,
  ): Promise<CurrencyRateDto> {
    const rate = this.parsePositiveRate(input.rialPerUnit);
    const effectiveAt = input.effectiveAt
      ? new Date(input.effectiveAt)
      : new Date();
    if (Number.isNaN(effectiveAt.getTime())) {
      throw new BadRequestException('زمان اعتبار معتبر نیست.');
    }
    const note = input.note?.trim() || null;
    const row = await this.prisma.currencyRate.create({
      data: {
        currency: input.currency,
        rialPerUnit: rate,
        effectiveAt,
        note,
        createdBy: userId,
      },
    });
    await this.audit.log({
      userId,
      action: 'CURRENCY_RATE_CREATED',
      entity: 'CurrencyRate',
      entityId: row.id,
      after: {
        currency: row.currency,
        rialPerUnit: row.rialPerUnit.toString(),
        effectiveAt: row.effectiveAt.toISOString(),
      },
      ipAddress,
    });
    return this.toDto(row);
  }

  /** Current effective rate, or a non-disclosure 404 when none exists. */
  async current(currency: CurrencyCode): Promise<CurrencyRateDto> {
    const row = await this.prisma.currencyRate.findFirst({
      where: { currency, effectiveAt: { lte: new Date() } },
      orderBy: [{ effectiveAt: 'desc' }, { createdAt: 'desc' }],
    });
    if (!row) {
      throw new NotFoundException('نرخی برای این واحد پول ثبت نشده است.');
    }
    return this.toDto(row);
  }

  async convert(
    currency: CurrencyCode,
    amount: string,
  ): Promise<CurrencyConversionResponse> {
    const parsedAmount = this.parsePositiveAmount(amount);
    const rate = await this.current(currency);
    const rial = parsedAmount.mul(new Prisma.Decimal(rate.rialPerUnit));
    return {
      currency,
      amount: parsedAmount.toFixed(2),
      rialPerUnit: rate.rialPerUnit,
      rial: rial.toFixed(2),
      effectiveAt: rate.effectiveAt,
    };
  }

  /**
   * Preview the effect of a new manual rate on every variant whose source
   * currency matches. Only rows with a stored source amount are considered;
   * ambiguous/legacy rows are reported as skipped, never silently changed.
   */
  async previewRecalculation(
    input: CurrencyRecalculationDto,
  ): Promise<CurrencyRecalculationPreviewResponse> {
    const rate = this.parsePositiveRate(input.rialPerUnit);
    const effectiveAt = input.effectiveAt
      ? new Date(input.effectiveAt)
      : new Date();
    if (Number.isNaN(effectiveAt.getTime())) {
      throw new BadRequestException('زمان اعتبار معتبر نیست.');
    }
    const variants = await this.prisma.productVariant.findMany({
      where: {
        deletedAt: null,
        priceSourceCurrency: input.currency,
        priceSourceAmount: { not: null },
        product: {
          is: { deletedAt: null, status: { not: ProductStatus.ARCHIVED } },
        },
      },
      select: {
        id: true,
        productId: true,
        sku: true,
        price: true,
        discountedPrice: true,
        priceSourceAmount: true,
        discountSourceAmount: true,
        updatedAt: true,
        product: { select: { name: true, slug: true } },
      },
      orderBy: [{ productId: 'asc' }, { id: 'asc' }],
    });
    const rows: CurrencyRecalculationRow[] = variants.map((variant) => {
      const source = variant.priceSourceAmount!;
      const proposedRegular = roundRialUp(source.mul(rate));
      const proposedDiscount =
        variant.discountSourceAmount === null
          ? null
          : roundRialUp(variant.discountSourceAmount.mul(rate));
      const invalidDiscount =
        proposedDiscount !== null &&
        proposedDiscount.greaterThanOrEqualTo(proposedRegular);
      return {
        variantId: variant.id,
        productId: variant.productId,
        productName: variant.product.name,
        sku: variant.sku,
        sourceAmount: source.toString(),
        sourceDiscountAmount: variant.discountSourceAmount?.toString() ?? null,
        currentRegularPrice: variant.price.toString(),
        proposedRegularPrice: proposedRegular.toString(),
        currentDiscountedPrice: variant.discountedPrice?.toString() ?? null,
        proposedDiscountedPrice: invalidDiscount
          ? null
          : (proposedDiscount?.toString() ?? null),
        expectedUpdatedAt: variant.updatedAt.toISOString(),
        outcome: invalidDiscount ? 'SKIPPED' : 'AFFECTED',
        ...(invalidDiscount
          ? { reason: 'قیمت فروش ویژه پس از تبدیل معتبر نیست.' }
          : {}),
      };
    });
    return {
      previewToken: this.recalculationToken(input.currency, rate, variants),
      currency: input.currency,
      rialPerUnit: rate.toString(),
      effectiveAt: effectiveAt.toISOString(),
      total: rows.length,
      affected: rows.filter((row) => row.outcome === 'AFFECTED').length,
      skipped: rows.filter((row) => row.outcome === 'SKIPPED').length,
      rows,
      warnings: variants.length === 0
        ? ['هیچ محصولی با منبع ارزی این واحد پول یافت نشد.']
        : [],
    };
  }

  /**
   * Apply the previewed rate: append the audited rate row and atomically
   * update every affected variant's Rial price, rate snapshot and timestamp.
   * A stale preview token is rejected rather than overwriting concurrent
   * catalog edits.
   */
  async applyRecalculation(
    input: ApplyCurrencyRecalculationDto,
    userId: string,
    ipAddress?: string,
  ): Promise<CurrencyRecalculationPreviewResponse & { rateId: string }> {
    const preview = await this.previewRecalculation(input);
    if (preview.previewToken !== input.previewToken) {
      throw new ConflictException(
        'قیمت‌ها از زمان پیش‌نمایش تغییر کرده‌اند؛ پیش‌نمایش را دوباره بگیرید.',
      );
    }
    if (preview.affected === 0) {
      throw new BadRequestException('محصولی برای بازمحاسبه وجود ندارد.');
    }
    const rate = new Prisma.Decimal(preview.rialPerUnit);
    const effectiveAt = new Date(preview.effectiveAt);
    const slugs = new Set<string>();
    const productIds = new Set<string>();
    let rateId = '';
    await this.prisma.$transaction(async (tx) => {
      const rateRow = await tx.currencyRate.create({
        data: {
          currency: input.currency as CurrencyCode,
          rialPerUnit: rate,
          effectiveAt,
          note: input.note?.trim() || null,
          createdBy: userId,
        },
      });
      rateId = rateRow.id;
      for (const row of preview.rows) {
        if (row.outcome !== 'AFFECTED') {
          continue;
        }
        const updated = await tx.productVariant.updateMany({
          where: {
            id: row.variantId,
            deletedAt: null,
            updatedAt: new Date(row.expectedUpdatedAt),
          },
          data: {
            price: row.proposedRegularPrice,
            discountedPrice: row.proposedDiscountedPrice,
            priceSourceRate: rate.toString(),
            priceSourceRateAt: effectiveAt,
            priceSourceRateId: rateRow.id,
            priceUpdatedAt: new Date(),
            updatedBy: userId,
          },
        });
        if (updated.count === 0) {
          throw new ConflictException(
            `ردیف ${row.sku} توسط کاربر دیگری تغییر کرده است؛ پیش‌نمایش را دوباره بگیرید.`,
          );
        }
        productIds.add(row.productId);
        const product = await tx.product.findUnique({
          where: { id: row.productId },
          select: { slug: true },
        });
        if (product) {
          slugs.add(product.slug);
        }
      }
      await recomputeProductsMinPrice(tx, [...productIds]);
      await this.audit.log(
        {
          userId,
          action: 'CURRENCY_RATE_CREATED',
          entity: 'CurrencyRate',
          entityId: rateRow.id,
          after: {
            currency: rateRow.currency,
            rialPerUnit: rateRow.rialPerUnit.toString(),
            effectiveAt: rateRow.effectiveAt.toISOString(),
            source: 'recalculation',
          },
          ipAddress,
        },
        tx,
      );
      await this.audit.log(
        {
          userId,
          action: 'CURRENCY_RATE_RECALCULATED',
          entity: 'PricingBatch',
          entityId: rateRow.id,
          before: null,
          after: {
            currency: input.currency,
            rialPerUnit: rate.toString(),
            affected: preview.affected,
            skipped: preview.skipped,
            rows: preview.rows
              .filter((row) => row.outcome === 'AFFECTED')
              .slice(0, 1000)
              .map((row) => ({
                variantId: row.variantId,
                sku: row.sku,
                before: row.currentRegularPrice,
                after: row.proposedRegularPrice,
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
    return { ...preview, rateId };
  }

  private recalculationToken(
    currency: CurrencyCode,
    rate: Prisma.Decimal,
    variants: Array<{
      id: string;
      updatedAt: Date;
      price: Prisma.Decimal;
      discountedPrice: Prisma.Decimal | null;
      priceSourceAmount: Prisma.Decimal | null;
      discountSourceAmount: Prisma.Decimal | null;
    }>,
  ): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          currency,
          rate: rate.toString(),
          variants: variants.map((variant) => ({
            id: variant.id,
            updatedAt: variant.updatedAt.toISOString(),
            price: variant.price.toString(),
            discountedPrice: variant.discountedPrice?.toString() ?? null,
            priceSourceAmount: variant.priceSourceAmount?.toString() ?? null,
            discountSourceAmount: variant.discountSourceAmount?.toString() ?? null,
          })),
        }),
      )
      .digest('hex');
  }

  private parsePositiveRate(raw: string): Prisma.Decimal {
    let rate: Prisma.Decimal;
    try {
      rate = new Prisma.Decimal(raw);
    } catch {
      throw new BadRequestException('نرخ معتبر نیست.');
    }
    if (!rate.isFinite() || rate.lessThanOrEqualTo(0)) {
      throw new BadRequestException('نرخ باید بزرگ‌تر از صفر باشد.');
    }
    if (rate.greaterThan(MAX_RATE)) {
      throw new BadRequestException('نرخ خارج از محدوده مجاز است.');
    }
    if (rate.decimalPlaces() > 2) {
      throw new BadRequestException('نرخ حداکثر دو رقم اعشار دارد.');
    }
    return rate;
  }

  private parsePositiveAmount(raw: string): Prisma.Decimal {
    let amount: Prisma.Decimal;
    try {
      amount = new Prisma.Decimal(raw);
    } catch {
      throw new BadRequestException('مبلغ معتبر نیست.');
    }
    if (!amount.isFinite() || amount.lessThan(0)) {
      throw new BadRequestException('مبلغ باید صفر یا مثبت باشد.');
    }
    if (amount.decimalPlaces() > 2) {
      throw new BadRequestException('مبلغ حداکثر دو رقم اعشار دارد.');
    }
    return amount;
  }

  private toDto(row: CurrencyRateRow): CurrencyRateDto {
    return {
      id: row.id,
      currency: row.currency,
      currencyFa: CURRENCY_FA[row.currency],
      rialPerUnit: row.rialPerUnit.toString(),
      effectiveAt: row.effectiveAt.toISOString(),
      note: row.note,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
