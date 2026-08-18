import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import type {
  AdminUserDetail,
  AdminUserSummary,
  PaginatedResult,
} from '@sabz/types';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppRole } from '../auth/enums/app-role.enum';
import { ListUsersQueryDto, SuspendUserDto } from './dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

function escapeLike(search: string): string {
  return search.replace(/[\\%_]/g, '\\$&');
}

const listSelect = {
  id: true,
  mobile: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  profile: {
    select: {
      firstName: true,
      lastName: true,
      partner: {
        where: { deletedAt: null },
        select: {
          id: true,
          businessName: true,
          approvalStatus: true,
        },
      },
    },
  },
  roles: {
    select: { role: { select: { name: true } } },
  },
} satisfies Prisma.UserSelect;

type ListUserRow = Prisma.UserGetPayload<{ select: typeof listSelect }>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(query: ListUsersQueryDto): Promise<PaginatedResult<AdminUserSummary>> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const skip = (page - 1) * limit;
    const search = query.search?.trim();

    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.role !== undefined
        ? { roles: { some: { role: { name: query.role } } } }
        : {}),
      ...(search
        ? {
            OR: [
              {
                mobile: {
                  contains: escapeLike(search),
                  mode: 'insensitive',
                },
              },
              {
                profile: {
                  firstName: {
                    contains: escapeLike(search),
                    mode: 'insensitive',
                  },
                },
              },
              {
                profile: {
                  lastName: {
                    contains: escapeLike(search),
                    mode: 'insensitive',
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: listSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
      }),
    ]);

    return {
      items: users.map((user) => this.toSummary(user)),
      total,
      page,
      limit,
    };
  }

  async getDetail(userId: string): Promise<AdminUserDetail> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        mobile: true,
        email: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
        profile: {
          select: {
            firstName: true,
            lastName: true,
            partner: {
              where: { deletedAt: null },
              select: {
                id: true,
                businessName: true,
                approvalStatus: true,
              },
            },
          },
        },
        roles: {
          select: {
            role: { select: { name: true } },
            assignedAt: true,
          },
          orderBy: { assignedAt: 'asc' },
        },
      },
    });

    if (!user || user.deletedAt !== null) {
      throw new NotFoundException('کاربر یافت نشد.');
    }

    return {
      id: user.id,
      mobile: user.mobile,
      email: user.email,
      status: user.status,
      profile: user.profile
        ? {
            firstName: user.profile.firstName,
            lastName: user.profile.lastName,
          }
        : null,
      roles: user.roles.map(({ role, assignedAt }) => ({
        name: role.name as AppRole,
        assignedAt: assignedAt.toISOString(),
      })),
      partner: user.profile?.partner
        ? {
            id: user.profile.partner.id,
            businessName: user.profile.partner.businessName,
            approvalStatus: user.profile.partner.approvalStatus,
          }
        : null,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  private toSummary(user: ListUserRow): AdminUserSummary {
    return {
      id: user.id,
      mobile: user.mobile,
      status: user.status,
      profile: user.profile
        ? {
            firstName: user.profile.firstName,
            lastName: user.profile.lastName,
          }
        : null,
      roles: user.roles.map(({ role }) => role.name as AppRole),
      partner: user.profile?.partner
        ? {
            id: user.profile.partner.id,
            businessName: user.profile.partner.businessName,
            approvalStatus: user.profile.partner.approvalStatus,
          }
        : null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  /**
   * Suspends an ACTIVE account: ACTIVE → SUSPENDED. All non-revoked sessions
   * are revoked and the USER_SUSPENDED audit event is written in the same
   * transaction as the status mutation.
   *
   * Guards (all enforced inside the transaction):
   * - missing / soft-deleted target → 404
   * - self-suspension → 409
   * - OPERATOR acting on an ADMIN-role target → 403
   * - target not ACTIVE → 409
   * - target is the last active ADMIN → 409
   *
   * Race safety: the conditional updateMany (status = ACTIVE, deletedAt =
   * null) is the state gate; a concurrent lifecycle mutation leaves the loser
   * with count 0 → 409. For ADMIN targets the active-ADMIN rows are locked
   * (SELECT ... FOR UPDATE) so two concurrent suspensions of different ADMINS
   * cannot both commit and leave the system with zero active ADMINS.
   */
  async suspendUser(
    targetId: string,
    actorId: string,
    dto: SuspendUserDto,
    ipAddress?: string,
  ): Promise<AdminUserDetail> {
    await this.prisma.$transaction(async (tx) => {
      const target = await this.readLifecycleTarget(tx, targetId);
      if (!target || target.deletedAt !== null) {
        throw new NotFoundException('کاربر یافت نشد.');
      }

      if (target.id === actorId) {
        throw new ConflictException('امکان تعلیق حساب خودتان وجود ندارد.');
      }

      const targetRoles = this.roleNames(target);
      if (targetRoles.includes(AppRole.ADMIN)) {
        await this.assertActorIsAdmin(tx, actorId);
      }

      if (target.status !== UserStatus.ACTIVE) {
        throw new ConflictException('وضعیت حساب تغییر کرده است؛ مجدد تلاش کنید.');
      }

      if (targetRoles.includes(AppRole.ADMIN)) {
        await this.assertNotLastActiveAdmin(tx, targetId);
      }

      const updated = await tx.user.updateMany({
        where: { id: targetId, status: UserStatus.ACTIVE, deletedAt: null },
        data: { status: UserStatus.SUSPENDED, updatedBy: actorId },
      });
      if (updated.count === 0) {
        throw new ConflictException('وضعیت حساب تغییر کرده است؛ مجدد تلاش کنید.');
      }

      await tx.userSession.updateMany({
        where: { userId: targetId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await this.auditService.log(
        {
          userId: actorId,
          action: 'USER_SUSPENDED',
          entity: 'User',
          entityId: targetId,
          before: { status: UserStatus.ACTIVE },
          after: {
            status: UserStatus.SUSPENDED,
            ...(dto.reason !== undefined ? { reason: dto.reason } : {}),
          },
          ipAddress,
        },
        tx,
      );
    });

    return this.getDetail(targetId);
  }

  /**
   * Un-suspends a SUSPENDED account: SUSPENDED → ACTIVE. Old sessions are
   * intentionally not restored; the user authenticates again. The
   * USER_UNSUSPENDED audit event is written in the same transaction.
   *
   * Guards (enforced inside the transaction): missing / soft-deleted → 404;
   * OPERATOR acting on an ADMIN-role target → 403; target not SUSPENDED → 409.
   */
  async unsuspendUser(
    targetId: string,
    actorId: string,
    ipAddress?: string,
  ): Promise<AdminUserDetail> {
    await this.prisma.$transaction(async (tx) => {
      const target = await this.readLifecycleTarget(tx, targetId);
      if (!target || target.deletedAt !== null) {
        throw new NotFoundException('کاربر یافت نشد.');
      }

      const targetRoles = this.roleNames(target);
      if (targetRoles.includes(AppRole.ADMIN)) {
        await this.assertActorIsAdmin(tx, actorId);
      }

      if (target.status !== UserStatus.SUSPENDED) {
        throw new ConflictException('وضعیت حساب تغییر کرده است؛ مجدد تلاش کنید.');
      }

      const updated = await tx.user.updateMany({
        where: { id: targetId, status: UserStatus.SUSPENDED, deletedAt: null },
        data: { status: UserStatus.ACTIVE, updatedBy: actorId },
      });
      if (updated.count === 0) {
        throw new ConflictException('وضعیت حساب تغییر کرده است؛ مجدد تلاش کنید.');
      }

      await this.auditService.log(
        {
          userId: actorId,
          action: 'USER_UNSUSPENDED',
          entity: 'User',
          entityId: targetId,
          before: { status: UserStatus.SUSPENDED },
          after: { status: UserStatus.ACTIVE },
          ipAddress,
        },
        tx,
      );
    });

    return this.getDetail(targetId);
  }

  /**
   * Unlocks a LOCKED account: LOCKED → ACTIVE. Sessions remain revoked (they
   * were revoked when the account entered LOCKED and a LOCKED user cannot
   * refresh), so the user authenticates again. The USER_UNLOCKED audit event
   * is written in the same transaction.
   *
   * Guards (enforced inside the transaction): missing / soft-deleted → 404;
   * actor not ADMIN → 403 (in-transaction, matching suspend/unsuspend); target
   * not LOCKED → 409. The route is ADMIN-only at the controller; the service
   * enforces the same restriction so a future caller cannot bypass it.
   */
  async unlockUser(
    targetId: string,
    actorId: string,
    ipAddress?: string,
  ): Promise<AdminUserDetail> {
    await this.prisma.$transaction(async (tx) => {
      const target = await this.readLifecycleTarget(tx, targetId);
      if (!target || target.deletedAt !== null) {
        throw new NotFoundException('کاربر یافت نشد.');
      }

      await this.assertActorIsAdmin(
        tx,
        actorId,
        'فقط مدیران میتوانند حساب را باز کنند.',
      );

      if (target.status !== UserStatus.LOCKED) {
        throw new ConflictException('وضعیت حساب تغییر کرده است؛ مجدد تلاش کنید.');
      }

      const updated = await tx.user.updateMany({
        where: { id: targetId, status: UserStatus.LOCKED, deletedAt: null },
        data: { status: UserStatus.ACTIVE, updatedBy: actorId },
      });
      if (updated.count === 0) {
        throw new ConflictException('وضعیت حساب تغییر کرده است؛ مجدد تلاش کنید.');
      }

      await this.auditService.log(
        {
          userId: actorId,
          action: 'USER_UNLOCKED',
          entity: 'User',
          entityId: targetId,
          before: { status: UserStatus.LOCKED },
          after: { status: UserStatus.ACTIVE },
          ipAddress,
        },
        tx,
      );
    });

    return this.getDetail(targetId);
  }

  private async readLifecycleTarget(
    tx: Prisma.TransactionClient,
    targetId: string,
  ): Promise<LifecycleTargetRow | null> {
    return tx.user.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        status: true,
        deletedAt: true,
        roles: { select: { role: { select: { name: true } } } },
      },
    });
  }

  private roleNames(target: LifecycleTargetRow): AppRole[] {
    return target.roles.map(({ role }) => role.name as AppRole);
  }

  /**
   * OPERATOR-vs-ADMIN restriction: an OPERATOR may not act on an ADMIN-role
   * account. The actor's roles are read from the transaction client (never a
   * pre-transaction snapshot) so a concurrent role change cannot bypass the
   * check. ADMIN actors always pass.
   */
  private async assertActorIsAdmin(
    tx: Prisma.TransactionClient,
    actorId: string,
    message = 'اجازه انجام این عملیات روی حساب مدیر را ندارید.',
  ): Promise<void> {
    const actor = await tx.user.findUnique({
      where: { id: actorId },
      select: {
        roles: { select: { role: { select: { name: true } } } },
      },
    });
    const actorRoles = actor?.roles.map(({ role }) => role.name as AppRole) ?? [];
    if (!actorRoles.includes(AppRole.ADMIN)) {
      throw new ForbiddenException(message);
    }
  }

  /**
   * Last-active-ADMIN invariant: the system must never reach a state with zero
   * active ADMIN users. A plain conditional update only locks the target row,
   * so two concurrent suspensions of two different ADMINS could both commit
   * under READ COMMITTED and zero out the count. Locking the active-ADMIN rows
   * (SELECT ... FOR UPDATE) serializes the two transactions: the loser blocks
   * until the winner commits, then re-reads and sees its target is the last
   * active ADMIN → 409.
   */
  private async assertNotLastActiveAdmin(
    tx: Prisma.TransactionClient,
    targetId: string,
  ): Promise<void> {
    const activeAdmins = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT u."id"
      FROM "User" u
      JOIN "UserRole" ur ON ur."userId" = u."id"
      JOIN "Role" r ON r."id" = ur."roleId"
      WHERE r."name" = 'ADMIN'
        AND u."status" = 'ACTIVE'
        AND u."deletedAt" IS NULL
      FOR UPDATE
    `;

    if (activeAdmins.length === 1 && activeAdmins[0]!.id === targetId) {
      throw new ConflictException(
        'تعلیق آخرین مدیر فعال سامانه ممکن نیست.',
      );
    }
  }
}

interface LifecycleTargetRow {
  id: string;
  status: UserStatus;
  deletedAt: Date | null;
  roles: Array<{ role: { name: string } }>;
}