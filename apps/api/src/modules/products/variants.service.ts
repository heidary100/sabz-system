import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import type { VariantSummary } from '@sabz/types';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import {
  CreateVariantDto,
  UpdateVariantDto,
  UpdateVariantInventoryDto,
} from './dto';

const variantSelect = {
  id: true,
  productId: true,
  sku: true,
  barcode: true,
  name: true,
  price: true,
  stockQuantity: true,
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
    private readonly inventoryService: InventoryService,
  ) {}

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
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        await this.assertProductForMutation(tx, productId);

        const row = await tx.productVariant.create({
          data: {
            productId,
            sku: dto.sku,
            barcode: dto.barcode ?? null,
            name: dto.name ?? null,
            price: dto.price,
            stockQuantity: dto.stockQuantity ?? 0,
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
              stockQuantity: row.stockQuantity,
            },
            ipAddress,
          },
          tx,
        );

        return row;
      });

      return this.toSummary(created);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('یک واریانت با این sku قبلاً وجود دارد.');
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
      const updated = await this.prisma.$transaction(async (tx) => {
        const target = await this.readVariantInTx(tx, variantId);
        await this.assertProductForMutation(tx, target.productId);

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

        const current = await tx.productVariant.findUnique({
          where: { id: variantId },
          select: variantSelect,
        });
        if (!current || current.deletedAt !== null) {
          throw new NotFoundException('واریانت یافت نشد.');
        }
        return current;
      });

      return this.toSummary(updated);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('یک واریانت با این sku قبلاً وجود دارد.');
      }
      throw error;
    }
  }

  /**
   * SS-104 compatibility absolute set (deprecated, not removed). The M1
   * boundary endpoint no longer writes `ProductVariant.stockQuantity`
   * directly; the write is routed through the inventory write path
   * (InventoryService.setVariantStockCompat) which mutates the authoritative
   * default-warehouse InventoryItem, writes a MANUAL_ADJUSTMENT movement,
   * refreshes the stockQuantity aggregate and audits, all in one transaction.
   * No stock transaction lives here anymore.
   */
  async updateInventory(
    variantId: string,
    dto: UpdateVariantInventoryDto,
    actorId: string,
    ipAddress?: string,
  ): Promise<VariantSummary> {
    await this.inventoryService.setVariantStockCompat(
      variantId,
      dto.stockQuantity,
      actorId,
      ipAddress,
    );
    const row = await this.readVariant(variantId);
    return this.toSummary(row);
  }

  async softDelete(
    variantId: string,
    actorId: string,
    ipAddress?: string,
  ): Promise<VariantSummary> {
    const deleted = await this.prisma.$transaction(async (tx) => {
      const target = await this.readVariantInTx(tx, variantId);

      const deletedAt = new Date();
      const updatedRows = await tx.productVariant.updateMany({
        where: { id: variantId, deletedAt: null },
        data: { deletedAt, updatedBy: actorId },
      });
      if (updatedRows.count === 0) {
        throw new NotFoundException('واریانت یافت نشد.');
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

      return target;
    });

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
      stockQuantity: row.stockQuantity,
    };
  }

  /**
   * Verify the owning product exists, is not soft-deleted, and is not
   * ARCHIVED. A variant that would be sellable must never be created or
   * mutated under an archived or deleted product.
   */
  private async assertProductForMutation(
    tx: Prisma.TransactionClient,
    productId: string,
  ): Promise<void> {
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: { id: true, status: true, deletedAt: true },
    });

    if (!product || product.deletedAt !== null) {
      throw new NotFoundException('محصول یافت نشد.');
    }
    if (product.status === ProductStatus.ARCHIVED) {
      throw new ConflictException(
        'محصول آرشیوشده قابل ویرایش نیست؛ ابتدا وضعیت آن را بازگردانید.',
      );
    }
  }

  private async readVariant(variantId: string): Promise<VariantRow> {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      select: variantSelect,
    });
    if (!variant || variant.deletedAt !== null) {
      throw new NotFoundException('واریانت یافت نشد.');
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
      throw new NotFoundException('واریانت یافت نشد.');
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
      throw new NotFoundException('واریانت یافت نشد.');
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
}
