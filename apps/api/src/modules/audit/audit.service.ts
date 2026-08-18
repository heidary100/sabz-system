import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuditActor, AuditEntry, PaginatedResult } from '@sabz/types';
import { PrismaService } from '../../common/database/prisma.service';
import { ListAuditQueryDto } from './dto';

export interface AuditLogEntry {
  userId?: string;
  action: string;
  entity: string;
  entityId?: string;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  ipAddress?: string;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditLogEntry, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    await client.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        before: entry.before === null ? Prisma.DbNull : entry.before,
        after: entry.after === null ? Prisma.DbNull : entry.after,
        ipAddress: entry.ipAddress,
      },
    });
  }

  /**
   * Read-only admin audit query (SS-064). Filters combine with AND and match
   * exact stored values; `from`/`to` bound `createdAt` inclusively (ISO UTC).
   * Ordering is deterministic: `createdAt DESC`, then `id DESC`.
   *
   * The viewer never writes: this method performs no audit and no mutation.
   *
   * Actors are resolved in a second query because AuditLog intentionally has
   * no FK to User. A missing or soft-deleted actor never 404s or drops the
   * row: the raw `userId` is preserved and `actor` is `null` only when the
   * user row is absent. Soft-deleted actors resolve normally so the trusted
   * admin viewer keeps attribution.
   */
  async list(query: ListAuditQueryDto): Promise<PaginatedResult<AuditEntry>> {
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

    const where: Prisma.AuditLogWhereInput = {
      ...(query.actorId !== undefined ? { userId: query.actorId } : {}),
      ...(query.action !== undefined ? { action: query.action } : {}),
      ...(query.entity !== undefined ? { entity: query.entity } : {}),
      ...(query.entityId !== undefined ? { entityId: query.entityId } : {}),
      ...(from !== undefined || to !== undefined
        ? { createdAt: { gte: from, lte: to } }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
      }),
    ]);

    const actors = await this.resolveActors(rows.map((row) => row.userId));

    return {
      items: rows.map((row) => this.toEntry(row, actors)),
      total,
      page,
      limit,
    };
  }

  private async resolveActors(
    userIds: Array<string | null>,
  ): Promise<Map<string, AuditActor>> {
    const ids = [...new Set(userIds.filter((id): id is string => id !== null))];
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

  private toEntry(
    row: AuditLogRow,
    actors: Map<string, AuditActor>,
  ): AuditEntry {
    return {
      id: row.id,
      userId: row.userId,
      actor: row.userId ? (actors.get(row.userId) ?? null) : null,
      action: row.action,
      entity: row.entity,
      entityId: row.entityId,
      before: this.asPayload(row.before),
      after: this.asPayload(row.after),
      ipAddress: row.ipAddress,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /**
   * Payloads are stored as flat objects by every producer; the opaque Json
   * field is surfaced as a safe record (or null). See the shared contract
   * notes in packages/types/src/admin/audit.ts for the write-time policy.
   *
   * Defensive guard: if a future producer ever stores a top-level scalar or
   * array, it is treated as "no structured payload" rather than surfaced
   * under the object-typed contract.
   */
  private asPayload(value: Prisma.JsonValue): Record<string, unknown> | null {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }
}

type AuditLogRow = Prisma.AuditLogGetPayload<Record<string, never>>;
