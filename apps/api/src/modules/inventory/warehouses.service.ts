import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, WarehouseStatus } from '@prisma/client';
import type {
  PaginatedResult,
  WarehouseDetail,
  WarehouseSummary,
} from '@sabz/types';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateWarehouseDto,
  ListWarehousesQueryDto,
  UpdateWarehouseDto,
} from './dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

function escapeLike(search: string): string {
  return search.replace(/[\\%_]/g, '\\$&');
}

const detailSelect = {
  id: true,
  code: true,
  name: true,
  address: true,
  contactName: true,
  contactPhone: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.WarehouseSelect;

type DetailRow = Prisma.WarehouseGetPayload<{ select: typeof detailSelect }>;

const summarySelect = {
  id: true,
  code: true,
  name: true,
  status: true,
} satisfies Prisma.WarehouseSelect;

@Injectable()
export class WarehousesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(
    query: ListWarehousesQueryDto,
  ): Promise<PaginatedResult<WarehouseSummary>> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const skip = (page - 1) * limit;
    const search = query.search?.trim();

    const where: Prisma.WarehouseWhereInput = {
      deletedAt: null,
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              {
                name: {
                  contains: escapeLike(search),
                  mode: 'insensitive',
                },
              },
              {
                code: {
                  contains: escapeLike(search),
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.warehouse.count({ where }),
      this.prisma.warehouse.findMany({
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

  async getDetail(warehouseId: string): Promise<WarehouseDetail> {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: detailSelect,
    });

    if (!warehouse || warehouse.deletedAt !== null) {
      throw new NotFoundException('انبار یافت نشد.');
    }

    return this.toDetail(warehouse);
  }

  async create(
    dto: CreateWarehouseDto,
    actorId: string,
    ipAddress?: string,
  ): Promise<WarehouseDetail> {
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.warehouse.create({
          data: {
            code: dto.code,
            name: dto.name,
            address: dto.address ?? null,
            contactName: dto.contactName ?? null,
            contactPhone: dto.contactPhone ?? null,
            createdBy: actorId,
          } satisfies Prisma.WarehouseUncheckedCreateInput,
          select: detailSelect,
        });

        await this.auditService.log(
          {
            userId: actorId,
            action: 'WAREHOUSE_CREATED',
            entity: 'Warehouse',
            entityId: row.id,
            before: null,
            after: this.createAfter(row),
            ipAddress,
          },
          tx,
        );

        return row;
      });

      return this.toDetail(created);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('یک انبار با این کد قبلاً وجود دارد.');
      }
      throw error;
    }
  }

  async update(
    warehouseId: string,
    dto: UpdateWarehouseDto,
    actorId: string,
    ipAddress?: string,
  ): Promise<WarehouseDetail> {
    const data = this.buildUpdateData(dto);

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const target = await tx.warehouse.findUnique({
          where: { id: warehouseId },
          select: detailSelect,
        });

        if (!target || target.deletedAt !== null) {
          throw new NotFoundException('انبار یافت نشد.');
        }

        if (Object.keys(data).length === 0) {
          return target;
        }

        const before = this.businessDelta(target, data, 'before');
        const after = this.businessDelta(target, data, 'after');

        if (JSON.stringify(before) === JSON.stringify(after)) {
          return target;
        }

        const updatedRows = await tx.warehouse.updateMany({
          where: { id: warehouseId, deletedAt: null },
          data: {
            ...data,
            updatedBy: actorId,
          } as Prisma.WarehouseUncheckedUpdateManyInput,
        });
        if (updatedRows.count === 0) {
          throw new NotFoundException('انبار یافت نشد.');
        }

        await this.auditService.log(
          {
            userId: actorId,
            action: 'WAREHOUSE_UPDATED',
            entity: 'Warehouse',
            entityId: warehouseId,
            before,
            after,
            ipAddress,
          },
          tx,
        );

        const row = await tx.warehouse.findUnique({
          where: { id: warehouseId },
          select: detailSelect,
        });
        if (!row || row.deletedAt !== null) {
          throw new NotFoundException('انبار یافت نشد.');
        }
        return row;
      });

      return this.toDetail(updated);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('یک انبار با این کد قبلاً وجود دارد.');
      }
      throw error;
    }
  }

  /**
   * Deactivates an ACTIVE warehouse: ACTIVE → INACTIVE.
   *
   * Guards (enforced inside the transaction): missing / soft-deleted target →
   * 404; target not ACTIVE → 409; target is the last active non-deleted
   * warehouse → 409.
   *
   * Race safety: the active-warehouse rows are locked (SELECT ... FOR UPDATE)
   * so two concurrent deactivations of two different warehouses cannot both
   * commit and leave the system with zero active warehouses. The loser blocks
   * until the winner commits, then re-reads the committed active set: if its
   * target is the sole remaining active warehouse it fails with 409; otherwise
   * the conditional updateMany (status = ACTIVE, deletedAt = null) is the
   * final state gate and a loser racing a transition gets count 0 → 409.
   *
   * Transient interactive-transaction errors (a blocked transaction timing
   * out under lock contention) are retried a bounded number of times so the
   * documented 409 contract holds instead of surfacing a 500; a retry re-runs
   * the guards and the conditional transition against the committed state.
   */
  async deactivate(
    warehouseId: string,
    actorId: string,
    ipAddress?: string,
  ): Promise<WarehouseDetail> {
    const row = await this.withTransientRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const target = await tx.warehouse.findUnique({
          where: { id: warehouseId },
          select: detailSelect,
        });
        if (!target || target.deletedAt !== null) {
          throw new NotFoundException('انبار یافت نشد.');
        }

        if (target.status !== WarehouseStatus.ACTIVE) {
          throw new ConflictException('وضعیت انبار تغییر کرده است؛ مجدد تلاش کنید.');
        }

        await this.assertNotLastActiveWarehouse(tx, warehouseId);

        const updated = await tx.warehouse.updateMany({
          where: {
            id: warehouseId,
            status: WarehouseStatus.ACTIVE,
            deletedAt: null,
          },
          data: { status: WarehouseStatus.INACTIVE, updatedBy: actorId },
        });
        if (updated.count === 0) {
          throw new ConflictException('وضعیت انبار تغییر کرده است؛ مجدد تلاش کنید.');
        }

        await this.auditService.log(
          {
            userId: actorId,
            action: 'WAREHOUSE_DEACTIVATED',
            entity: 'Warehouse',
            entityId: warehouseId,
            before: { status: WarehouseStatus.ACTIVE },
            after: { status: WarehouseStatus.INACTIVE },
            ipAddress,
          },
          tx,
        );

        return tx.warehouse.findUnique({
          where: { id: warehouseId },
          select: detailSelect,
        });
      }),
    );

    if (!row || row.deletedAt !== null) {
      throw new NotFoundException('انبار یافت نشد.');
    }
    return this.toDetail(row);
  }

  /**
   * Activates an INACTIVE warehouse: INACTIVE → ACTIVE. Activation can never
   * reduce the active-warehouse count, so no active-set lock is required; the
   * conditional updateMany is the race-safe state gate. Transient
   * interactive-transaction errors are retried like deactivate.
   */
  async activate(
    warehouseId: string,
    actorId: string,
    ipAddress?: string,
  ): Promise<WarehouseDetail> {
    const row = await this.withTransientRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const target = await tx.warehouse.findUnique({
          where: { id: warehouseId },
          select: detailSelect,
        });
        if (!target || target.deletedAt !== null) {
          throw new NotFoundException('انبار یافت نشد.');
        }

        if (target.status !== WarehouseStatus.INACTIVE) {
          throw new ConflictException('وضعیت انبار تغییر کرده است؛ مجدد تلاش کنید.');
        }

        const updated = await tx.warehouse.updateMany({
          where: {
            id: warehouseId,
            status: WarehouseStatus.INACTIVE,
            deletedAt: null,
          },
          data: { status: WarehouseStatus.ACTIVE, updatedBy: actorId },
        });
        if (updated.count === 0) {
          throw new ConflictException('وضعیت انبار تغییر کرده است؛ مجدد تلاش کنید.');
        }

        await this.auditService.log(
          {
            userId: actorId,
            action: 'WAREHOUSE_ACTIVATED',
            entity: 'Warehouse',
            entityId: warehouseId,
            before: { status: WarehouseStatus.INACTIVE },
            after: { status: WarehouseStatus.ACTIVE },
            ipAddress,
          },
          tx,
        );

        return tx.warehouse.findUnique({
          where: { id: warehouseId },
          select: detailSelect,
        });
      }),
    );

    if (!row || row.deletedAt !== null) {
      throw new NotFoundException('انبار یافت نشد.');
    }
    return this.toDetail(row);
  }

  /**
   * Last-active-warehouse invariant: the platform must never reach a state
   * with zero active, non-deleted warehouses. A plain conditional update only
   * locks the target row, so two concurrent deactivations of two different
   * active warehouses could both commit under READ COMMITTED and zero out the
   * count. Locking the active-warehouse rows (SELECT ... FOR UPDATE) serializes
   * the transactions: the loser blocks until the winner commits, then re-reads
   * and sees its target is the last active warehouse → 409.
   */
  private async assertNotLastActiveWarehouse(
    tx: Prisma.TransactionClient,
    warehouseId: string,
  ): Promise<void> {
    const activeWarehouses = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "Warehouse"
      WHERE "status" = 'ACTIVE'
        AND "deletedAt" IS NULL
      FOR UPDATE
    `;

    if (activeWarehouses.length === 1 && activeWarehouses[0]!.id === warehouseId) {
      throw new ConflictException(
        'غیرفعال کردن آخرین انبار فعال سامانه ممکن نیست.',
      );
    }
  }

  private buildUpdateData(dto: UpdateWarehouseDto): WarehouseUpdateData {
    const data: WarehouseUpdateData = {};
    if (dto.code !== undefined) data.code = dto.code;
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.contactName !== undefined) data.contactName = dto.contactName;
    if (dto.contactPhone !== undefined) data.contactPhone = dto.contactPhone;
    return data;
  }

  private businessDelta(
    target: DetailRow,
    data: WarehouseUpdateData,
    side: 'before' | 'after',
  ): Record<string, string | null> {
    const delta: Record<string, string | null> = {};
    const changed = (key: keyof WarehouseUpdateData) => key in data;

    if (changed('code')) {
      delta.code = side === 'before' ? target.code : (data.code as string);
    }
    if (changed('name')) {
      delta.name = side === 'before' ? target.name : (data.name as string);
    }
    if (changed('address')) {
      delta.address = side === 'before' ? target.address : (data.address as string | null);
    }
    if (changed('contactName')) {
      delta.contactName = side === 'before' ? target.contactName : (data.contactName as string | null);
    }
    if (changed('contactPhone')) {
      delta.contactPhone = side === 'before' ? target.contactPhone : (data.contactPhone as string | null);
    }

    return delta;
  }

  private createAfter(row: DetailRow): Record<string, string | null> {
    return {
      code: row.code,
      name: row.name,
      status: row.status,
      ...(row.address !== null ? { address: row.address } : {}),
      ...(row.contactName !== null ? { contactName: row.contactName } : {}),
      ...(row.contactPhone !== null ? { contactPhone: row.contactPhone } : {}),
    };
  }

  private toSummary(row: SummaryRow): WarehouseSummary {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      status: row.status,
    };
  }

  private toDetail(row: DetailRow): WarehouseDetail {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      address: row.address,
      contactName: row.contactName,
      contactPhone: row.contactPhone,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /**
   * Runs a lifecycle mutation with bounded retries on transient
   * interactive-transaction errors. When a transaction blocks on the
   * active-set row lock held by a concurrent deactivation, Prisma may fail to
   * start or continue the transaction (P2028) or detect a deadlock (P2034)
   * before the lock is freed; the loser's transaction rolls back, so retrying
   * re-runs the guards and the conditional transition against the now-committed
   * state and produces the correct 409/404/200 result instead of a 500. Any
   * other error (including the domain 404/409 thrown inside the transaction) is
   * rethrown immediately. After the retries are exhausted the operation is
   * reported as a state conflict.
   */
  private async withTransientRetry<T>(operation: () => Promise<T>): Promise<T> {
    const transientCodes = new Set(['P1001', 'P2028', 'P2034']);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          transientCodes.has(error.code)
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new ConflictException('وضعیت انبار تغییر کرده است؛ مجدد تلاش کنید.');
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      error.meta?.modelName === 'Warehouse'
    );
  }
}

type SummaryRow = Prisma.WarehouseGetPayload<{ select: typeof summarySelect }>;

interface WarehouseUpdateData {
  code?: string;
  name?: string;
  address?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
}