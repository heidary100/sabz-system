import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PriceStatus, Prisma, ProductStatus } from '@prisma/client';
import type { VariantSummary } from '@sabz/types';
import { PrismaService } from '../../common/database/prisma.service';
import { StorefrontCacheService } from '../../common/storefront-cache/storefront-cache.service';
import {
  CATALOG_PRODUCTS_TAG,
  productDetailTag,
} from '../../common/storefront-cache/catalog-tags';
import { AuditService } from '../audit/audit.service';
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
    this.validatePricing({
      price: dto.price,
      compareAtPrice: dto.compareAtPrice ?? null,
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
            price: dto.price,
            compareAtPrice: dto.compareAtPrice ?? null,
            priceStatus: dto.priceStatus ?? PriceStatus.PRICED,
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
    const data = this.buildUpdateData(dto);

    try {
      let productSlug: string | null = null;
      const updated = await this.prisma.$transaction(async (tx) => {
        const target = await this.readVariantInTx(tx, variantId);
        productSlug = await this.assertProductForMutation(tx, target.productId);

        this.validatePricing({
          price:
            data.price ?? target.price.toString(),
          compareAtPrice:
            data.compareAtPrice !== undefined
              ? data.compareAtPrice
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
    if (dto.price !== undefined) data.price = dto.price;
    if (dto.compareAtPrice !== undefined)
      data.compareAtPrice = dto.compareAtPrice;
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
}
