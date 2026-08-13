import { NotFoundException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../../../common/database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AppRole } from '../enums/app-role.enum';
import { RolesService } from '../roles/roles.service';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { ProfileService } from './profile.service';

describe('ProfileService', () => {
  let service: ProfileService;
  let prisma: {
    user: { findUnique: jest.Mock };
    userProfile: { findUnique: jest.Mock; upsert: jest.Mock };
  };
  let auditService: { log: jest.Mock };
  let rolesService: { findRoleNamesByUserId: jest.Mock };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      userProfile: { findUnique: jest.fn(), upsert: jest.fn() },
    };
    auditService = { log: jest.fn() };
    rolesService = { findRoleNamesByUserId: jest.fn() };
    rolesService.findRoleNamesByUserId.mockResolvedValue([AppRole.CUSTOMER]);
    service = new ProfileService(
      prisma as unknown as PrismaService,
      auditService as unknown as AuditService,
      rolesService as unknown as RolesService,
    );
  });

  describe('getProfile', () => {
    it('returns identity and profile fields for the given user', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        mobile: '+989123456789',
        email: null,
        status: UserStatus.ACTIVE,
        profile: {
          firstName: 'Ali',
          lastName: 'Ahmadi',
          address: 'Tehran',
          avatarUrl: null,
        },
      });

      const result = await service.getProfile('user-1');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: expect.objectContaining({ id: true, mobile: true }),
      });
      expect(rolesService.findRoleNamesByUserId).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({
        id: 'user-1',
        mobile: '+989123456789',
        email: null,
        status: UserStatus.ACTIVE,
        firstName: 'Ali',
        lastName: 'Ahmadi',
        address: 'Tehran',
        avatarUrl: null,
        roles: [AppRole.CUSTOMER],
      });
    });

    it('returns null profile fields and roles when the user has no profile', async () => {
      rolesService.findRoleNamesByUserId.mockResolvedValue([]);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        mobile: '+989123456789',
        email: null,
        status: UserStatus.ACTIVE,
        profile: null,
      });

      const result = await service.getProfile('user-1');

      expect(result).toEqual({
        id: 'user-1',
        mobile: '+989123456789',
        email: null,
        status: UserStatus.ACTIVE,
        firstName: null,
        lastName: null,
        address: null,
        avatarUrl: null,
        roles: [],
      });
    });

    it('throws NotFoundException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getProfile('missing')).rejects.toThrow(
        NotFoundException,
      );
      expect(rolesService.findRoleNamesByUserId).not.toHaveBeenCalled();
    });

    it('never exposes authentication data', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        mobile: '+989123456789',
        email: null,
        status: UserStatus.ACTIVE,
        profile: null,
      });

      const result = await service.getProfile('user-1');

      expect(JSON.stringify(result)).not.toContain('password');
      expect(JSON.stringify(result)).not.toContain('refreshToken');
      expect(JSON.stringify(result)).not.toContain('otp');
    });
  });

  describe('updateProfile', () => {
    it('upserts the profile with the editable fields only', async () => {
      prisma.userProfile.findUnique.mockResolvedValue(null);
      prisma.userProfile.upsert.mockResolvedValue({
        id: 'profile-1',
        userId: 'user-1',
        firstName: 'Ali',
        lastName: 'Ahmadi',
        address: 'Tehran',
        address2: 'ignored',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdBy: 'user-1',
        updatedBy: 'user-1',
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        mobile: '+989123456789',
        email: null,
        status: UserStatus.ACTIVE,
        profile: {
          firstName: 'Ali',
          lastName: 'Ahmadi',
          address: 'Tehran',
          avatarUrl: null,
        },
      });

      const dto: UpdateProfileDto = {
        firstName: 'Ali',
        lastName: 'Ahmadi',
        address: 'Tehran',
      };
      const result = await service.updateProfile('user-1', dto, '1.2.3.4');

      expect(prisma.userProfile.upsert).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        update: {
          firstName: 'Ali',
          lastName: 'Ahmadi',
          address: 'Tehran',
          updatedBy: 'user-1',
        },
        create: {
          userId: 'user-1',
          firstName: 'Ali',
          lastName: 'Ahmadi',
          address: 'Tehran',
          createdBy: 'user-1',
        },
      });
      expect(result.firstName).toBe('Ali');
      expect(result.address).toBe('Tehran');
    });

    it('only ever writes the editable fields to the database', async () => {
      prisma.userProfile.findUnique.mockResolvedValue(null);
      prisma.userProfile.upsert.mockResolvedValue({
        id: 'profile-1',
        userId: 'user-1',
        firstName: 'Ali',
        lastName: 'Ahmadi',
        address: null,
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        mobile: '+989123456789',
        email: null,
        status: UserStatus.ACTIVE,
        profile: { firstName: 'Ali', lastName: 'Ahmadi', address: null },
      });

      const dto = {
        firstName: 'Ali',
        mobile: '+989000000000',
        status: UserStatus.SUSPENDED,
        userId: 'another-user',
      } as unknown as UpdateProfileDto;
      await service.updateProfile('user-1', dto);

      const upsertCall = prisma.userProfile.upsert.mock.calls[0][0];
      expect(upsertCall.update).toEqual({
        firstName: 'Ali',
        updatedBy: 'user-1',
      });
      expect(upsertCall.update).not.toHaveProperty('mobile');
      expect(upsertCall.update).not.toHaveProperty('status');
      expect(upsertCall.update).not.toHaveProperty('userId');
    });

    it('returns the profile unchanged when the DTO has no editable fields', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        mobile: '+989123456789',
        email: null,
        status: UserStatus.ACTIVE,
        profile: {
          firstName: 'Ali',
          lastName: 'Ahmadi',
          address: null,
          avatarUrl: null,
        },
      });

      const result = await service.updateProfile('user-1', {});

      expect(prisma.userProfile.upsert).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
      expect(result.firstName).toBe('Ali');
    });

    it('audit logs the profile update with before and after values', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        userId: 'user-1',
        firstName: 'Old',
        lastName: 'Name',
        address: null,
      });
      prisma.userProfile.upsert.mockResolvedValue({
        id: 'profile-1',
        userId: 'user-1',
        firstName: 'New',
        lastName: 'Name',
        address: 'Tehran',
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        mobile: '+989123456789',
        email: null,
        status: UserStatus.ACTIVE,
        profile: {
          firstName: 'New',
          lastName: 'Name',
          address: 'Tehran',
          avatarUrl: null,
        },
      });

      await service.updateProfile(
        'user-1',
        { firstName: 'New', address: 'Tehran' },
        '1.2.3.4',
      );

      expect(auditService.log).toHaveBeenCalledWith({
        userId: 'user-1',
        action: 'PROFILE_UPDATE',
        entity: 'UserProfile',
        entityId: 'profile-1',
        before: { firstName: 'Old', lastName: 'Name', address: null },
        after: { firstName: 'New', lastName: 'Name', address: 'Tehran' },
        ipAddress: '1.2.3.4',
      });
    });

    it('audit logs profile creation when no profile exists', async () => {
      prisma.userProfile.findUnique.mockResolvedValue(null);
      prisma.userProfile.upsert.mockResolvedValue({
        id: 'profile-1',
        userId: 'user-1',
        firstName: 'Ali',
        lastName: 'Ahmadi',
        address: null,
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        mobile: '+989123456789',
        email: null,
        status: UserStatus.ACTIVE,
        profile: {
          firstName: 'Ali',
          lastName: 'Ahmadi',
          address: null,
          avatarUrl: null,
        },
      });

      await service.updateProfile('user-1', { firstName: 'Ali' });

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PROFILE_UPDATE',
          before: null,
        }),
      );
    });
  });
});
