import { Injectable, NotFoundException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../../../common/database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AppRole } from '../enums/app-role.enum';
import { RolesService } from '../roles/roles.service';
import { UpdateProfileDto } from '../dto/update-profile.dto';

export interface ProfileResponse {
  id: string;
  mobile: string;
  email: string | null;
  status: UserStatus;
  firstName: string | null;
  lastName: string | null;
  address: string | null;
  avatarUrl: string | null;
  roles: AppRole[];
}

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly rolesService: RolesService,
  ) {}

  async getProfile(userId: string): Promise<ProfileResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        mobile: true,
        email: true,
        status: true,
        profile: {
          select: {
            firstName: true,
            lastName: true,
            address: true,
            avatarUrl: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const roles = await this.rolesService.findRoleNamesByUserId(userId);

    return {
      id: user.id,
      mobile: user.mobile,
      email: user.email,
      status: user.status,
      firstName: user.profile?.firstName ?? null,
      lastName: user.profile?.lastName ?? null,
      address: user.profile?.address ?? null,
      avatarUrl: user.profile?.avatarUrl ?? null,
      roles,
    };
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
    ipAddress?: string,
  ): Promise<ProfileResponse> {
    const data = {
      ...(dto.firstName !== undefined && { firstName: dto.firstName }),
      ...(dto.lastName !== undefined && { lastName: dto.lastName }),
      ...(dto.address !== undefined && { address: dto.address }),
    };

    if (Object.keys(data).length === 0) {
      return this.getProfile(userId);
    }

    const existing = await this.prisma.userProfile.findUnique({
      where: { userId },
    });

    const profile = await this.prisma.userProfile.upsert({
      where: { userId },
      update: { ...data, updatedBy: userId },
      create: {
        userId,
        firstName: dto.firstName ?? '',
        lastName: dto.lastName ?? '',
        address: dto.address,
        createdBy: userId,
      },
    });

    await this.auditService.log({
      userId,
      action: 'PROFILE_UPDATE',
      entity: 'UserProfile',
      entityId: profile.id,
      before:
        existing === null
          ? null
          : {
              firstName: existing.firstName,
              lastName: existing.lastName,
              address: existing.address,
            },
      after: {
        firstName: profile.firstName,
        lastName: profile.lastName,
        address: profile.address,
      },
      ipAddress,
    });

    return this.getProfile(userId);
  }
}
