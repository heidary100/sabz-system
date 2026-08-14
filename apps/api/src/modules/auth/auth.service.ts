import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, User, UserStatus } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findUserByMobile(mobile: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { mobile, deletedAt: null },
    });
  }

  async findUserById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id, deletedAt: null },
    });
  }

  async getOrCreateUserByMobile(mobile: string): Promise<User> {
    const existing = await this.findUserByMobile(mobile);
    if (existing) {
      return existing;
    }

    try {
      return await this.prisma.user.create({
        data: { mobile },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.findUserByMobile(mobile);
        if (existing) {
          return existing;
        }
        throw new ForbiddenException(
          'Account is not eligible for mobile verification.',
        );
      }
      throw error;
    }
  }

  async markMobileVerified(user: User, ipAddress?: string): Promise<User> {
    if (
      user.deletedAt !== null ||
      user.status === UserStatus.SUSPENDED ||
      user.status === UserStatus.LOCKED
    ) {
      throw new ForbiddenException(
        'Account is not eligible for mobile verification.',
      );
    }

    if (user.status === UserStatus.ACTIVE) {
      return user;
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id: user.id, deletedAt: null },
          data: { status: UserStatus.ACTIVE },
        });

        await this.auditService.log(
          {
            userId: updated.id,
            action: 'ACCOUNT_ACTIVATED',
            entity: 'User',
            entityId: updated.id,
            before: { status: user.status },
            after: { status: updated.status },
            ipAddress,
          },
          tx,
        );

        return updated;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new ForbiddenException(
          'Account is not eligible for mobile verification.',
        );
      }
      throw error;
    }
  }
}
