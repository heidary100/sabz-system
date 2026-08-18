import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AdminUserDetail,
  AdminUserSummary,
  PaginatedResult,
} from '@sabz/types';
import { PrismaService } from '../../common/database/prisma.service';
import { AppRole } from '../auth/enums/app-role.enum';
import { ListUsersQueryDto } from './dto';

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
  constructor(private readonly prisma: PrismaService) {}

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
}