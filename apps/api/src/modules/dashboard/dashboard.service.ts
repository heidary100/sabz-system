import { Injectable } from '@nestjs/common';
import { PartnerApprovalStatus, Prisma, UserStatus } from '@prisma/client';
import type {
  AdminPartnerListItem,
  AuditActor,
  DashboardPartnerCounts,
  DashboardRecentAudit,
  DashboardRoleCounts,
  DashboardSummary,
  DashboardUserCounts,
} from '@sabz/types';
import { PrismaService } from '../../common/database/prisma.service';
import { AppRole } from '../auth/enums/app-role.enum';

const RECENT_PARTNERS_LIMIT = 5;
const RECENT_AUDIT_LIMIT = 8;

const ROLE_BUCKETS = [
  AppRole.CUSTOMER,
  AppRole.PARTNER,
  AppRole.OPERATOR,
  AppRole.ADMIN,
] as const;

const recentPartnerSelect = {
  id: true,
  businessName: true,
  approvalStatus: true,
  city: true,
  province: true,
  submittedAt: true,
  createdAt: true,
} satisfies Prisma.PartnerSelect;

type RecentPartnerRow = Prisma.PartnerGetPayload<{
  select: typeof recentPartnerSelect;
}>;

const recentAuditSelect = {
  id: true,
  userId: true,
  action: true,
  entity: true,
  entityId: true,
  createdAt: true,
} satisfies Prisma.AuditLogSelect;

type RecentAuditRow = Prisma.AuditLogGetPayload<{
  select: typeof recentAuditSelect;
}>;

