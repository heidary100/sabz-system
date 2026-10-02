import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Partner, PartnerApprovalStatus, PartnerDocumentType, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AppRole } from '../auth/enums/app-role.enum';
import { RolesService } from '../auth/roles/roles.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notifications/notification.service';
import { AdminPartnersService } from './admin-partners.service';

function makePartner(overrides: Partial<Partner> = {}): Partner {
  const now = new Date('2026-08-16T00:00:00.000Z');
  return {
    id: 'partner-1',
    profileId: 'profile-1',
    businessName: 'اکسیر الکترونیک',
    businessLicenseNo: 'LIC-123',
    nationalId: '1122334455',
    website: null,
    address: 'تهران، خیابان ولیعصر',
    city: 'تهران',
    province: 'تهران',
    tierId: null,
    approvalStatus: PartnerApprovalStatus.PENDING,
    approvedAt: null,
    submittedAt: new Date('2026-08-15T00:00:00.000Z'),
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

function makeDetail() {
  return {
    ...makePartner(),
    profile: { firstName: 'علی', lastName: 'احمدی', user: { mobile: '+989123456789' } },
    tier: null,
    documents: [],
  };
}

function makeTx(tx: unknown): never {
  return tx as never;
}

describe('AdminPartnersService', () => {
  let service: AdminPartnersService;
  let prisma: {
    partner: {
      count: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
    partnerTier: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    businessDocument: { count: jest.Mock };
    userRole: { upsert: jest.Mock };
    $transaction: jest.Mock;
  };
  let tx: {
    partner: { findUnique: jest.Mock; updateMany: jest.Mock };
    partnerTier: { findUnique: jest.Mock };
    businessDocument: { count: jest.Mock };
    userRole: { upsert: jest.Mock };
    auditLog: { create: jest.Mock };
  };
  let auditService: { log: jest.Mock };
  let rolesService: { findRoleIdByName: jest.Mock };

  beforeEach(() => {
    tx = {
      partner: { findUnique: jest.fn(), updateMany: jest.fn() },
      partnerTier: { findUnique: jest.fn() },
      businessDocument: { count: jest.fn() },
      userRole: { upsert: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    prisma = {
      partner: {
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
      partnerTier: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      businessDocument: { count: jest.fn() },
      userRole: { upsert: jest.fn() },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((operation: unknown) => {
      if (typeof operation === 'function') {
        return operation(makeTx(tx));
      }
      return Promise.all(operation as Promise<unknown>[]);
    });
    auditService = { log: jest.fn() };
    rolesService = { findRoleIdByName: jest.fn() };
    service = new AdminPartnersService(
      prisma as unknown as PrismaService,
      auditService as unknown as AuditService,
      rolesService as unknown as RolesService,
      {
        notify: jest.fn(),
        notifyOperators: jest.fn(),
      } as unknown as NotificationService,
    );
  });

  describe('list', () => {
    it('defaults to PENDING status with page 1 and limit 20', async () => {
      prisma.partner.count.mockResolvedValue(1);
      prisma.partner.findMany.mockResolvedValue([makePartner()]);

      const result = await service.list({});

      expect(prisma.partner.count).toHaveBeenCalledWith({
        where: {
          approvalStatus: PartnerApprovalStatus.PENDING,
          deletedAt: null,
        },
      });
      expect(prisma.partner.findMany).toHaveBeenCalledWith({
        where: {
          approvalStatus: PartnerApprovalStatus.PENDING,
          deletedAt: null,
        },
        orderBy: [
          { submittedAt: { sort: 'desc', nulls: 'last' } },
          { id: 'desc' },
        ],
        skip: 0,
        take: 20,
      });
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.items[0]!.id).toBe('partner-1');
    });

    it('honours explicit status, page and limit', async () => {
      prisma.partner.count.mockResolvedValue(0);
      prisma.partner.findMany.mockResolvedValue([]);

      await service.list({
        status: PartnerApprovalStatus.REJECTED,
        page: 3,
        limit: 10,
      });

      expect(prisma.partner.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            approvalStatus: PartnerApprovalStatus.REJECTED,
            deletedAt: null,
          },
          skip: 20,
          take: 10,
        }),
      );
    });

    it('maps list items to the summary shape', async () => {
      const partner = makePartner({ city: 'تهران', province: 'تهران' });
      prisma.partner.count.mockResolvedValue(1);
      prisma.partner.findMany.mockResolvedValue([partner]);

      const result = await service.list({});

      expect(result.items[0]).toMatchObject({
        id: 'partner-1',
        businessName: 'اکسیر الکترونیک',
        approvalStatus: PartnerApprovalStatus.PENDING,
        city: 'تهران',
        province: 'تهران',
      });
      expect(result.items[0]!.submittedAt).toBe('2026-08-15T00:00:00.000Z');
    });
  });

  describe('listTiers', () => {
    it('returns all tiers ordered by min order quantity with partner counts', async () => {
      prisma.partnerTier.findMany.mockResolvedValue([
        {
          id: 'tier-3',
          name: 'Tier 3',
          discountPercent: { toString: () => '2.00' },
          minOrderQuantity: 1,
          _count: { partners: 4 },
        },
        {
          id: 'tier-1',
          name: 'Tier 1',
          discountPercent: { toString: () => '10.00' },
          minOrderQuantity: 100,
          _count: { partners: 0 },
        },
      ]);

      const result = await service.listTiers();

      expect(prisma.partnerTier.findMany).toHaveBeenCalledWith({
        orderBy: { minOrderQuantity: 'asc' },
        include: { _count: { select: { partners: true } } },
      });
      expect(result).toEqual([
        { id: 'tier-3', name: 'Tier 3', discountPercent: '2.00', minOrderQuantity: 1, partnerCount: 4 },
        { id: 'tier-1', name: 'Tier 1', discountPercent: '10.00', minOrderQuantity: 100, partnerCount: 0 },
      ]);
    });
  });

  describe('tier admin CRUD (#90)', () => {
    const tierRow = (overrides: Record<string, unknown> = {}) => ({
      id: 'tier-new',
      name: 'Tier 1 – Distributor',
      discountPercent: { toString: () => '0' },
      minOrderQuantity: 1,
      _count: { partners: 0 },
      ...overrides,
    });

    it('creates a tier, writes one audit entry, and returns the summary', async () => {
      prisma.partnerTier.create.mockResolvedValue(tierRow());

      const result = await service.createTier(
        { name: 'Tier 1 – Distributor', discountPercent: '0', minOrderQuantity: 1 },
        'admin-1',
        '10.0.0.1',
      );

      expect(prisma.partnerTier.create).toHaveBeenCalledWith({
        data: {
          name: 'Tier 1 – Distributor',
          discountPercent: '0',
          minOrderQuantity: 1,
          createdBy: 'admin-1',
          updatedBy: 'admin-1',
        },
        include: { _count: { select: { partners: true } } },
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-1',
          action: 'PARTNER_TIER_CREATED',
          entity: 'PartnerTier',
          entityId: 'tier-new',
          ipAddress: '10.0.0.1',
        }),
      );
      expect(result).toMatchObject({ id: 'tier-new', partnerCount: 0 });
    });

    it('maps a duplicate tier name to 409 without auditing', async () => {
      prisma.partnerTier.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.createTier(
          { name: 'Tier 1 – Distributor', discountPercent: '0', minOrderQuantity: 1 },
          'admin-1',
        ),
      ).rejects.toThrow(ConflictException);
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('rejects an out-of-range discount percent with 400 before touching the database', async () => {
      await expect(
        service.createTier(
          { name: 'Tier X', discountPercent: '120', minOrderQuantity: 1 },
          'admin-1',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.partnerTier.create).not.toHaveBeenCalled();
    });

    it('updates a tier and audits before/after', async () => {
      prisma.partnerTier.findUnique.mockResolvedValue(
        tierRow({ id: 'tier-1', discountPercent: { toString: () => '0' } }),
      );
      prisma.partnerTier.update.mockResolvedValue(
        tierRow({ id: 'tier-1', discountPercent: { toString: () => '12.50' } }),
      );

      const result = await service.updateTier(
        'tier-1',
        { discountPercent: '12.50' },
        'admin-1',
      );

      expect(prisma.partnerTier.update).toHaveBeenCalledWith({
        where: { id: 'tier-1' },
        data: { discountPercent: '12.50', updatedBy: 'admin-1' },
        include: { _count: { select: { partners: true } } },
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PARTNER_TIER_UPDATED',
          entityId: 'tier-1',
          before: expect.objectContaining({ discountPercent: '0' }),
          after: expect.objectContaining({ discountPercent: '12.50' }),
        }),
      );
      expect(result.discountPercent).toBe('12.50');
    });

    it('maps a missing tier on update and delete to 404', async () => {
      prisma.partnerTier.findUnique.mockResolvedValue(null);

      await expect(
        service.updateTier('tier-404', { name: 'X' }, 'admin-1'),
      ).rejects.toThrow(NotFoundException);
      await expect(service.deleteTier('tier-404', 'admin-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('refuses to delete a tier still assigned to partners with 409', async () => {
      prisma.partnerTier.findUnique.mockResolvedValue(
        tierRow({ id: 'tier-1', _count: { partners: 3 } }),
      );

      await expect(service.deleteTier('tier-1', 'admin-1')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.partnerTier.delete).not.toHaveBeenCalled();
    });

    it('deletes an unreferenced tier and writes one audit entry', async () => {
      prisma.partnerTier.findUnique.mockResolvedValue(
        tierRow({ id: 'tier-1' }),
      );
      prisma.partnerTier.delete.mockResolvedValue(tierRow({ id: 'tier-1' }));

      await service.deleteTier('tier-1', 'admin-1');

      expect(prisma.partnerTier.delete).toHaveBeenCalledWith({
        where: { id: 'tier-1' },
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PARTNER_TIER_DELETED',
          entity: 'PartnerTier',
          entityId: 'tier-1',
        }),
      );
    });
  });

  describe('getDetail', () => {
    it('returns the review detail with documents, tier and profile', async () => {
      prisma.partner.findUnique.mockResolvedValue({
        ...makeDetail(),
        reviewNotes: 'اسناد کامل است',
        tier: {
          id: 'tier-1',
          name: 'Tier 1',
          discountPercent: { toString: () => '10' },
          minOrderQuantity: 5,
        },
        documents: [
          {
            id: 'doc-1',
            type: PartnerDocumentType.BUSINESS_LICENSE,
            originalName: 'license.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 100,
            storageKey: 'partners/partner-1/doc-1.pdf',
            createdAt: new Date('2026-08-15T01:00:00.000Z'),
          },
        ],
      });

      const result = await service.getDetail('partner-1');

      expect(result.id).toBe('partner-1');
      expect(result.reviewNotes).toBe('اسناد کامل است');
      expect(result.tier).toMatchObject({ id: 'tier-1', discountPercent: '10' });
      expect(result.documents).toHaveLength(1);
      expect(result.profile.mobile).toBe('+989123456789');
      expect(JSON.stringify(result)).not.toContain('storageKey');
      expect(prisma.partner.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'partner-1' },
          include: expect.objectContaining({ tier: true }),
        }),
      );
    });

    it('throws 404 when the partner does not exist', async () => {
      prisma.partner.findUnique.mockResolvedValue(null);

      await expect(service.getDetail('partner-missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws 404 for a soft-deleted partner', async () => {
      prisma.partner.findUnique.mockResolvedValue({
        ...makeDetail(),
        deletedAt: new Date('2026-08-16T01:00:00.000Z'),
      });

      await expect(service.getDetail('partner-deleted')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('approve', () => {
    const dto = { tierId: 'tier-1', reviewNotes: 'اسناد کامل است' };

    beforeEach(() => {
      tx.partner.findUnique.mockResolvedValue({
        ...makePartner(),
        profile: { userId: 'applicant-user' },
      });
      tx.partnerTier.findUnique.mockResolvedValue({ id: 'tier-1' });
      tx.businessDocument.count.mockResolvedValue(1);
      tx.partner.updateMany.mockResolvedValue({ count: 1 });
      rolesService.findRoleIdByName.mockResolvedValue('role-partner');
      tx.userRole.upsert.mockResolvedValue({});
      prisma.partner.findUnique.mockResolvedValue(makeDetail());
    });

    it('approves the partner and activates the PARTNER role atomically', async () => {
      await service.approve('partner-1', dto, 'reviewer-1', '1.2.3.4');

      expect(tx.partner.findUnique).toHaveBeenCalledWith({
        where: { id: 'partner-1' },
        include: { profile: { select: { userId: true } } },
      });
      expect(tx.businessDocument.count).toHaveBeenCalledWith({
        where: {
          partnerId: 'partner-1',
          type: PartnerDocumentType.BUSINESS_LICENSE,
          deletedAt: null,
        },
      });
      expect(tx.partner.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'partner-1',
          approvalStatus: PartnerApprovalStatus.PENDING,
          deletedAt: null,
        },
        data: expect.objectContaining({
          approvalStatus: PartnerApprovalStatus.APPROVED,
          approvedAt: expect.any(Date),
          tierId: 'tier-1',
          reviewNotes: 'اسناد کامل است',
          updatedBy: 'reviewer-1',
        }),
      });
      expect(rolesService.findRoleIdByName).toHaveBeenCalledWith(
        AppRole.PARTNER,
        expect.anything(),
      );
      expect(tx.userRole.upsert).toHaveBeenCalledWith({
        where: {
          userId_roleId: { userId: 'applicant-user', roleId: 'role-partner' },
        },
        update: {},
        create: {
          userId: 'applicant-user',
          roleId: 'role-partner',
          assignedBy: 'reviewer-1',
        },
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'reviewer-1',
          action: 'PARTNER_APPROVED',
          entity: 'Partner',
          entityId: 'partner-1',
          ipAddress: '1.2.3.4',
        }),
        expect.anything(),
      );
    });

    it('assigns the role to the applicant, never the reviewer', async () => {
      await service.approve('partner-1', dto, 'reviewer-1');

      const upsert = tx.userRole.upsert.mock.calls[0]![0];
      expect(upsert.create.userId).toBe('applicant-user');
      expect(upsert.create.assignedBy).toBe('reviewer-1');
    });

    it('returns the refreshed partner detail after commit', async () => {
      prisma.partner.findUnique.mockResolvedValue(makeDetail());

      const result = await service.approve('partner-1', dto, 'reviewer-1');

      expect(result.id).toBe('partner-1');
      expect(prisma.partner.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'partner-1' } }),
      );
    });

    it('throws 404 when the partner does not exist', async () => {
      tx.partner.findUnique.mockResolvedValue(null);

      await expect(service.approve('partner-1', dto, 'reviewer-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(tx.partner.updateMany).not.toHaveBeenCalled();
    });

    it('throws 404 for a soft-deleted partner', async () => {
      tx.partner.findUnique.mockResolvedValue({
        ...makePartner(),
        deletedAt: new Date(),
      });

      await expect(service.approve('partner-1', dto, 'reviewer-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws 400 when the tier does not exist', async () => {
      tx.partnerTier.findUnique.mockResolvedValue(null);

      await expect(service.approve('partner-1', dto, 'reviewer-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(tx.partner.updateMany).not.toHaveBeenCalled();
    });

    it('throws 422 when no active business license exists', async () => {
      tx.businessDocument.count.mockResolvedValue(0);

      await expect(service.approve('partner-1', dto, 'reviewer-1')).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(tx.partner.updateMany).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('throws 409 when the state transition loses the race', async () => {
      tx.partner.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.approve('partner-1', dto, 'reviewer-1')).rejects.toThrow(
        ConflictException,
      );
      expect(tx.userRole.upsert).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('throws 409 for double approval (already APPROVED)', async () => {
      tx.partner.findUnique.mockResolvedValue({
        ...makePartner({ approvalStatus: PartnerApprovalStatus.APPROVED }),
        profile: { userId: 'applicant-user' },
      });
      tx.partner.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.approve('partner-1', dto, 'reviewer-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws 409 for approval after rejection', async () => {
      tx.partner.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.approve('partner-1', dto, 'reviewer-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws 500 when the PARTNER role row is missing', async () => {
      rolesService.findRoleIdByName.mockResolvedValue(null);

      await expect(service.approve('partner-1', dto, 'reviewer-1')).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(tx.userRole.upsert).not.toHaveBeenCalled();
    });

    it('writes an audit payload that excludes PII and sensitive data', async () => {
      await service.approve('partner-1', dto, 'reviewer-1');

      const entry = auditService.log.mock.calls[0]![0];
      const serialized = JSON.stringify(entry);
      expect(serialized).not.toContain('nationalId');
      expect(serialized).not.toContain('businessLicenseNo');
      expect(serialized).not.toContain('storageKey');
      expect(entry.before).toEqual({
        approvalStatus: PartnerApprovalStatus.PENDING,
        tierId: null,
      });
      expect(entry.after).toMatchObject({
        approvalStatus: PartnerApprovalStatus.APPROVED,
        tierId: 'tier-1',
        approvedAt: expect.any(String),
      });
    });
  });

  describe('reject', () => {
    const dto = { reason: 'مدارک ناقص است', reviewNotes: 'پیگیری شد' };

    beforeEach(() => {
      tx.partner.findUnique.mockResolvedValue(makePartner());
      tx.partner.updateMany.mockResolvedValue({ count: 1 });
      prisma.partner.findUnique.mockResolvedValue(makeDetail());
    });

    it('rejects a PENDING partner without touching the tier', async () => {
      await service.reject('partner-1', dto, 'reviewer-1', '1.2.3.4');

      expect(tx.partner.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'partner-1',
          approvalStatus: PartnerApprovalStatus.PENDING,
          deletedAt: null,
        },
        data: expect.objectContaining({
          approvalStatus: PartnerApprovalStatus.REJECTED,
          rejectedAt: expect.any(Date),
          rejectionReason: 'مدارک ناقص است',
          reviewNotes: 'پیگیری شد',
          updatedBy: 'reviewer-1',
        }),
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'reviewer-1',
          action: 'PARTNER_REJECTED',
          entityId: 'partner-1',
          ipAddress: '1.2.3.4',
        }),
        expect.anything(),
      );
    });

    it('throws 409 when the partner is not PENDING', async () => {
      tx.partner.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.reject('partner-1', dto, 'reviewer-1')).rejects.toThrow(
        ConflictException,
      );
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('throws 404 when the partner does not exist', async () => {
      tx.partner.findUnique.mockResolvedValue(null);

      await expect(service.reject('partner-1', dto, 'reviewer-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('writes an audit payload without PII', async () => {
      await service.reject('partner-1', dto, 'reviewer-1');

      const entry = auditService.log.mock.calls[0]![0];
      const serialized = JSON.stringify(entry);
      expect(serialized).not.toContain('nationalId');
      expect(serialized).not.toContain('businessLicenseNo');
      expect(entry.before).toEqual({ approvalStatus: PartnerApprovalStatus.PENDING });
      expect(entry.after).toMatchObject({
        approvalStatus: PartnerApprovalStatus.REJECTED,
        rejectedAt: expect.any(String),
        rejectionReason: 'مدارک ناقص است',
      });
    });
  });

  describe('changeTier', () => {
    const dto = { tierId: 'tier-2' };

    beforeEach(() => {
      tx.partner.findUnique.mockResolvedValue(
        makePartner({
          approvalStatus: PartnerApprovalStatus.APPROVED,
          tierId: 'tier-1',
        }),
      );
      tx.partnerTier.findUnique.mockResolvedValue({ id: 'tier-2' });
      tx.partner.updateMany.mockResolvedValue({ count: 1 });
      prisma.partner.findUnique.mockResolvedValue(makeDetail());
    });

    it('changes the tier of an APPROVED partner and audits before/after', async () => {
      await service.changeTier('partner-1', dto, 'reviewer-1', '1.2.3.4');

      expect(tx.partner.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'partner-1',
          approvalStatus: PartnerApprovalStatus.APPROVED,
          tierId: 'tier-1',
          deletedAt: null,
        },
        data: { tierId: 'tier-2', updatedBy: 'reviewer-1' },
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'reviewer-1',
          action: 'PARTNER_TIER_CHANGED',
          entityId: 'partner-1',
          ipAddress: '1.2.3.4',
        }),
        expect.anything(),
      );
      const entry = auditService.log.mock.calls[0]![0];
      expect(entry.before).toEqual({ tierId: 'tier-1' });
      expect(entry.after).toEqual({ tierId: 'tier-2' });
    });

    it('throws 409 for a partner that is not APPROVED', async () => {
      tx.partner.findUnique.mockResolvedValue(
        makePartner({ approvalStatus: PartnerApprovalStatus.REJECTED }),
      );
      tx.partner.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.changeTier('partner-1', dto, 'reviewer-1')).rejects.toThrow(
        ConflictException,
      );
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('throws 400 when the tier does not exist', async () => {
      tx.partnerTier.findUnique.mockResolvedValue(null);

      await expect(service.changeTier('partner-1', dto, 'reviewer-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(tx.partner.updateMany).not.toHaveBeenCalled();
    });

    it('is a no-op without audit when the tier is unchanged', async () => {
      tx.partner.findUnique.mockResolvedValue(
        makePartner({
          approvalStatus: PartnerApprovalStatus.APPROVED,
          tierId: 'tier-1',
        }),
      );
      prisma.partner.findUnique.mockResolvedValue(makeDetail());

      const result = await service.changeTier('partner-1', { tierId: 'tier-1' }, 'reviewer-1');

      expect(tx.partner.updateMany).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
      expect(result.id).toBe('partner-1');
    });

    it('throws 409 when the tier was changed concurrently', async () => {
      tx.partner.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.changeTier('partner-1', dto, 'reviewer-1')).rejects.toThrow(
        ConflictException,
      );
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('throws 404 when the partner does not exist', async () => {
      tx.partner.findUnique.mockResolvedValue(null);

      await expect(service.changeTier('partner-1', dto, 'reviewer-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
