import {
  BadRequestException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../../../common/database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AppRole } from '../enums/app-role.enum';
import { RolesService } from '../roles/roles.service';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { ProfileService } from './profile.service';

const USER_ID = 'user-1';
const VALID_NATIONAL_ID = '6059926746';
const VALID_NATIONAL_ID_REPLACEMENT = '7291363357';

function makeTx() {
  return {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    userProfile: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };
}

function makeProfileRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'profile-1',
    userId: USER_ID,
    firstName: 'Ali',
    lastName: 'Ahmadi',
    address: 'Tehran',
    avatarUrl: null,
    ...overrides,
  };
}

function makeGetProfileRow(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    mobile: '+989123456789',
    email: null,
    status: UserStatus.ACTIVE,
    nationalId: null,
    profile: {
      firstName: 'Ali',
      lastName: 'Ahmadi',
      address: 'Tehran',
      avatarUrl: null,
    },
    ...overrides,
  };
}

describe('ProfileService', () => {
  let service: ProfileService;
  let prisma: {
    user: { findUnique: jest.Mock };
    userProfile: { findUnique: jest.Mock; upsert: jest.Mock };
    $transaction: jest.Mock;
  };
  let tx: ReturnType<typeof makeTx>;
  let auditService: { log: jest.Mock };
  let rolesService: { findRoleNamesByUserId: jest.Mock };

  beforeEach(() => {
    tx = makeTx();
    prisma = {
      user: { findUnique: jest.fn() },
      userProfile: { findUnique: jest.fn(), upsert: jest.fn() },
      $transaction: jest.fn((operation: (client: typeof tx) => unknown) =>
        operation(tx),
      ),
    };
    prisma.user.findUnique.mockResolvedValue(makeGetProfileRow());
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
    it('returns identity and safe profile fields for the given user', async () => {
      const result = await service.getProfile(USER_ID);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: USER_ID },
        select: expect.objectContaining({
          id: true,
          mobile: true,
          nationalId: true,
        }),
      });
      expect(rolesService.findRoleNamesByUserId).toHaveBeenCalledWith(USER_ID);
      expect(result).toEqual({
        id: USER_ID,
        mobile: '+989123456789',
        email: null,
        status: UserStatus.ACTIVE,
        firstName: 'Ali',
        lastName: 'Ahmadi',
        address: 'Tehran',
        avatarUrl: null,
        hasNationalId: false,
        maskedNationalId: null,
        roles: [AppRole.CUSTOMER],
      });
    });

    it('returns only the masked national ID, never the full value', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeGetProfileRow({ nationalId: VALID_NATIONAL_ID }),
      );

      const result = await service.getProfile(USER_ID);

      expect(result.hasNationalId).toBe(true);
      expect(result.maskedNationalId).toBe('****6746');
      expect(JSON.stringify(result)).not.toContain(VALID_NATIONAL_ID);
    });

    it('returns null profile fields and roles when the user has no profile', async () => {
      rolesService.findRoleNamesByUserId.mockResolvedValue([]);
      prisma.user.findUnique.mockResolvedValue(
        makeGetProfileRow({ profile: null }),
      );

      const result = await service.getProfile(USER_ID);

      expect(result).toEqual({
        id: USER_ID,
        mobile: '+989123456789',
        email: null,
        status: UserStatus.ACTIVE,
        firstName: null,
        lastName: null,
        address: null,
        avatarUrl: null,
        hasNationalId: false,
        maskedNationalId: null,
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
      prisma.user.findUnique.mockResolvedValue(
        makeGetProfileRow({ nationalId: VALID_NATIONAL_ID }),
      );

      const result = await service.getProfile(USER_ID);
      const serialized = JSON.stringify(result);

      expect(serialized).not.toContain('password');
      expect(serialized).not.toContain('refreshToken');
      expect(serialized).not.toContain('otp');
      expect(serialized).not.toContain(VALID_NATIONAL_ID);
    });
  });

  describe('updateProfile', () => {
    it('upserts the profile with the editable fields only', async () => {
      const profile = makeProfileRow();
      tx.userProfile.findUnique.mockResolvedValue(null);
      tx.userProfile.upsert.mockResolvedValue(profile);

      const dto: UpdateProfileDto = {
        firstName: 'Ali',
        lastName: 'Ahmadi',
        address: 'Tehran',
      };
      const result = await service.updateProfile(USER_ID, dto, '1.2.3.4');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.userProfile.upsert).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        update: {
          firstName: 'Ali',
          lastName: 'Ahmadi',
          address: 'Tehran',
          updatedBy: USER_ID,
        },
        create: {
          userId: USER_ID,
          firstName: 'Ali',
          lastName: 'Ahmadi',
          address: 'Tehran',
          createdBy: USER_ID,
        },
      });
      expect(tx.user.update).not.toHaveBeenCalled();
      expect(result.firstName).toBe('Ali');
      expect(result.address).toBe('Tehran');
    });

    it('only ever writes the editable profile fields to UserProfile', async () => {
      tx.userProfile.findUnique.mockResolvedValue(null);
      tx.userProfile.upsert.mockResolvedValue(makeProfileRow());

      const dto = {
        firstName: 'Ali',
        mobile: '+989000000000',
        status: UserStatus.SUSPENDED,
        userId: 'another-user',
      } as unknown as UpdateProfileDto;
      await service.updateProfile(USER_ID, dto);

      const upsertCall = tx.userProfile.upsert.mock.calls[0][0];
      expect(upsertCall.update).toEqual({
        firstName: 'Ali',
        updatedBy: USER_ID,
      });
      expect(upsertCall.update).not.toHaveProperty('mobile');
      expect(upsertCall.update).not.toHaveProperty('status');
      expect(upsertCall.update).not.toHaveProperty('userId');
    });

    it('returns the profile unchanged when the DTO has no editable fields', async () => {
      const result = await service.updateProfile(USER_ID, {});

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.userProfile.upsert).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
      expect(result.firstName).toBe('Ali');
    });

    it('audit logs the profile update with before and after values', async () => {
      tx.userProfile.findUnique.mockResolvedValue(
        makeProfileRow({ firstName: 'Old', address: null }),
      );
      tx.userProfile.upsert.mockResolvedValue(
        makeProfileRow({ firstName: 'New' }),
      );

      await service.updateProfile(
        USER_ID,
        { firstName: 'New', address: 'Tehran' },
        '1.2.3.4',
      );

      expect(auditService.log).toHaveBeenCalledWith(
        {
          userId: USER_ID,
          action: 'PROFILE_UPDATE',
          entity: 'UserProfile',
          entityId: 'profile-1',
          before: {
            firstName: 'Old',
            lastName: 'Ahmadi',
            address: null,
          },
          after: {
            firstName: 'New',
            lastName: 'Ahmadi',
            address: 'Tehran',
          },
          ipAddress: '1.2.3.4',
        },
        tx,
      );
    });

    it('audit logs profile creation when no profile exists', async () => {
      tx.userProfile.findUnique.mockResolvedValue(null);
      tx.userProfile.upsert.mockResolvedValue(makeProfileRow());

      await service.updateProfile(USER_ID, { firstName: 'Ali' });

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PROFILE_UPDATE',
          before: null,
        }),
        tx,
      );
    });

    it('validates and stores a national ID as canonical ASCII', async () => {
      tx.user.findUnique.mockResolvedValue({ nationalId: null });
      prisma.user.findUnique.mockResolvedValue(
        makeGetProfileRow({ nationalId: VALID_NATIONAL_ID }),
      );

      const result = await service.updateProfile(USER_ID, {
        nationalId: '۶۰۵۹۹۲۶۷۴۶',
      });

      expect(tx.userProfile.upsert).not.toHaveBeenCalled();
      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { nationalId: VALID_NATIONAL_ID, updatedBy: USER_ID },
      });
      expect(result.hasNationalId).toBe(true);
      expect(result.maskedNationalId).toBe('****6746');
    });

    it('rejects an invalid checksum before any write or transaction', async () => {
      await expect(
        service.updateProfile(USER_ID, { nationalId: '6059926747' }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.user.update).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('rejects empty and null national IDs before persistence', async () => {
      await expect(
        service.updateProfile(USER_ID, { nationalId: '' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.updateProfile(USER_ID, {
          nationalId: null as unknown as string,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.user.update).not.toHaveBeenCalled();
    });

    it('does not update or audit when the same national ID is resubmitted', async () => {
      tx.user.findUnique.mockResolvedValue({
        nationalId: VALID_NATIONAL_ID,
      });
      prisma.user.findUnique.mockResolvedValue(
        makeGetProfileRow({ nationalId: VALID_NATIONAL_ID }),
      );

      await service.updateProfile(USER_ID, {
        nationalId: VALID_NATIONAL_ID,
      });

      expect(tx.user.update).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('updates profile fields and national ID atomically', async () => {
      tx.user.findUnique.mockResolvedValue({ nationalId: null });
      tx.userProfile.findUnique.mockResolvedValue(makeProfileRow());
      tx.userProfile.upsert.mockResolvedValue(makeProfileRow());
      prisma.user.findUnique.mockResolvedValue(
        makeGetProfileRow({ nationalId: VALID_NATIONAL_ID_REPLACEMENT }),
      );

      await service.updateProfile(
        USER_ID,
        { firstName: 'New', nationalId: VALID_NATIONAL_ID_REPLACEMENT },
        '1.2.3.4',
      );

      expect(tx.userProfile.upsert).toHaveBeenCalledTimes(1);
      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: {
          nationalId: VALID_NATIONAL_ID_REPLACEMENT,
          updatedBy: USER_ID,
        },
      });
      expect(auditService.log).toHaveBeenCalledTimes(2);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PROFILE_UPDATE' }),
        tx,
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'USER_NATIONAL_ID_UPDATED' }),
        tx,
      );
    });

    it('rejects the whole request when profile fields accompany an invalid national ID', async () => {
      await expect(
        service.updateProfile(USER_ID, {
          firstName: 'New',
          nationalId: '6509926746',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.userProfile.upsert).not.toHaveBeenCalled();
    });

    it('audits only a boolean and never either national ID value', async () => {
      tx.user.findUnique.mockResolvedValue({ nationalId: null });
      prisma.user.findUnique.mockResolvedValue(
        makeGetProfileRow({ nationalId: VALID_NATIONAL_ID }),
      );

      await service.updateProfile(USER_ID, {
        nationalId: VALID_NATIONAL_ID,
      });

      const nationalIdAudit = auditService.log.mock.calls.find(
        (call: unknown[]) =>
          (call[0] as { action: string }).action ===
          'USER_NATIONAL_ID_UPDATED',
      )?.[0];
      expect(nationalIdAudit).toEqual({
        userId: USER_ID,
        action: 'USER_NATIONAL_ID_UPDATED',
        entity: 'User',
        entityId: USER_ID,
        before: null,
        after: { nationalIdChanged: true },
        ipAddress: undefined,
      });
      expect(JSON.stringify(nationalIdAudit)).not.toContain(
        VALID_NATIONAL_ID,
      );
    });

    it('throws NotFoundException when the authenticated user row is missing', async () => {
      tx.user.findUnique.mockResolvedValue(null);

      await expect(
        service.updateProfile(USER_ID, {
          nationalId: VALID_NATIONAL_ID,
        }),
      ).rejects.toThrow(NotFoundException);
      expect(tx.user.update).not.toHaveBeenCalled();
    });

    it('maps unexpected errors to a generic 500 without logging the value', async () => {
      const loggerSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      prisma.$transaction.mockRejectedValue(
        new Error(`database failed for ${VALID_NATIONAL_ID}`),
      );

      await expect(
        service.updateProfile(USER_ID, {
          nationalId: VALID_NATIONAL_ID,
        }),
      ).rejects.toThrow(InternalServerErrorException);

      expect(JSON.stringify(loggerSpy.mock.calls)).not.toContain(
        VALID_NATIONAL_ID,
      );
      loggerSpy.mockRestore();
    });
  });
});
