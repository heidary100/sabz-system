import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
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
}
