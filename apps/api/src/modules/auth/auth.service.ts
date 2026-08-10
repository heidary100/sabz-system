import { ForbiddenException, Injectable } from '@nestjs/common';
import { User, UserStatus } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';

export interface AuthStrategy {
  readonly name: string;
  validate(...args: unknown[]): Promise<unknown>;
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async findUserByMobile(mobile: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { mobile },
    });
  }

  async getOrCreateUserByMobile(mobile: string): Promise<User> {
    const existing = await this.findUserByMobile(mobile);
    if (existing) {
      return existing;
    }

    return this.prisma.user.create({
      data: { mobile },
    });
  }

  async markMobileVerified(user: User): Promise<User> {
    if (
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

    return this.prisma.user.update({
      where: { id: user.id },
      data: { status: UserStatus.ACTIVE },
    });
  }
}
