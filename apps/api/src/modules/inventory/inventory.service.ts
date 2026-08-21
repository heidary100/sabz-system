import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProductStatus, WarehouseStatus } from '@prisma/client';
import type { InventoryItemSummary, PaginatedResult } from '@sabz/types';
import { PrismaService } from '../../common/database/prisma.service';
import {
  activeInventoryWhere,
  deriveAvailable,
  deriveStockStatus,
} from './inventory-aggregate';
import {
  ListInventoryQueryDto,
  ListWarehouseInventoryQueryDto,
} from './dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

function escapeLike(search: string): string {
  return search.replace(/[\\%_]/g, '\\$&');
}

const summarySelect = {
  id: true,
  variantId: true,
  warehouseId: true,
  quantityOnHand: true,
  quantityReserved: true,
  reorderLevel: true,
  criticalLevel: true,
  variant: {
    select: {
      id: true,
      sku: true,
      name: true,
    },
  },
  warehouse: {
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
    },
  },
} satisfies Prisma.InventoryItemSelect;

type SummaryRow = Prisma.InventoryItemGetPayload<{
  select: typeof summarySelect;
}>;

/**
 * Admin inventory read API (SS-112). Read-only: never writes InventoryItem,
 * InventoryMovement, Reservation or ProductVariant.stockQuantity. Availability
 * and stock status are always derived at read time.
 */
@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    query: ListInventoryQueryDto,
  ): Promise<PaginatedResult<InventoryItemSummary>> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const search = query.search?.trim();

    const where: Prisma.InventoryItemWhereInput = {
      ...activeInventoryWhere(
        search
          ? {
              OR: [
                {
                  sku: {
                    contains: escapeLike(search),
                    mode: 'insensitive',
                  },
                },
                {
                  name: {
                    contains: escapeLike(search),
                    mode: 'insensitive',
                  },
                },
              ],
            }
          : undefined,
      ),
      ...(query.variantId !== undefined ? { variantId: query.variantId } : {}),
      ...(query.warehouseId !== undefined
        ? { warehouseId: query.warehouseId }
        : {}),
    };

    if (query.stockStatus !== undefined) {
      const rows = await this.prisma.inventoryItem.findMany({
        where,
        select: summarySelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      const filtered = rows
        .map((row) => this.toSummary(row))
        .filter((item) => item.stockStatus === query.stockStatus);
      const start = (page - 1) * limit;
      return {
        items: filtered.slice(start, start + limit),
        total: filtered.length,
        page,
        limit,
      };
    }

    const skip = (page - 1) * limit;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.inventoryItem.count({ where }),
      this.prisma.inventoryItem.findMany({
        where,
        select: summarySelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
      }),
    ]);

    return {
      items: rows.map((row) => this.toSummary(row)),
      total,
      page,
      limit,
    };
  }

  async listByVariant(variantId: string): Promise<InventoryItemSummary[]> {
    const variant = await this.prisma.productVariant.findFirst({
      where: {
        id: variantId,
        deletedAt: null,
        product: {
          is: { deletedAt: null, status: { not: ProductStatus.ARCHIVED } },
        },
      },
      select: { id: true },
    });
    if (!variant) {
      throw new NotFoundException('واریانت یافت نشد.');
    }

    const rows = await this.prisma.inventoryItem.findMany({
      where: {
        variantId,
        ...activeInventoryWhere(),
      },
      select: summarySelect,
      orderBy: [{ warehouse: { code: 'asc' } }, { id: 'asc' }],
    });

    return rows.map((row) => this.toSummary(row));
  }

  async listByWarehouse(
    warehouseId: string,
    query: ListWarehouseInventoryQueryDto,
  ): Promise<PaginatedResult<InventoryItemSummary>> {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, deletedAt: null, status: WarehouseStatus.ACTIVE },
      select: { id: true },
    });
    if (!warehouse) {
      throw new NotFoundException('انبار یافت نشد.');
    }

    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const skip = (page - 1) * limit;
    const where: Prisma.InventoryItemWhereInput = {
      warehouseId,
      ...activeInventoryWhere(),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.inventoryItem.count({ where }),
      this.prisma.inventoryItem.findMany({
        where,
        select: summarySelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
      }),
    ]);

    return {
      items: rows.map((row) => this.toSummary(row)),
      total,
      page,
      limit,
    };
  }

  private toSummary(row: SummaryRow): InventoryItemSummary {
    return {
      id: row.id,
      variantId: row.variantId,
      warehouseId: row.warehouseId,
      quantityOnHand: row.quantityOnHand,
      quantityReserved: row.quantityReserved,
      available: deriveAvailable(row.quantityOnHand, row.quantityReserved),
      reorderLevel: row.reorderLevel,
      criticalLevel: row.criticalLevel,
      stockStatus: deriveStockStatus(row),
      variant: {
        id: row.variant.id,
        sku: row.variant.sku,
        name: row.variant.name,
      },
      warehouse: {
        id: row.warehouse.id,
        code: row.warehouse.code,
        name: row.warehouse.name,
        status: row.warehouse.status,
      },
    };
  }
}
