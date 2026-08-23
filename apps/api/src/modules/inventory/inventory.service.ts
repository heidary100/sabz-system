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
  ReservationStatus,
  WarehouseStatus,
} from '@prisma/client';
import type {
  AuditActor,
  InventoryItemSummary,
  InventoryMovementSummary,
  PaginatedResult,
  ReservationSummary,
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
  ListReservationsQueryDto,
  ListWarehouseInventoryQueryDto,
  ReceiveStockDto,
  ReserveInventoryDto,
} from './dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

/**
 * Fixed ledger/audit reason recorded for lazy-expiration transitions. The
 * expiration is triggered by the request that runs it, but the reason marks
 * the row as a system-driven expiry rather than a manual release.
 */
const EXPIRATION_REASON = 'انقضای خودکار رزرو';

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
 * Reservation projection (SS-115). Maps onto the shared `ReservationSummary`
 * contract; the variant/warehouse refs are resolved through the owning
 * InventoryItem relation. Deliberately omits `createdBy`/`updatedBy` so the
 * raw actor ids are structurally unexposable.
 */
const reservationSummarySelect = {
  id: true,
  inventoryItemId: true,
  quantity: true,
  status: true,
  expiresAt: true,
  releasedAt: true,
  consumedAt: true,
  expiredAt: true,
  createdAt: true,
  inventoryItem: {
    select: {
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
    },
  },
} satisfies Prisma.ReservationSelect;

type ReservationSummaryRow = Prisma.ReservationGetPayload<{
  select: typeof reservationSummarySelect;
}>;

