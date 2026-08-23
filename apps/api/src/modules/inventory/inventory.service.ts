import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryMovementType,
  Prisma,
  ProductStatus,
  WarehouseStatus,
} from '@prisma/client';
import type {
  AuditActor,
  InventoryItemSummary,
  InventoryMovementSummary,
  PaginatedResult,
} from '@sabz/types';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  activeInventoryWhere,
  aggregateVariantStock,
  deriveAvailable,
  deriveStockStatus,
} from './inventory-aggregate';
import {
  AdjustInventoryDto,
  ListInventoryQueryDto,
  ListMovementsQueryDto,
  ListWarehouseInventoryQueryDto,
  ReceiveStockDto,
} from './dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

/**
 * Default warehouse is infrastructure reference data (code `DEFAULT`, ensured
 * idempotently by the bootstrap helper). It is the target of the legacy SS-104
 * `PATCH /admin/variants/:id/inventory` compatibility path. The constants are
 * kept in sync with `apps/api/prisma/bootstrap.ts`; the bootstrap module itself
 * is not imported here because it instantiates its own PrismaClient.
 */
const DEFAULT_WAREHOUSE_CODE = 'DEFAULT';
const DEFAULT_WAREHOUSE_NAME = 'انبار پیشفرض';

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
 * Explicit movement-history projection (SS-114). Deliberately omits
 * `reference` so the ledger reference column is structurally unexposable.
 * `createdBy` is selected only to resolve the actor map; it is never
 * serialized raw.
 */
const movementSummarySelect = {
  id: true,
  inventoryItemId: true,
  variantId: true,
  warehouseId: true,
  type: true,
  quantity: true,
  reservedDelta: true,
  reason: true,
  notes: true,
  onHandBefore: true,
  onHandAfter: true,
  reservedBefore: true,
  reservedAfter: true,
  createdAt: true,
  createdBy: true,
} satisfies Prisma.InventoryMovementSelect;

type MovementSummaryRow = Prisma.InventoryMovementGetPayload<{
  select: typeof movementSummarySelect;
}>;

/**
 * Admin inventory API. SS-112 owns the read-only inventory queries; SS-113 owns
 * the mutation API (receive + absolute adjust) plus the SS-104 compatibility
 * write path (`setVariantStockCompat`). Every mutation is one interactive
 * transaction that writes exactly one InventoryMovement and exactly one
 * AuditLog and refreshes `ProductVariant.stockQuantity` from the authoritative
 * `InventoryItem` rows before committing, so the four writes commit or roll
 * back atomically. `InventoryItem` is authoritative; `ProductVariant
 * .stockQuantity` is always a denormalized aggregate.
 */
