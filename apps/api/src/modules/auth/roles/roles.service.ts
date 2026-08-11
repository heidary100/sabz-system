import { Injectable } from '@nestjs/common';
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
}
