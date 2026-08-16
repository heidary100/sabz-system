import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Partner, PartnerApprovalStatus, PartnerDocumentType } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PartnersService } from './partners.service';

function makePartner(overrides: Partial<Partner> = {}): Partner {
  const now = new Date('2026-08-16T00:00:00.000Z');
  return {
    id: 'partner-1',
    profileId: 'profile-1',
    businessName: 'اکسیر الکترونیک',
    businessLicenseNo: 'LIC-123',
    nationalId: '1122334455',
    website: 'https://example.com',
    address: 'تهران، خیابان ولیعصر',
    city: 'تهران',
    province: 'تهران',
    tierId: null,
    approvalStatus: PartnerApprovalStatus.DRAFT,
    approvedAt: null,
    submittedAt: null,
    rejectedAt: null,
    rejectionReason: null,
    reviewNotes: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    createdBy: 'user-1',
    updatedBy: null,
    ...overrides,
  };
}

function makeTx(tx: unknown): never {
  return tx as never;
}

describe('PartnersService', () => {
  let service: PartnersService;
  let prisma: {
    userProfile: { findUnique: jest.Mock };
    partner: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    businessDocument: { count: jest.Mock; findMany: jest.Mock };
    partnerTier: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let tx: {
    partner: { create: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    businessDocument: { count: jest.Mock };
    auditLog: { create: jest.Mock };
  };
  let auditService: { log: jest.Mock };

  beforeEach(() => {
    tx = {
      partner: {
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      businessDocument: { count: jest.fn().mockResolvedValue(1) },
      auditLog: { create: jest.fn() },
    };
    prisma = {
      userProfile: { findUnique: jest.fn() },
      partner: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      businessDocument: { count: jest.fn(), findMany: jest.fn() },
      partnerTier: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (callback: (client: unknown) => unknown) => callback(makeTx(tx)),
    );
    auditService = { log: jest.fn() };
    service = new PartnersService(
      prisma as unknown as PrismaService,
      auditService as unknown as AuditService,
    );
  });

  describe('createApplication', () => {
    beforeEach(() => {
      prisma.businessDocument.findMany.mockResolvedValue([]);
      prisma.partnerTier.findUnique.mockResolvedValue(null);
    });

    it('creates a DRAFT application for a user with a complete profile', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        firstName: 'علی',
        lastName: 'احمدی',
      });
      prisma.partner.findUnique.mockResolvedValue(null);
      const created = makePartner();
      tx.partner.create.mockResolvedValue(created);
      prisma.partner.update.mockResolvedValue(created);

      const result = await service.createApplication('user-1', {
        businessName: 'اکسیر الکترونیک',
      });

      expect(tx.partner.create).toHaveBeenCalledWith({
        data: {
          profileId: 'profile-1',
          businessName: 'اکسیر الکترونیک',
          createdBy: 'user-1',
        },
      });
      expect(result.approvalStatus).toBe(PartnerApprovalStatus.DRAFT);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          action: 'PARTNER_APPLICATION_CREATED',
          entity: 'Partner',
          entityId: 'partner-1',
        }),
        makeTx(tx),
      );
    });

    it('rejects creation when the user has no profile', async () => {
      prisma.userProfile.findUnique.mockResolvedValue(null);

      await expect(
        service.createApplication('user-1', { businessName: 'اکسیر' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects creation when the profile is incomplete', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        firstName: ' ',
        lastName: '',
      });

      await expect(
        service.createApplication('user-1', { businessName: 'اکسیر' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects creation when a partner already exists', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        firstName: 'علی',
        lastName: 'احمدی',
      });
      prisma.partner.findFirst.mockResolvedValue(makePartner());

      await expect(
        service.createApplication('user-1', { businessName: 'اکسیر' }),
      ).rejects.toThrow(ConflictException);
    });

    it('returns 409 Conflict on a unique constraint race (P2002)', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        firstName: 'علی',
        lastName: 'احمدی',
      });
      prisma.partner.findUnique.mockResolvedValue(null);
      tx.partner.create.mockRejectedValue({
        code: 'P2002',
      } as never);

      await expect(
        service.createApplication('user-1', { businessName: 'اکسیر' }),
      ).rejects.toThrow(ConflictException);
    });

    it('immediate submit is rejected with 422 because no business license exists', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        firstName: 'علی',
        lastName: 'احمدی',
      });
      prisma.partner.findUnique.mockResolvedValue(null);
      tx.partner.create.mockResolvedValue(
        makePartner({
          businessLicenseNo: 'LIC-123',
          address: 'تهران',
          city: 'تهران',
          province: 'تهران',
        }),
      );

      await expect(
        service.createApplication('user-1', {
          businessName: 'اکسیر',
          businessLicenseNo: 'LIC-123',
          address: 'تهران',
          city: 'تهران',
          province: 'تهران',
          submit: true,
        }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('audits with minimal business state excluding sensitive fields', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        firstName: 'علی',
        lastName: 'احمدی',
      });
      prisma.partner.findUnique.mockResolvedValue(null);
      tx.partner.create.mockResolvedValue(
        makePartner({
          businessName: 'اکسیر',
          nationalId: '1122334455',
          businessLicenseNo: 'LIC-123',
        }),
      );

      await service.createApplication('user-1', { businessName: 'اکسیر' });

      const entry = auditService.log.mock.calls[0][0];
      expect(entry.before).toBeUndefined();
      expect(JSON.stringify(entry.after)).not.toContain('nationalId');
      expect(JSON.stringify(entry.after)).not.toContain('businessLicenseNo');
    });
  });

  describe('getApplication', () => {
    it('returns the owned application with documents and no storage key', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        firstName: 'علی',
        lastName: 'احمدی',
      });
      prisma.partner.findUnique.mockResolvedValue(makePartner());
      prisma.businessDocument.findMany.mockResolvedValue([
        {
          id: 'doc-1',
          type: PartnerDocumentType.BUSINESS_LICENSE,
          originalName: 'license.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 100,
          storageKey: 'partners/partner-1/doc-1.pdf',
          createdAt: new Date('2026-08-16T00:00:00.000Z'),
        },
      ]);
      prisma.partnerTier.findUnique.mockResolvedValue(null);

      const result = await service.getApplication('user-1');

      expect(result.id).toBe('partner-1');
      expect(result.approvalStatus).toBe(PartnerApprovalStatus.DRAFT);
      expect(result.documents).toHaveLength(1);
      expect(JSON.stringify(result)).not.toContain('storageKey');
      expect(JSON.stringify(result)).not.toContain('reviewNotes');
      expect(result.nationalId).toBe('1122334455');
      expect(result.businessLicenseNo).toBe('LIC-123');
    });

    it('throws 404 when the user has no profile', async () => {
      prisma.userProfile.findUnique.mockResolvedValue(null);

      await expect(service.getApplication('user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws 404 when the user has no partner', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        firstName: 'علی',
        lastName: 'احمدی',
      });
      prisma.partner.findUnique.mockResolvedValue(null);

      await expect(service.getApplication('user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateApplication', () => {
    beforeEach(() => {
      prisma.businessDocument.findMany.mockResolvedValue([]);
      prisma.partnerTier.findUnique.mockResolvedValue(null);
      prisma.businessDocument.count.mockResolvedValue(1);
      tx.partner.updateMany.mockResolvedValue({ count: 1 });
    });

    it('edits a DRAFT application', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        firstName: 'علی',
        lastName: 'احمدی',
      });
      const partner = makePartner();
      prisma.partner.findUnique.mockResolvedValue(partner);

      const result = await service.updateApplication('user-1', {
        businessName: 'نام جدید',
      });

      expect(tx.partner.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'partner-1',
            approvalStatus: { in: [PartnerApprovalStatus.DRAFT, PartnerApprovalStatus.REJECTED] },
            deletedAt: null,
          },
        }),
      );
      expect(result.businessName).toBe('نام جدید');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PARTNER_APPLICATION_UPDATED' }),
        expect.anything(),
      );
    });

    it('edits a REJECTED application', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        firstName: 'علی',
        lastName: 'احمدی',
      });
      prisma.partner.findUnique.mockResolvedValue(
        makePartner({ approvalStatus: PartnerApprovalStatus.REJECTED }),
      );

      await expect(
        service.updateApplication('user-1', { website: 'https://new.example.com' }),
      ).resolves.toBeDefined();
    });

    it('rejects editing a PENDING application with 409', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        firstName: 'علی',
        lastName: 'احمدی',
      });
      prisma.partner.findUnique.mockResolvedValue(
        makePartner({ approvalStatus: PartnerApprovalStatus.PENDING }),
      );

      await expect(
        service.updateApplication('user-1', { businessName: 'نام جدید' }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects editing an APPROVED application with 409', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        firstName: 'علی',
        lastName: 'احمدی',
      });
      prisma.partner.findUnique.mockResolvedValue(
        makePartner({ approvalStatus: PartnerApprovalStatus.APPROVED }),
      );

      await expect(
        service.updateApplication('user-1', { businessName: 'نام جدید' }),
      ).rejects.toThrow(ConflictException);
    });

    it('submits a DRAFT application with a business license', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        firstName: 'علی',
        lastName: 'احمدی',
      });
      prisma.partner.findUnique.mockResolvedValue(makePartner());

      const result = await service.updateApplication('user-1', { submit: true });

      expect(tx.partner.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'partner-1',
          approvalStatus: { in: [PartnerApprovalStatus.DRAFT, PartnerApprovalStatus.REJECTED] },
          deletedAt: null,
        },
        data: expect.objectContaining({
          approvalStatus: PartnerApprovalStatus.PENDING,
          rejectedAt: null,
          rejectionReason: null,
        }),
      });
      expect(result.approvalStatus).toBe(PartnerApprovalStatus.PENDING);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PARTNER_APPLICATION_SUBMITTED' }),
        expect.anything(),
      );
    });

    it('resubmits a REJECTED application and clears rejection metadata', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        firstName: 'علی',
        lastName: 'احمدی',
      });
      prisma.partner.findUnique.mockResolvedValue(
        makePartner({
          approvalStatus: PartnerApprovalStatus.REJECTED,
          rejectedAt: new Date('2026-08-15T00:00:00.000Z'),
          rejectionReason: 'مدارک ناقص',
        }),
      );

      const result = await service.updateApplication('user-1', { submit: true });

      expect(tx.partner.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'partner-1',
          approvalStatus: { in: [PartnerApprovalStatus.DRAFT, PartnerApprovalStatus.REJECTED] },
          deletedAt: null,
        },
        data: expect.objectContaining({
          approvalStatus: PartnerApprovalStatus.PENDING,
          rejectedAt: null,
          rejectionReason: null,
        }),
      });
      expect(result.approvalStatus).toBe(PartnerApprovalStatus.PENDING);
    });

    it('rejects submitting a PENDING application with 409', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        firstName: 'علی',
        lastName: 'احمدی',
      });
      prisma.partner.findUnique.mockResolvedValue(
        makePartner({ approvalStatus: PartnerApprovalStatus.PENDING }),
      );

      await expect(
        service.updateApplication('user-1', { submit: true }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects submitting an APPROVED application with 409', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        firstName: 'علی',
        lastName: 'احمدی',
      });
      prisma.partner.findUnique.mockResolvedValue(
        makePartner({ approvalStatus: PartnerApprovalStatus.APPROVED }),
      );

      await expect(
        service.updateApplication('user-1', { submit: true }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects submission with 422 when no business license is present', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        firstName: 'علی',
        lastName: 'احمدی',
      });
      prisma.partner.findUnique.mockResolvedValue(makePartner());
      tx.businessDocument.count.mockResolvedValue(0);

      await expect(
        service.updateApplication('user-1', { submit: true }),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(tx.partner.updateMany).not.toHaveBeenCalled();
    });

    it('rejects submission with 422 when required fields are missing', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        firstName: 'علی',
        lastName: 'احمدی',
      });
      prisma.partner.findUnique.mockResolvedValue(
        makePartner({ businessLicenseNo: null, address: null, city: null, province: null }),
      );

      await expect(
        service.updateApplication('user-1', { submit: true }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('returns 404 when the user has no partner', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        firstName: 'علی',
        lastName: 'احمدی',
      });
      prisma.partner.findUnique.mockResolvedValue(null);

      await expect(
        service.updateApplication('user-1', { submit: true }),
      ).rejects.toThrow(NotFoundException);
    });

    it('is a no-op and returns the application when nothing changes', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        firstName: 'علی',
        lastName: 'احمدی',
      });
      prisma.partner.findUnique.mockResolvedValue(makePartner());

      const result = await service.updateApplication('user-1', {});

      expect(tx.partner.updateMany).not.toHaveBeenCalled();
      expect(result.id).toBe('partner-1');
    });

    it('audits updates without nationalId or businessLicenseNo in payloads', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        firstName: 'علی',
        lastName: 'احمدی',
      });
      prisma.partner.findUnique.mockResolvedValue(makePartner());

      await service.updateApplication('user-1', { businessName: 'نام جدید' });

      const entry = auditService.log.mock.calls.find(
        (call: unknown[]) => (call[0] as { action: string }).action === 'PARTNER_APPLICATION_UPDATED',
      )?.[0];
      const serialized = JSON.stringify(entry);
      expect(serialized).not.toContain('nationalId');
      expect(serialized).not.toContain('businessLicenseNo');
      expect(entry.after).toMatchObject({
        businessName: 'نام جدید',
        approvalStatus: PartnerApprovalStatus.DRAFT,
      });
    });
  });
});