@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // SS-113 mutations
  // ---------------------------------------------------------------------------

  /**
   * Receive stock into a warehouse (SS-113). `quantity` is a positive increment
   * against the existing item; the first-ever receipt for a (variant, warehouse)
   * pair creates the InventoryItem with an INITIAL_STOCK movement, subsequent
   * receipts use PURCHASE_RECEIPT. Two concurrent receives on the same item both
   * succeed and the final `ProductVariant.stockQuantity` equals the aggregate of
   * the authoritative rows.
   */
  async receive(
    dto: ReceiveStockDto,
    actorId: string,
    ipAddress?: string,
  ): Promise<InventoryItemSummary> {
    const itemId = await this.withInventoryRetry(() =>
      this.prisma.$transaction(async (tx) => {
        await this.assertVariantForMutation(tx, dto.variantId);
        await this.assertWarehouseForMutation(tx, dto.warehouseId);

        const applied = await this.applyReceive(
          tx,
          dto.variantId,
          dto.warehouseId,
          dto.quantity,
          actorId,
        );

        await this.refreshVariantStock(tx, dto.variantId, actorId);

        await tx.inventoryMovement.create({
          data: {
            inventoryItemId: applied.itemId,
            variantId: dto.variantId,
            warehouseId: dto.warehouseId,
            type: applied.movementType,
            quantity: dto.quantity,
            reservedDelta: 0,
            reason: null,
            notes: dto.notes ?? null,
            onHandBefore: applied.onHandBefore,
            onHandAfter: applied.onHandAfter,
            reservedBefore: 0,
            reservedAfter: 0,
            createdBy: actorId,
          },
        });

        await this.auditService.log(
          {
            userId: actorId,
            action: 'INVENTORY_RECEIVED',
            entity: 'InventoryItem',
            entityId: applied.itemId,
            before: null,
            after: {
              variantId: dto.variantId,
              warehouseId: dto.warehouseId,
              quantity: dto.quantity,
              onHandBefore: applied.onHandBefore,
              onHandAfter: applied.onHandAfter,
            },
            ipAddress,
          },
          tx,
        );

        return applied.itemId;
      }),
    );

    return this.readItemSummary(itemId);
  }

  /**
   * Absolute stock adjustment (SS-113). `dto.quantity` is the ABSOLUTE desired
   * `quantityOnHand`, not a delta. A mandatory `reason` is required. The item
   * write is a conditional expected-value update (`quantityOnHand = <read
   * value>`), so a concurrent adjust on the same item produces exactly one
   * winner; the stale requester receives 409 and writes no movement or audit.
   * An exact same-value adjust still records a zero-delta MANUAL_ADJUSTMENT
   * movement and audit (every successful mutation writes exactly one of each).
   */
  async adjust(
    dto: AdjustInventoryDto,
    actorId: string,
    ipAddress?: string,
  ): Promise<InventoryItemSummary> {
    const itemId = await this.withInventoryRetry(() =>
      this.prisma.$transaction(async (tx) => {
        await this.assertVariantForMutation(tx, dto.variantId);
        await this.assertWarehouseForMutation(tx, dto.warehouseId);

        const applied = await this.applyAbsoluteSet(tx, {
          variantId: dto.variantId,
          warehouseId: dto.warehouseId,
          requested: dto.quantity,
          reason: dto.reason,
          notes: dto.notes ?? null,
          actorId,
          createIfMissing: false,
        });

        await this.refreshVariantStock(tx, dto.variantId, actorId);

        await this.auditService.log(
          {
            userId: actorId,
            action: 'INVENTORY_ADJUSTED',
            entity: 'InventoryItem',
            entityId: applied.itemId,
            before: null,
            after: {
              variantId: dto.variantId,
              warehouseId: dto.warehouseId,
              requestedQuantity: dto.quantity,
              delta: applied.delta,
              reason: dto.reason,
              onHandBefore: applied.onHandBefore,
              onHandAfter: applied.onHandAfter,
            },
            ipAddress,
          },
          tx,
        );

        return applied.itemId;
      }),
    );

    return this.readItemSummary(itemId);
  }

  /**
   * SS-104 compatibility absolute set (deprecated, not removed). Routes the
   * legacy `PATCH /admin/variants/:id/inventory` write through the inventory
   * write path: an absolute set on the default warehouse's InventoryItem, a
   * MANUAL_ADJUSTMENT movement, an aggregate refresh of
   * `ProductVariant.stockQuantity`, and the legacy `PRODUCT_INVENTORY_SET`
   * audit event — all in one transaction. Returns nothing; the caller re-reads
   * the variant to build its own response.
   */
  async setVariantStockCompat(
    variantId: string,
    stockQuantity: number,
    actorId: string,
    ipAddress?: string,
  ): Promise<void> {
    await this.withInventoryRetry(() =>
      this.prisma.$transaction(async (tx) => {
        await this.assertVariantForMutation(tx, variantId);
        const warehouse = await this.ensureDefaultWarehouse(tx);
        await this.assertWarehouseForMutation(tx, warehouse.id);
        const beforeStock = await this.readStoredStock(tx, variantId);

        const applied = await this.applyAbsoluteSet(tx, {
          variantId,
          warehouseId: warehouse.id,
          requested: stockQuantity,
          reason: null,
          notes: null,
          actorId,
          createIfMissing: true,
        });

        const aggregateAfter = await this.refreshVariantStock(
          tx,
          variantId,
          actorId,
        );

        await this.auditService.log(
          {
            userId: actorId,
            action: 'PRODUCT_INVENTORY_SET',
            entity: 'ProductVariant',
            entityId: variantId,
            before: { stockQuantity: beforeStock },
            after: { stockQuantity: aggregateAfter },
            ipAddress,
          },
          tx,
        );

        return applied.itemId;
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // SS-112 read API
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // SS-114 movement history
  // ---------------------------------------------------------------------------

  /**
   * Read-only paginated view of the immutable InventoryMovement ledger
   * (SS-114). Filters combine with AND and match exact stored values;
   * `from`/`to` bound `createdAt` inclusively (ISO UTC). Ordering is
   * deterministic: `createdAt DESC`, then `id DESC`.
   *
   * Historical semantics: the movement row itself determines visibility. No
   * active-resource lifecycle filter is applied, so movements for
   * soft-deleted variants/products and soft-deleted or deactivated warehouses
   * remain queryable, and filter values are predicates rather than resource
   * lookups (a valid but nonexistent UUID returns an empty page, never 404).
   *
   * Actors are resolved in a second batch query (no N+1). A missing actor row
   * never 404s or drops the movement: `actor` is `null` only when the user row
   * is absent. Soft-deleted actors resolve normally so attribution is kept.
   * `reference` is never selected and never exposed.
   */
  async listMovements(
    query: ListMovementsQueryDto,
  ): Promise<PaginatedResult<InventoryMovementSummary>> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const skip = (page - 1) * limit;

    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (
      (from !== undefined && Number.isNaN(from.getTime())) ||
      (to !== undefined && Number.isNaN(to.getTime()))
    ) {
      throw new BadRequestException('from/to باید یک زمان ISO 8601 معتبر باشد.');
    }
    if (from !== undefined && to !== undefined && from.getTime() > to.getTime()) {
      throw new BadRequestException('from نباید دیرتر از to باشد.');
    }

    const where: Prisma.InventoryMovementWhereInput = {
      ...(query.variantId !== undefined ? { variantId: query.variantId } : {}),
      ...(query.warehouseId !== undefined
        ? { warehouseId: query.warehouseId }
        : {}),
      ...(query.type !== undefined ? { type: query.type } : {}),
      ...(from !== undefined || to !== undefined
        ? {
            createdAt: {
              ...(from !== undefined ? { gte: from } : {}),
              ...(to !== undefined ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.inventoryMovement.count({ where }),
      this.prisma.inventoryMovement.findMany({
        where,
        select: movementSummarySelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
      }),
    ]);

    const actors = await this.resolveMovementActors(
      rows.map((row) => row.createdBy),
    );

    return {
      items: rows.map((row) => this.toMovementSummary(row, actors)),
      total,
      page,
      limit,
    };
  }

  /**
   * Batch actor resolution for movement rows (SS-114), mirroring the SS-064
   * audit actor policy: duplicate IDs are deduplicated into a single IN query,
   * soft-deleted users resolve normally (no deletedAt filter), and absent user
   * rows simply produce no map entry (actor becomes null downstream).
   */
  private async resolveMovementActors(
    createdBy: Array<string | null>,
  ): Promise<Map<string, AuditActor>> {
    const ids = [
      ...new Set(createdBy.filter((id): id is string => id !== null)),
    ];
    if (ids.length === 0) {
      return new Map();
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        mobile: true,
        profile: { select: { firstName: true, lastName: true } },
      },
    });

    const actors = new Map<string, AuditActor>();
    for (const user of users) {
      actors.set(user.id, {
        id: user.id,
        mobile: user.mobile,
        firstName: user.profile?.firstName ?? null,
        lastName: user.profile?.lastName ?? null,
      });
    }
    return actors;
  }

  private toMovementSummary(
    row: MovementSummaryRow,
    actors: Map<string, AuditActor>,
  ): InventoryMovementSummary {
    return {
      id: row.id,
      inventoryItemId: row.inventoryItemId,
      variantId: row.variantId,
      warehouseId: row.warehouseId,
      type: row.type,
      quantity: row.quantity,
      reservedDelta: row.reservedDelta,
      reason: row.reason,
      notes: row.notes,
      onHandBefore: row.onHandBefore,
      onHandAfter: row.onHandAfter,
      reservedBefore: row.reservedBefore,
      reservedAfter: row.reservedAfter,
      actor: row.createdBy ? (actors.get(row.createdBy) ?? null) : null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Mutation internals
  // ---------------------------------------------------------------------------

  /**
   * Verifies the owning product exists, is not soft-deleted, and is not
   * ARCHIVED; the variant exists and is not soft-deleted. Missing/deleted
   * resources are non-disclosure 404s; an archived product is 409.
   */
  private async assertVariantForMutation(
    tx: Prisma.TransactionClient,
    variantId: string,
  ): Promise<void> {
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
    if (!product || product.deletedAt !== null) {
      throw new NotFoundException('محصول یافت نشد.');
    }
    if (product.status === ProductStatus.ARCHIVED) {
      throw new ConflictException(
        'محصول آرشیوشده قابل ویرایش نیست؛ ابتدا وضعیت آن را بازگردانید.',
      );
    }
  }

  /**
   * Verifies the warehouse exists, is not soft-deleted and is ACTIVE.
   * Missing/deleted warehouses are non-disclosure 404s; an INACTIVE warehouse
   * is 409.
   */
  private async assertWarehouseForMutation(
    tx: Prisma.TransactionClient,
    warehouseId: string,
  ): Promise<void> {
    const warehouse = await tx.warehouse.findFirst({
      where: { id: warehouseId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!warehouse) {
      throw new NotFoundException('انبار یافت نشد.');
    }
    if (warehouse.status !== WarehouseStatus.ACTIVE) {
      throw new ConflictException(
        'انبار غیرفعال است و امکان ثبت موجودی ندارد.',
      );
    }
  }

  /**
   * Receive core. Locks the InventoryItem row (SELECT ... FOR UPDATE) so two
   * concurrent receives serialize and each records an exact onHand before/after
   * snapshot; the increment itself is an atomic `increment` so both receives
   * always apply. The first-ever receipt for the pair creates the row (a
   * concurrent create race surfaces P2002 and is retried by
   * `withInventoryRetry`).
   */
  private async applyReceive(
    tx: Prisma.TransactionClient,
    variantId: string,
    warehouseId: string,
    quantity: number,
    actorId: string,
  ): Promise<{
    itemId: string;
    movementType: InventoryMovementType;
    onHandBefore: number;
    onHandAfter: number;
  }> {
    const rows = await tx.$queryRaw<Array<{ id: string; quantityOnHand: number }>>`
      SELECT "id", "quantityOnHand"
      FROM "InventoryItem"
      WHERE "variantId" = ${variantId}
        AND "warehouseId" = ${warehouseId}
      FOR UPDATE
    `;

    if (rows.length === 1) {
      const itemId = rows[0]!.id;
      const before = rows[0]!.quantityOnHand;
      const updated = await tx.inventoryItem.updateMany({
        where: { id: itemId, ...activeInventoryWhere() },
        data: { quantityOnHand: { increment: quantity }, updatedBy: actorId },
      });
      if (updated.count === 0) {
        await this.throwInventoryConflict(tx, variantId, warehouseId);
      }
      return {
        itemId,
        movementType: InventoryMovementType.PURCHASE_RECEIPT,
        onHandBefore: before,
        onHandAfter: before + quantity,
      };
    }

    const created = await tx.inventoryItem.create({
      data: {
        warehouseId,
        variantId,
        quantityOnHand: quantity,
        quantityReserved: 0,
        createdBy: actorId,
      },
      select: { id: true },
    });
    return {
      itemId: created.id,
      movementType: InventoryMovementType.INITIAL_STOCK,
      onHandBefore: 0,
      onHandAfter: quantity,
    };
  }

  /**
   * Absolute-set core shared by SS-113 adjust and the SS-104 compatibility
   * path. Adjust never creates the item (404 when absent); the compatibility
   * path creates it on the default warehouse when absent. The existing-item
   * write is a conditional expected-value update on `quantityOnHand`, so a
   * concurrent absolute set either applies exactly or loses with 409 — one
   * winner, no stale writes. Writes exactly one MANUAL_ADJUSTMENT movement.
   */
  private async applyAbsoluteSet(
    tx: Prisma.TransactionClient,
    params: {
      variantId: string;
      warehouseId: string;
      requested: number;
      reason: string | null;
      notes: string | null;
      actorId: string;
      createIfMissing: boolean;
    },
  ): Promise<{
    itemId: string;
    delta: number;
    onHandBefore: number;
    onHandAfter: number;
  }> {
    const item = await tx.inventoryItem.findFirst({
      where: {
        variantId: params.variantId,
        warehouseId: params.warehouseId,
      },
      select: { id: true, quantityOnHand: true },
    });

    let itemId: string;
    let before: number;
    let delta: number;

    if (!item) {
      if (!params.createIfMissing) {
        throw new NotFoundException('موجودی این واریانت در انبار یافت نشد.');
      }
      const created = await tx.inventoryItem.create({
        data: {
          warehouseId: params.warehouseId,
          variantId: params.variantId,
          quantityOnHand: params.requested,
          quantityReserved: 0,
          createdBy: params.actorId,
        },
        select: { id: true },
      });
      itemId = created.id;
      before = 0;
      delta = params.requested;
    } else {
      itemId = item.id;
      before = item.quantityOnHand;
      delta = params.requested - before;
      const updated = await tx.inventoryItem.updateMany({
        where: {
          id: itemId,
          quantityOnHand: before,
          ...activeInventoryWhere(),
        },
        data: {
          quantityOnHand: params.requested,
          updatedBy: params.actorId,
        },
      });
      if (updated.count === 0) {
        await this.throwInventoryConflict(tx, params.variantId, params.warehouseId);
      }
    }

    await tx.inventoryMovement.create({
      data: {
        inventoryItemId: itemId,
        variantId: params.variantId,
        warehouseId: params.warehouseId,
        type: InventoryMovementType.MANUAL_ADJUSTMENT,
        quantity: delta,
        reservedDelta: 0,
        reason: params.reason,
        notes: params.notes,
        onHandBefore: before,
        onHandAfter: params.requested,
        reservedBefore: 0,
        reservedAfter: 0,
        createdBy: params.actorId,
      },
    });

    return {
      itemId,
      delta,
      onHandBefore: before,
      onHandAfter: params.requested,
    };
  }

  /**
   * Refreshes `ProductVariant.stockQuantity` to the authoritative aggregate of
   * `InventoryItem.quantityOnHand` across active, non-deleted warehouses
   * (shared `aggregateVariantStock` helper — the exact scope SS-112 reads use).
   * The variant row is locked (SELECT ... FOR UPDATE) before the sum is computed
   * so concurrent mutations on different items of the same variant cannot both
   * write a stale aggregate: the last writer always sums committed rows.
   */
  private async refreshVariantStock(
    tx: Prisma.TransactionClient,
    variantId: string,
    actorId: string,
  ): Promise<number> {
    await tx.$queryRaw`
      SELECT "id"
      FROM "ProductVariant"
      WHERE "id" = ${variantId}
      FOR UPDATE
    `;

    const totals = await aggregateVariantStock(tx, [variantId]);
    const total = totals.get(variantId) ?? 0;

    const updated = await tx.productVariant.updateMany({
      where: { id: variantId, deletedAt: null },
      data: { stockQuantity: total, updatedBy: actorId },
    });
    if (updated.count === 0) {
      throw new NotFoundException('واریانت یافت نشد.');
    }

    return total;
  }

  /**
   * Resolve why a conditional inventory update matched nothing after the
   * in-transaction pre-reads already validated the resources. Because the
   * pre-reads ruled out both cases, this only fires on a concurrent
   * interleaving: if a resource is now missing/deleted it returns 404, otherwise
   * the current `quantityOnHand` changed concurrently and it returns 409.
   */
  private async throwInventoryConflict(
    tx: Prisma.TransactionClient,
    variantId: string,
    warehouseId: string,
  ): Promise<never> {
    await this.assertVariantForMutation(tx, variantId);
    await this.assertWarehouseForMutation(tx, warehouseId);
    throw new ConflictException(
      'وضعیت موجودی تغییر کرده است؛ مجدد تلاش کنید.',
    );
  }

  /**
   * Ensures the default warehouse exists (idempotent upsert, mirroring the
   * bootstrap helper). Only used by the SS-104 compatibility path.
   */
  private async ensureDefaultWarehouse(
    tx: Prisma.TransactionClient,
  ): Promise<{ id: string }> {
    return tx.warehouse.upsert({
      where: { code: DEFAULT_WAREHOUSE_CODE },
      update: {},
      create: { code: DEFAULT_WAREHOUSE_CODE, name: DEFAULT_WAREHOUSE_NAME },
      select: { id: true },
    });
  }

  private async readStoredStock(
    tx: Prisma.TransactionClient,
    variantId: string,
  ): Promise<number> {
    const variant = await tx.productVariant.findUnique({
      where: { id: variantId },
      select: { stockQuantity: true },
    });
    return variant?.stockQuantity ?? 0;
  }

  /**
   * Runs a mutation with bounded retries on transient interactive-transaction
   * errors (a blocked transaction timing out under lock contention, per the
   * warehouse lifecycle precedent) and on the InventoryItem unique-constraint
   * race (P2002) so two concurrent first-ever receipts both succeed: the loser
   * rolls back and re-runs against the winner's committed row. Any other error
   * (including the domain 404/409 thrown inside the transaction) is rethrown
   * immediately.
   */
  private async withInventoryRetry<T>(operation: () => Promise<T>): Promise<T> {
    const transientCodes = new Set(['P1001', 'P2028', 'P2034']);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        const isCreateRace =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          error.meta?.modelName === 'InventoryItem';
        const isTransient =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          transientCodes.has(error.code);
        if (isCreateRace || isTransient) {
          continue;
        }
        throw error;
      }
    }

    throw new ConflictException('وضعیت موجودی تغییر کرده است؛ مجدد تلاش کنید.');
  }

  private async readItemSummary(itemId: string): Promise<InventoryItemSummary> {
    const row = await this.prisma.inventoryItem.findUnique({
      where: { id: itemId },
      select: summarySelect,
    });
    if (!row) {
      throw new NotFoundException('موجودی یافت نشد.');
    }
    return this.toSummary(row);
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