/**
 * Admin inventory API. SS-112 owns the read-only inventory queries; SS-113 owns
 * the mutation API (receive + absolute adjust) plus the SS-104 compatibility
 * write path (`setVariantStockCompat`); SS-115 owns the reservation API
 * (reserve, release, consume, list) with lazy transactional expiration. Every
 * mutation is one interactive transaction that writes exactly one
 * InventoryMovement and exactly one AuditLog and refreshes
 * `ProductVariant.stockQuantity` from the authoritative `InventoryItem` rows
 * before committing, so the writes commit or roll back atomically.
 * `InventoryItem` is authoritative; `ProductVariant.stockQuantity` is always a
 * denormalized aggregate (refreshed only when `quantityOnHand` changes).
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
  // SS-115 reservation API
  // ---------------------------------------------------------------------------

  /**
   * Reserve stock against an existing InventoryItem (SS-115). The reservation
   * is created only if `available = quantityOnHand − quantityReserved` covers
   * the requested quantity; the item row is locked (SELECT ... FOR UPDATE) so
   * concurrent reservations serialize and each re-reads the committed reserved
   * value before the availability check — overselling is impossible. Expired
   * ACTIVE reservations are lazily transitioned first so their units re-enter
   * availability. Writes exactly one RESERVATION movement and one
   * INVENTORY_RESERVED audit; `quantityOnHand` and the variant aggregate are
   * untouched (reservation-only change).
   */
  async reserve(
    dto: ReserveInventoryDto,
    actorId: string,
    ipAddress?: string,
  ): Promise<ReservationSummary> {
    await this.runLazyExpiration(actorId);

    const reservationId = await this.withInventoryRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const now = new Date();

        await this.assertVariantForMutation(tx, dto.variantId);
        await this.assertWarehouseForMutation(tx, dto.warehouseId);

        const rows = await tx.$queryRaw<
          Array<{
            id: string;
            variantId: string;
            warehouseId: string;
            quantityOnHand: number;
            quantityReserved: number;
          }>
        >`
          SELECT "id", "variantId", "warehouseId", "quantityOnHand", "quantityReserved"
          FROM "InventoryItem"
          WHERE "variantId" = ${dto.variantId}
            AND "warehouseId" = ${dto.warehouseId}
          FOR UPDATE
        `;

        if (rows.length !== 1) {
          throw new NotFoundException('موجودی این واریانت در انبار یافت نشد.');
        }
        const item = rows[0]!;

        if (item.quantityOnHand - item.quantityReserved < dto.quantity) {
          throw new ConflictException('موجودی کافی برای رزرو در دسترس نیست.');
        }

        const updated = await tx.inventoryItem.updateMany({
          where: { id: item.id, ...activeInventoryWhere() },
          data: {
            quantityReserved: { increment: dto.quantity },
            updatedBy: actorId,
          },
        });
        if (updated.count === 0) {
          await this.throwInventoryConflict(tx, dto.variantId, dto.warehouseId);
        }

        const expiresAt =
          dto.expiresIn !== undefined
            ? new Date(now.getTime() + dto.expiresIn * 1000)
            : null;

        const reservation = await tx.reservation.create({
          data: {
            inventoryItemId: item.id,
            quantity: dto.quantity,
            status: ReservationStatus.ACTIVE,
            expiresAt,
            createdBy: actorId,
          },
          select: { id: true },
        });

        await this.writeReservationMovement(tx, {
          inventoryItemId: item.id,
          variantId: item.variantId,
          warehouseId: item.warehouseId,
          type: InventoryMovementType.RESERVATION,
          quantity: 0,
          reservedDelta: dto.quantity,
          onHandBefore: item.quantityOnHand,
          onHandAfter: item.quantityOnHand,
          reservedBefore: item.quantityReserved,
          reservedAfter: item.quantityReserved + dto.quantity,
          reason: null,
          createdBy: actorId,
        });

        await this.auditReservationMutation(tx, {
          reservationId: reservation.id,
          action: 'INVENTORY_RESERVED',
          variantId: item.variantId,
          warehouseId: item.warehouseId,
          quantity: dto.quantity,
          onHandBefore: item.quantityOnHand,
          onHandAfter: item.quantityOnHand,
          reservedBefore: item.quantityReserved,
          reservedAfter: item.quantityReserved + dto.quantity,
          expiresAt,
          reason: null,
          actorId,
          ipAddress,
        });

        return reservation.id;
      }),
    );

    return this.readReservationSummary(reservationId);
  }

  /**
   * Release an ACTIVE reservation (SS-115). The transition is a conditional
   * `updateMany` on `id + status = ACTIVE` (the database is the state-gate
   * arbiter): a concurrent release/consume/expiration wins and this requester
   * receives 409. `quantityReserved` is decremented, `quantityOnHand` is
   * untouched and the variant aggregate is not refreshed. Writes exactly one
   * RESERVATION_RELEASE movement and one INVENTORY_RELEASED audit. The owning
   * product/variant/warehouse lifecycle is deliberately NOT re-validated so
   * reserved stock can always be unwound.
   */
  async releaseReservation(
    id: string,
    actorId: string,
    ipAddress?: string,
  ): Promise<ReservationSummary> {
    await this.runLazyExpiration(actorId);

    await this.withInventoryRetry(() =>
      this.prisma.$transaction(async (tx) => {
        await this.applyTerminalTransition(tx, {
          reservationId: id,
          consume: false,
          now: new Date(),
          actorId,
          ipAddress,
        });
      }),
    );

    return this.readReservationSummary(id);
  }

  /**
   * Consume an ACTIVE reservation (SS-115). Transitions ACTIVE → CONSUMED
   * (conditional state gate, single winner), decrements both
   * `quantityReserved` and `quantityOnHand`, writes exactly one SALE movement
   * and one INVENTORY_CONSUMED audit, and refreshes
   * `ProductVariant.stockQuantity` in the same transaction. `quantityOnHand`
   * is re-checked under the item lock so stock can never go negative.
   */
  async consumeReservation(
    id: string,
    actorId: string,
    ipAddress?: string,
  ): Promise<ReservationSummary> {
    await this.runLazyExpiration(actorId);

    await this.withInventoryRetry(() =>
      this.prisma.$transaction(async (tx) => {
        await this.applyTerminalTransition(tx, {
          reservationId: id,
          consume: true,
          now: new Date(),
          actorId,
          ipAddress,
        });
      }),
    );

    return this.readReservationSummary(id);
  }

  /**
   * Read-only paginated reservation view (SS-115). Filters are predicates and
   * combine with AND: a valid but nonexistent `variantId`/`warehouseId`
   * returns an empty page (never 404); `variantId`/`warehouseId` filter
   * through the owning InventoryItem relation. Ordering is deterministic:
   * `createdAt DESC`, then `id DESC`. This path is strictly read-only: it
   * never triggers lazy expiration and never writes.
   */
  async listReservations(
    query: ListReservationsQueryDto,
  ): Promise<PaginatedResult<ReservationSummary>> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const skip = (page - 1) * limit;

    const where: Prisma.ReservationWhereInput = {
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.variantId !== undefined || query.warehouseId !== undefined
        ? {
            inventoryItem: {
              is: {
                ...(query.variantId !== undefined
                  ? { variantId: query.variantId }
                  : {}),
                ...(query.warehouseId !== undefined
                  ? { warehouseId: query.warehouseId }
                  : {}),
              },
            },
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.reservation.count({ where }),
      this.prisma.reservation.findMany({
        where,
        select: reservationSummarySelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
      }),
    ]);

    return {
      items: rows.map((row) => this.toReservationSummary(row)),
      total,
      page,
      limit,
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

  // ---------------------------------------------------------------------------
  // SS-115 reservation internals
  // ---------------------------------------------------------------------------

  /**
   * Commits lazy expiration in its own bounded-retry transaction, called at
   * the start of every reservation mutation (reserve/release/consume). Running
   * the expiration as an independently committed transaction (instead of
   * inside the mutation transaction) guarantees the EXPIRED transitions
   * persist even when the triggering mutation itself fails with a domain error
   * (for example a 409 state-gate loss on the release of an already-expired
   * reservation), so expired ACTIVE reservations always become EXPIRED and
   * stop reducing availability once any reservation mutation is attempted.
   */
  private async runLazyExpiration(actorId: string): Promise<void> {
    await this.withInventoryRetry(() =>
      this.prisma.$transaction(async (tx) => {
        await this.expireReservationsInTransaction(tx, new Date(), actorId);
      }),
    );
  }

  /**
   * Lazy expiration core (SS-115), invoked through `runLazyExpiration` in its
   * own committed transaction. Finds ACTIVE reservations whose `expiresAt` has
   * passed (served by the `(status, expiresAt)` index; `expiresAt = null` rows
   * never match), groups them by owning item, locks each item row
   * (SELECT ... FOR UPDATE) so concurrent expirations serialize with exact
   * snapshots, and transitions each reservation with a conditional
   * `updateMany` on `id + status = ACTIVE`. Only the winner (count 1)
   * decrements `quantityReserved`, writes exactly one RESERVATION_RELEASE
   * movement and one INVENTORY_RELEASED audit; losers (count 0 — a concurrent
   * release/consume/expiration already won) do nothing, so there is never a
   * double-release, duplicate movement or duplicate audit. `quantityOnHand`
   * is untouched and the variant aggregate is not refreshed.
   */
  private async expireReservationsInTransaction(
    tx: Prisma.TransactionClient,
    now: Date,
    actorId: string,
  ): Promise<void> {
    const expired = await tx.reservation.findMany({
      where: {
        status: ReservationStatus.ACTIVE,
        expiresAt: { lte: now },
      },
      select: { id: true, inventoryItemId: true, quantity: true },
      orderBy: [{ id: 'asc' }],
    });
    if (expired.length === 0) {
      return;
    }

    const byItem = new Map<string, typeof expired>();
    for (const reservation of expired) {
      const group = byItem.get(reservation.inventoryItemId);
      if (group) {
        group.push(reservation);
      } else {
        byItem.set(reservation.inventoryItemId, [reservation]);
      }
    }

    for (const [itemId, reservations] of byItem) {
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          variantId: string;
          warehouseId: string;
          quantityOnHand: number;
          quantityReserved: number;
        }>
      >`
        SELECT "id", "variantId", "warehouseId", "quantityOnHand", "quantityReserved"
        FROM "InventoryItem"
        WHERE "id" = ${itemId}
        FOR UPDATE
      `;
      if (rows.length !== 1) {
        continue;
      }
      const item = rows[0]!;
      let reserved = item.quantityReserved;

      for (const reservation of reservations) {
        const updated = await tx.reservation.updateMany({
          where: { id: reservation.id, status: ReservationStatus.ACTIVE },
          data: {
            status: ReservationStatus.EXPIRED,
            expiredAt: now,
            updatedBy: actorId,
          },
        });
        if (updated.count !== 1) {
          continue;
        }

        const reservedBefore = reserved;
        reserved -= reservation.quantity;

        await tx.inventoryItem.updateMany({
          where: { id: item.id },
          data: {
            quantityReserved: { increment: -reservation.quantity },
            updatedBy: actorId,
          },
        });

        await this.writeReservationMovement(tx, {
          inventoryItemId: item.id,
          variantId: item.variantId,
          warehouseId: item.warehouseId,
          type: InventoryMovementType.RESERVATION_RELEASE,
          quantity: 0,
          reservedDelta: -reservation.quantity,
          onHandBefore: item.quantityOnHand,
          onHandAfter: item.quantityOnHand,
          reservedBefore,
          reservedAfter: reserved,
          reason: EXPIRATION_REASON,
          createdBy: actorId,
        });

        await this.auditReservationMutation(tx, {
          reservationId: reservation.id,
          action: 'INVENTORY_RELEASED',
          variantId: item.variantId,
          warehouseId: item.warehouseId,
          quantity: reservation.quantity,
          onHandBefore: item.quantityOnHand,
          onHandAfter: item.quantityOnHand,
          reservedBefore,
          reservedAfter: reserved,
          reason: EXPIRATION_REASON,
          actorId,
        });
      }
    }
  }

  /**
   * Resolves the reservation targeted by release/consume. Missing rows are
   * non-disclosure 404s; a reservation that is not ACTIVE (already released,
   * consumed or expired) is 409 — the state gate is the source of truth.
   */
  private async assertReservationForTransition(
    tx: Prisma.TransactionClient,
    reservationId: string,
  ): Promise<{
    id: string;
    inventoryItemId: string;
    quantity: number;
    status: ReservationStatus;
  }> {
    const reservation = await tx.reservation.findFirst({
      where: { id: reservationId },
      select: { id: true, inventoryItemId: true, quantity: true, status: true },
    });
    if (!reservation) {
      throw new NotFoundException('رزرو یافت نشد.');
    }
    if (reservation.status !== ReservationStatus.ACTIVE) {
      throw new ConflictException('وضعیت رزرو برای این عملیات معتبر نیست.');
    }
    return reservation;
  }

  /**
   * Shared release/consume core (SS-115). The item row is locked before the
   * on-hand check (consume) and the conditional ACTIVE transition, so a
   * concurrent transition on the same reservation resolves to exactly one
   * winner and consume can never drive stock negative. Consume decrements
   * `quantityOnHand` and refreshes the variant aggregate in the same
   * transaction; release touches only `quantityReserved`.
   */
  private async applyTerminalTransition(
    tx: Prisma.TransactionClient,
    params: {
      reservationId: string;
      consume: boolean;
      now: Date;
      actorId: string;
      ipAddress?: string;
    },
  ): Promise<void> {
    const reservation = await this.assertReservationForTransition(
      tx,
      params.reservationId,
    );

    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        variantId: string;
        warehouseId: string;
        quantityOnHand: number;
        quantityReserved: number;
      }>
    >`
      SELECT "id", "variantId", "warehouseId", "quantityOnHand", "quantityReserved"
      FROM "InventoryItem"
      WHERE "id" = ${reservation.inventoryItemId}
      FOR UPDATE
    `;
    if (rows.length !== 1) {
      throw new NotFoundException('موجودی یافت نشد.');
    }
    const item = rows[0]!;

    if (params.consume && item.quantityOnHand < reservation.quantity) {
      throw new ConflictException('موجودی انبار برای مصرف رزرو کافی نیست.');
    }

    const updated = await tx.reservation.updateMany({
      where: { id: reservation.id, status: ReservationStatus.ACTIVE },
      data: params.consume
        ? {
            status: ReservationStatus.CONSUMED,
            consumedAt: params.now,
            updatedBy: params.actorId,
          }
        : {
            status: ReservationStatus.RELEASED,
            releasedAt: params.now,
            updatedBy: params.actorId,
          },
    });
    if (updated.count !== 1) {
      throw new ConflictException(
        'وضعیت رزرو تغییر کرده است؛ مجدد تلاش کنید.',
      );
    }

    const onHandAfter = params.consume
      ? item.quantityOnHand - reservation.quantity
      : item.quantityOnHand;
    const reservedAfter = item.quantityReserved - reservation.quantity;

    await tx.inventoryItem.updateMany({
      where: { id: item.id },
      data: {
        quantityReserved: { increment: -reservation.quantity },
        ...(params.consume
          ? { quantityOnHand: { increment: -reservation.quantity } }
          : {}),
        updatedBy: params.actorId,
      },
    });

    await this.writeReservationMovement(tx, {
      inventoryItemId: item.id,
      variantId: item.variantId,
      warehouseId: item.warehouseId,
      type: params.consume
        ? InventoryMovementType.SALE
        : InventoryMovementType.RESERVATION_RELEASE,
      quantity: params.consume ? -reservation.quantity : 0,
      reservedDelta: -reservation.quantity,
      onHandBefore: item.quantityOnHand,
      onHandAfter,
      reservedBefore: item.quantityReserved,
      reservedAfter,
      reason: null,
      createdBy: params.actorId,
    });

    await this.auditReservationMutation(tx, {
      reservationId: reservation.id,
      action: params.consume ? 'INVENTORY_CONSUMED' : 'INVENTORY_RELEASED',
      variantId: item.variantId,
      warehouseId: item.warehouseId,
      quantity: reservation.quantity,
      onHandBefore: item.quantityOnHand,
      onHandAfter,
      reservedBefore: item.quantityReserved,
      reservedAfter,
      actorId: params.actorId,
      ipAddress: params.ipAddress,
    });

    if (params.consume) {
      await this.refreshVariantStock(tx, item.variantId, params.actorId);
    }
  }

  /**
   * Thin movement writer shared by all four reservation mutations. `reference`
   * is never written (and the projection never selects it), so the ledger
   * reference column stays structurally unexposable.
   */
  private async writeReservationMovement(
    tx: Prisma.TransactionClient,
    params: {
      inventoryItemId: string;
      variantId: string;
      warehouseId: string;
      type: InventoryMovementType;
      quantity: number;
      reservedDelta: number;
      onHandBefore: number;
      onHandAfter: number;
      reservedBefore: number;
      reservedAfter: number;
      reason: string | null;
      createdBy: string;
    },
  ): Promise<void> {
    await tx.inventoryMovement.create({
      data: {
        inventoryItemId: params.inventoryItemId,
        variantId: params.variantId,
        warehouseId: params.warehouseId,
        type: params.type,
        quantity: params.quantity,
        reservedDelta: params.reservedDelta,
        reason: params.reason,
        notes: null,
        onHandBefore: params.onHandBefore,
        onHandAfter: params.onHandAfter,
        reservedBefore: params.reservedBefore,
        reservedAfter: params.reservedAfter,
        createdBy: params.createdBy,
      },
    });
  }

  /**
   * Transactional audit writer for reservation mutations. `entity` is
   * "Reservation" and `entityId` is the reservation id, so the full lifecycle
   * of one reservation (reserve → release/consume/expire) is traceable by
   * entityId. Payloads carry only safe business deltas: ids, quantities and
   * exact before/after snapshots, plus `expiresAt` (reserve) and `reason`
   * (expiration) where applicable.
   */
  private async auditReservationMutation(
    tx: Prisma.TransactionClient,
    params: {
      reservationId: string;
      action: string;
      variantId: string;
      warehouseId: string;
      quantity: number;
      onHandBefore: number;
      onHandAfter: number;
      reservedBefore: number;
      reservedAfter: number;
      expiresAt?: Date | null;
      reason?: string | null;
      actorId: string;
      ipAddress?: string;
    },
  ): Promise<void> {
    const after: Prisma.InputJsonValue = {
      variantId: params.variantId,
      warehouseId: params.warehouseId,
      quantity: params.quantity,
      onHandBefore: params.onHandBefore,
      onHandAfter: params.onHandAfter,
      reservedBefore: params.reservedBefore,
      reservedAfter: params.reservedAfter,
      ...(params.expiresAt !== undefined
        ? {
            expiresAt: params.expiresAt
              ? params.expiresAt.toISOString()
              : null,
          }
        : {}),
      ...(params.reason !== undefined && params.reason !== null
        ? { reason: params.reason }
        : {}),
    };

    await this.auditService.log(
      {
        userId: params.actorId,
        action: params.action,
        entity: 'Reservation',
        entityId: params.reservationId,
        before: null,
        after,
        ipAddress: params.ipAddress,
      },
      tx,
    );
  }

  private async readReservationSummary(
    reservationId: string,
  ): Promise<ReservationSummary> {
    const row = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      select: reservationSummarySelect,
    });
    if (!row) {
      throw new NotFoundException('رزرو یافت نشد.');
    }
    return this.toReservationSummary(row);
  }

  private toReservationSummary(row: ReservationSummaryRow): ReservationSummary {
    return {
      id: row.id,
      inventoryItemId: row.inventoryItemId,
      quantity: row.quantity,
      status: row.status,
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
      releasedAt: row.releasedAt ? row.releasedAt.toISOString() : null,
      consumedAt: row.consumedAt ? row.consumedAt.toISOString() : null,
      expiredAt: row.expiredAt ? row.expiredAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      variant: {
        id: row.inventoryItem.variant.id,
        sku: row.inventoryItem.variant.sku,
        name: row.inventoryItem.variant.name,
      },
      warehouse: {
        id: row.inventoryItem.warehouse.id,
        code: row.inventoryItem.warehouse.code,
        name: row.inventoryItem.warehouse.name,
        status: row.inventoryItem.warehouse.status,
      },
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
