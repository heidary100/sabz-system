import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../../../common/database/prisma.service';
import {
  PERSONAL_NATIONAL_ID_MESSAGES,
  maskPersonalNationalId,
  validatePersonalNationalId,
} from '../../../common/validation/personal-national-id';
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
  hasNationalId: boolean;
  maskedNationalId: string | null;
  roles: AppRole[];
}

interface ProfileAuditRow {
  id: string;
  firstName: string;
  lastName: string;
  address: string | null;
}

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

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
        nationalId: true,
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
      hasNationalId:
        typeof user.nationalId === 'string' && user.nationalId.length > 0,
      maskedNationalId: maskPersonalNationalId(user.nationalId),
      roles,
    };
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
    ipAddress?: string,
  ): Promise<ProfileResponse> {
    // Validate before opening a transaction or writing anything. An invalid
    // national ID rejects the whole request so names/address cannot be
    // partially updated alongside it.
    const nationalId =
      dto.nationalId === undefined
        ? undefined
        : this.normalizeNationalIdOrThrow(dto.nationalId);

    const profileData = {
      ...(dto.firstName !== undefined && { firstName: dto.firstName }),
      ...(dto.lastName !== undefined && { lastName: dto.lastName }),
      ...(dto.address !== undefined && { address: dto.address }),
    };
    const hasProfileChanges = Object.keys(profileData).length > 0;

    if (!hasProfileChanges && nationalId === undefined) {
      return this.getProfile(userId);
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const existingUser =
          nationalId === undefined
            ? null
            : await tx.user.findUnique({
                where: { id: userId },
                select: { nationalId: true },
              });
        if (nationalId !== undefined && existingUser === null) {
          throw new NotFoundException('User not found.');
        }

        let existingProfile: ProfileAuditRow | null = null;
        let profile: ProfileAuditRow | null = null;
        if (hasProfileChanges) {
          existingProfile = await tx.userProfile.findUnique({
            where: { userId },
          });
          profile = await tx.userProfile.upsert({
            where: { userId },
            update: { ...profileData, updatedBy: userId },
            create: {
              userId,
              firstName: dto.firstName ?? '',
              lastName: dto.lastName ?? '',
              address: dto.address,
              createdBy: userId,
            },
          });
        }

        const nationalIdChanged =
          nationalId !== undefined &&
          existingUser?.nationalId !== nationalId;

        if (nationalIdChanged) {
          await tx.user.update({
            where: { id: userId },
            data: { nationalId, updatedBy: userId },
          });
        }

        if (hasProfileChanges && profile !== null) {
          await this.auditService.log(
            {
              userId,
              action: 'PROFILE_UPDATE',
              entity: 'UserProfile',
              entityId: profile.id,
              before:
                existingProfile === null
                  ? null
                  : {
                      firstName: existingProfile.firstName,
                      lastName: existingProfile.lastName,
                      address: existingProfile.address,
                    },
              after: {
                firstName: profile.firstName,
                lastName: profile.lastName,
                address: profile.address,
              },
              ipAddress,
            },
            tx,
          );
        }

        if (nationalIdChanged) {
          await this.auditService.log(
            {
              userId,
              action: 'USER_NATIONAL_ID_UPDATED',
              entity: 'User',
              entityId: userId,
              // Deliberately only a boolean: neither the previous nor the new
              // identifier may ever enter the audit payload.
              before: null,
              after: { nationalIdChanged: true },
              ipAddress,
            },
            tx,
          );
        }
      });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      const code =
        error instanceof Prisma.PrismaClientKnownRequestError
          ? error.code
          : undefined;
      // Never log error.message/meta: a database error could contain the
      // submitted identifier. The code alone is enough for triage.
      this.logger.error(
        `Profile update failed${code !== undefined ? ` (${code})` : ''}`,
      );
      throw new InternalServerErrorException('ذخیره اطلاعات ناموفق بود.');
    }

    return this.getProfile(userId);
  }

  private normalizeNationalIdOrThrow(value: string): string {
    const result = validatePersonalNationalId(value);
    if (!result.ok) {
      throw new BadRequestException(
        PERSONAL_NATIONAL_ID_MESSAGES[result.error],
      );
    }
    return result.value;
  }
}
