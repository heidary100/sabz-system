import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/database/prisma.service';
import { AppRole } from '../enums/app-role.enum';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async findRoleNamesByUserId(userId: string): Promise<AppRole[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        roles: {
          select: {
            role: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    return user?.roles.map(({ role }) => role.name as AppRole) ?? [];
  }

  /**
   * Resolves the Role row id for a known application role. The role name is
   * never supplied by clients; it is derived server-side. Accepts an optional
   * transaction client so role activation can join an interactive transaction.
   */
  async findRoleIdByName(
    name: AppRole,
    tx?: Prisma.TransactionClient,
  ): Promise<string | null> {
    const client = tx ?? this.prisma;
    const role = await client.role.findUnique({
      where: { name },
      select: { id: true },
    });
    return role?.id ?? null;
  }
}