/**
 * Read-only operational dashboard snapshot (SS-065). Aggregates existing
 * domains (users, roles, partners, audit) with bounded Prisma queries and
 * exposes compact metrics only; this is deliberately not an analytics
 * subsystem.
 *
 * The aggregate reads run inside a single array-form `$transaction`: the
 * statements execute sequentially on one connection, which is a coherent
 * enough snapshot for an operational dashboard under READ COMMITTED. A
 * concurrent commit landing between two statements can make blocks slightly
 * non-coherent; SERIALIZABLE isolation is intentionally not used.
 *
 * The endpoint performs no mutations and writes no audit events.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(): Promise<DashboardSummary> {
    const [userGroups, roleRows, partnerGroups, recentPartners, recentAudits] =
      await this.prisma.$transaction([
        this.prisma.user.groupBy({
          by: ['status'],
          where: { deletedAt: null },
          orderBy: { status: 'asc' },
          _count: { _all: true },
        }),
        this.prisma.role.findMany({
          where: { name: { in: [...ROLE_BUCKETS] } },
          select: {
            name: true,
            _count: {
              select: {
                users: { where: { user: { deletedAt: null } } },
              },
            },
          },
        }),
        this.prisma.partner.groupBy({
          by: ['approvalStatus'],
          where: { deletedAt: null },
          orderBy: { approvalStatus: 'asc' },
          _count: { _all: true },
        }),
        this.prisma.partner.findMany({
          where: { deletedAt: null },
          select: recentPartnerSelect,
          orderBy: [
            { submittedAt: { sort: 'desc', nulls: 'last' } },
            { id: 'desc' },
          ],
          take: RECENT_PARTNERS_LIMIT,
        }),
        this.prisma.auditLog.findMany({
          select: recentAuditSelect,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: RECENT_AUDIT_LIMIT,
        }),
      ]);

    const actors = await this.resolveActors(
      recentAudits.map((row) => row.userId),
    );

    return {
      users: this.toUserCounts(userGroups),
      roles: this.toRoleCounts(roleRows),
      partners: this.toPartnerCounts(partnerGroups),
      recentPartners: recentPartners.map((partner) =>
        this.toRecentPartner(partner),
      ),
      recentAudit: recentAudits.map((row) => this.toRecentAudit(row, actors)),
    };
  }

  /**
   * Actor resolution matches the SS-064 policy: soft-deleted actors resolve
   * normally so attribution is retained, and a missing actor row yields
   * `actor: null` while the raw `userId` is preserved.
   */
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

  /**
   * User statuses are mutually exclusive enum values, so the four buckets sum
   * to `total` (the count of all non-deleted users). `total` is derived from
   * the four exposed buckets rather than summed over every `groupBy` row, so
   * the documented `active + suspended + locked + pendingOtp === total`
   * invariant holds even if the `UserStatus` enum later grows.
   *
   * `_count` is typed loosely because Prisma's heterogeneous `$transaction`
   * tuple widens the `groupBy` output type; the runtime value is always the
   * `{ _all: number }` object requested by the query.
   */
  private toUserCounts(
    rows: Array<{ status: UserStatus; _count: unknown }>,
  ): DashboardUserCounts {
    const counts: DashboardUserCounts = {
      total: 0,
      active: 0,
      suspended: 0,
      locked: 0,
      pendingOtp: 0,
    };
    for (const row of rows) {
      const value = this.countOf(row._count, '_all');
      switch (row.status) {
        case UserStatus.ACTIVE:
          counts.active += value;
          break;
        case UserStatus.SUSPENDED:
          counts.suspended += value;
          break;
        case UserStatus.LOCKED:
          counts.locked += value;
          break;
        case UserStatus.PENDING_OTP:
          counts.pendingOtp += value;
          break;
      }
    }
    counts.total =
      counts.active + counts.suspended + counts.locked + counts.pendingOtp;
    return counts;
  }

  /**
   * Each bucket counts the non-deleted users holding that role, regardless of
   * account status. A user is counted once per role they hold (a user with
   * multiple roles appears in each bucket).
   */
  private toRoleCounts(
    rows: Array<{ name: string; _count: unknown }>,
  ): DashboardRoleCounts {
    const counts: DashboardRoleCounts = {
      customer: 0,
      partner: 0,
      operator: 0,
      admin: 0,
    };
    for (const row of rows) {
      const users = this.countOf(row._count, 'users');
      switch (row.name) {
        case AppRole.CUSTOMER:
          counts.customer += users;
          break;
        case AppRole.PARTNER:
          counts.partner += users;
          break;
        case AppRole.OPERATOR:
          counts.operator += users;
          break;
        case AppRole.ADMIN:
          counts.admin += users;
          break;
      }
    }
    return counts;
  }

  /**
   * Partner lifecycle states are mutually exclusive; the four buckets sum to
   * the count of all non-deleted partners.
   */
  private toPartnerCounts(
    rows: Array<{ approvalStatus: PartnerApprovalStatus; _count: unknown }>,
  ): DashboardPartnerCounts {
    const counts: DashboardPartnerCounts = {
      draft: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
    };
    for (const row of rows) {
      const value = this.countOf(row._count, '_all');
      switch (row.approvalStatus) {
        case PartnerApprovalStatus.DRAFT:
          counts.draft += value;
          break;
        case PartnerApprovalStatus.PENDING:
          counts.pending += value;
          break;
        case PartnerApprovalStatus.APPROVED:
          counts.approved += value;
          break;
        case PartnerApprovalStatus.REJECTED:
          counts.rejected += value;
          break;
      }
    }
    return counts;
  }

  /**
   * Reads a numeric aggregation from a `groupBy` `_count`/relation-count
   * holder, defaulting to 0 when the value is absent. Mirrors the defensive
   * payload handling in AuditService: a malformed value degrades to a safe
   * zero instead of breaking the summary.
   */
  private countOf(holder: unknown, key: string): number {
    if (holder === null || typeof holder !== 'object' || Array.isArray(holder)) {
      return 0;
    }
    const value = (holder as Record<string, unknown>)[key];
    return typeof value === 'number' ? value : 0;
  }

  private toRecentPartner(partner: RecentPartnerRow): AdminPartnerListItem {
    return {
      id: partner.id,
      businessName: partner.businessName,
      approvalStatus: partner.approvalStatus,
      city: partner.city,
      province: partner.province,
      submittedAt: partner.submittedAt?.toISOString() ?? null,
      createdAt: partner.createdAt.toISOString(),
    };
  }

  private toRecentAudit(
    row: RecentAuditRow,
    actors: Map<string, AuditActor>,
  ): DashboardRecentAudit {
    return {
      id: row.id,
      userId: row.userId,
      actor: row.userId ? (actors.get(row.userId) ?? null) : null,
      action: row.action,
      entity: row.entity,
      entityId: row.entityId,
      createdAt: row.createdAt.toISOString(),
    };
  }
}