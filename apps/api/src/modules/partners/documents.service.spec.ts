import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Partner, PartnerApprovalStatus, PartnerDocumentType } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DocumentNotFoundError, DocumentStorage } from './storage/document-storage';
import { DocumentsService } from './documents.service';

function makePartner(overrides: Partial<Partner> = {}): Partner {
  const now = new Date('2026-08-16T00:00:00.000Z');
  return {
    id: 'partner-1',
    profileId: 'profile-1',
    businessName: 'اکسیر الکترونیک',
    businessLicenseNo: 'LIC-123',
    nationalId: null,
    website: null,
    address: 'تهران',
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

function makeFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'license.pdf',
    encoding: '7bit',
    mimetype: 'application/pdf',
    size: 100,
    buffer: Buffer.from('%PDF-1.7 test pdf content'),
    stream: undefined as never,
    destination: '',
    filename: '',
    path: '',
    ...overrides,
  };
}

function makeTx(tx: unknown): never {
  return tx as never;
}

describe('DocumentsService', () => {
  let service: DocumentsService;
  let prisma: {
    userProfile: { findUnique: jest.Mock };
    partner: { findUnique: jest.Mock };
    businessDocument: { findFirst: jest.Mock; findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let tx: {
    partner: { findFirst: jest.Mock };
    businessDocument: { create: jest.Mock; findFirst: jest.Mock; updateMany: jest.Mock };
    auditLog: { create: jest.Mock };
    $queryRaw: jest.Mock;
  };
  let auditService: { log: jest.Mock };
  let storage: {
    put: jest.Mock;
    get: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(() => {
    tx = {
      partner: { findFirst: jest.fn() },
      businessDocument: {
        create: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
      },
      auditLog: { create: jest.fn() },
      $queryRaw: jest.fn(),
    };
    prisma = {
      userProfile: { findUnique: jest.fn() },
      partner: { findUnique: jest.fn() },
      businessDocument: { findFirst: jest.fn(), findMany: jest.fn() },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (callback: (client: unknown) => unknown) => callback(makeTx(tx)),
    );
    auditService = { log: jest.fn() };
    storage = {
      put: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(Buffer.from('binary')),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    service = new DocumentsService(
      prisma as unknown as PrismaService,
      auditService as unknown as AuditService,
      storage as unknown as DocumentStorage,
    );
  });

  describe('upload', () => {
    beforeEach(() => {
      prisma.userProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        firstName: 'علی',
        lastName: 'احمدی',
      });
      prisma.partner.findUnique.mockResolvedValue(makePartner());
      prisma.businessDocument.findFirst.mockResolvedValue(null);
      tx.$queryRaw.mockResolvedValue([
        { approvalStatus: PartnerApprovalStatus.DRAFT, deletedAt: null },
      ]);
      tx.businessDocument.findFirst.mockResolvedValue(null);
      tx.businessDocument.updateMany.mockResolvedValue({ count: 1 });
      tx.businessDocument.create.mockResolvedValue({
        id: 'doc-1',
        type: PartnerDocumentType.BUSINESS_LICENSE,
        originalName: 'license.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        storageKey: 'partners/partner-1/doc-1.pdf',
        createdAt: new Date('2026-08-16T00:00:00.000Z'),
      });
    });

    it('uploads a valid PDF and returns a summary without a storage key', async () => {
      const result = await service.upload(
        'user-1',
        PartnerDocumentType.BUSINESS_LICENSE,
        makeFile(),
      );

      expect(storage.put).toHaveBeenCalledTimes(1);
      const key = (storage.put.mock.calls[0] as unknown as [string])[0];
      expect(key).toMatch(/^partners\/partner-1\/[0-9a-f-]{36}\.pdf$/);
      expect(tx.businessDocument.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            partnerId: 'partner-1',
            type: PartnerDocumentType.BUSINESS_LICENSE,
            mimeType: 'application/pdf',
            originalName: 'license.pdf',
            storageKey: key,
          }),
        }),
      );
      expect(result.id).toBe('doc-1');
      expect(JSON.stringify(result)).not.toContain('storageKey');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PARTNER_DOCUMENT_UPLOADED' }),
        expect.anything(),
      );
    });

    it('uses a safe extension derived from the validated MIME type', async () => {
      await service.upload(
        'user-1',
        PartnerDocumentType.TAX_REGISTRATION,
        makeFile({ mimetype: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]) }),
      );
      const key = (storage.put.mock.calls[0] as unknown as [string])[0];
      expect(key).toMatch(/\.png$/);

      await service.upload(
        'user-1',
        PartnerDocumentType.SUPPORTING,
        makeFile({ mimetype: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]) }),
      );
      const jpegKey = (storage.put.mock.calls[1] as unknown as [string])[0];
      expect(jpegKey).toMatch(/\.jpg$/);
    });

    it('rejects a disallowed MIME type', async () => {
      await expect(
        service.upload(
          'user-1',
          PartnerDocumentType.SUPPORTING,
          makeFile({ mimetype: 'text/plain', buffer: Buffer.from('hello') }),
        ),
      ).rejects.toThrow(BadRequestException);
      expect(storage.put).not.toHaveBeenCalled();
    });

    it('rejects a MIME/magic mismatch', async () => {
      await expect(
        service.upload(
          'user-1',
          PartnerDocumentType.SUPPORTING,
          makeFile({ mimetype: 'application/pdf', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2]) }),
        ),
      ).rejects.toThrow(BadRequestException);
      expect(storage.put).not.toHaveBeenCalled();
    });

    it('rejects an oversized file', async () => {
      const oversized = Buffer.alloc(11 * 1024 * 1024);
      await expect(
        service.upload(
          'user-1',
          PartnerDocumentType.SUPPORTING,
          makeFile({ buffer: oversized }),
        ),
      ).rejects.toThrow(BadRequestException);
      expect(storage.put).not.toHaveBeenCalled();
    });

    it('blocks uploads while the application is PENDING', async () => {
      prisma.partner.findUnique.mockResolvedValue(
        makePartner({ approvalStatus: PartnerApprovalStatus.PENDING }),
      );

      await expect(
        service.upload('user-1', PartnerDocumentType.SUPPORTING, makeFile()),
      ).rejects.toThrow(ConflictException);
      expect(storage.put).not.toHaveBeenCalled();
    });

    it('blocks uploads while the application is APPROVED', async () => {
      prisma.partner.findUnique.mockResolvedValue(
        makePartner({ approvalStatus: PartnerApprovalStatus.APPROVED }),
      );

      await expect(
        service.upload('user-1', PartnerDocumentType.SUPPORTING, makeFile()),
      ).rejects.toThrow(ConflictException);
      expect(storage.put).not.toHaveBeenCalled();
    });

    it('replaces an existing active document of the same type', async () => {
      tx.businessDocument.findFirst.mockResolvedValue({
        id: 'old-doc',
        storageKey: 'partners/partner-1/old-doc.pdf',
        type: PartnerDocumentType.BUSINESS_LICENSE,
      });

      await service.upload('user-1', PartnerDocumentType.BUSINESS_LICENSE, makeFile());

      expect(tx.businessDocument.updateMany).toHaveBeenCalledWith({
        where: { id: 'old-doc', deletedAt: null },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PARTNER_DOCUMENT_REMOVED',
          entityId: 'old-doc',
        }),
        expect.anything(),
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PARTNER_DOCUMENT_UPLOADED' }),
        expect.anything(),
      );
      expect(storage.delete).toHaveBeenCalledWith('partners/partner-1/old-doc.pdf');
    });

    it('aborts with 409 when a concurrent upload already replaced the document', async () => {
      tx.businessDocument.findFirst.mockResolvedValue({
        id: 'old-doc',
        storageKey: 'partners/partner-1/old-doc.pdf',
        type: PartnerDocumentType.BUSINESS_LICENSE,
      });
      tx.businessDocument.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.upload('user-1', PartnerDocumentType.BUSINESS_LICENSE, makeFile()),
      ).rejects.toThrow(ConflictException);

      expect(auditService.log).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PARTNER_DOCUMENT_UPLOADED' }),
        expect.anything(),
      );
      const key = (storage.put.mock.calls[0] as unknown as [string])[0];
      expect(storage.delete).toHaveBeenCalledWith(key);
    });

    it('aborts with 409 and cleans the binary when the application becomes locked mid-upload', async () => {
      tx.$queryRaw.mockResolvedValue([
        { approvalStatus: PartnerApprovalStatus.PENDING, deletedAt: null },
      ]);

      await expect(
        service.upload('user-1', PartnerDocumentType.SUPPORTING, makeFile()),
      ).rejects.toThrow(ConflictException);

      expect(tx.businessDocument.create).not.toHaveBeenCalled();
      const key = (storage.put.mock.calls[0] as unknown as [string])[0];
      expect(storage.delete).toHaveBeenCalledWith(key);
    });

    it('cleans up the new binary when the database write fails', async () => {
      tx.businessDocument.create.mockRejectedValue(new Error('db down'));

      await expect(
        service.upload('user-1', PartnerDocumentType.SUPPORTING, makeFile()),
      ).rejects.toThrow('db down');

      expect(storage.put).toHaveBeenCalledTimes(1);
      const key = (storage.put.mock.calls[0] as unknown as [string])[0];
      expect(storage.delete).toHaveBeenCalledWith(key);
    });

    it('does not fail the request when the replaced binary cleanup fails', async () => {
      const loggerSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      tx.businessDocument.findFirst.mockResolvedValue({
        id: 'old-doc',
        storageKey: 'partners/partner-1/old-doc.pdf',
        type: PartnerDocumentType.BUSINESS_LICENSE,
      });
      storage.delete.mockRejectedValue(new Error('fs error'));

      await expect(
        service.upload('user-1', PartnerDocumentType.BUSINESS_LICENSE, makeFile()),
      ).resolves.toBeDefined();
      expect(storage.delete).toHaveBeenCalledWith('partners/partner-1/old-doc.pdf');

      loggerSpy.mockRestore();
    });

    it('never derives the storage key from the original filename', async () => {
      const sneakyName = '../../../../escape.pdf';
      await service.upload(
        'user-1',
        PartnerDocumentType.SUPPORTING,
        makeFile({ originalname: sneakyName }),
      );

      const key = (storage.put.mock.calls[0] as unknown as [string])[0];
      expect(key).not.toContain('escape');
      expect(key).not.toContain('..');
    });
  });

  describe('list', () => {
    it('returns only active documents without storage keys', async () => {
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

      const result = await service.list('user-1');

      expect(result).toHaveLength(1);
      expect(JSON.stringify(result)).not.toContain('storageKey');
      expect(prisma.businessDocument.findMany).toHaveBeenCalledWith({
        where: { partnerId: 'partner-1', deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
    });

    it('throws 404 when the user has no partner', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        firstName: 'علی',
        lastName: 'احمدی',
      });
      prisma.partner.findUnique.mockResolvedValue(null);

      await expect(service.list('user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getBinary', () => {
    it('returns the binary for an owned document', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        firstName: 'علی',
        lastName: 'احمدی',
      });
      prisma.partner.findUnique.mockResolvedValue(makePartner());
      prisma.businessDocument.findFirst.mockResolvedValue({
        id: 'doc-1',
        type: PartnerDocumentType.BUSINESS_LICENSE,
        originalName: 'license.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        storageKey: 'partners/partner-1/doc-1.pdf',
        createdAt: new Date('2026-08-16T00:00:00.000Z'),
      });
      storage.get.mockResolvedValue(Buffer.from('%PDF-1.7'));

      const { buffer, summary } = await service.getBinary('user-1', 'doc-1');

      expect(buffer.toString()).toBe('%PDF-1.7');
      expect(summary.id).toBe('doc-1');
      expect(prisma.businessDocument.findFirst).toHaveBeenCalledWith({
        where: { id: 'doc-1', partnerId: 'partner-1', deletedAt: null },
      });
    });

    it('throws 404 for a document that is not owned', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        firstName: 'علی',
        lastName: 'احمدی',
      });
      prisma.partner.findUnique.mockResolvedValue(makePartner());
      prisma.businessDocument.findFirst.mockResolvedValue(null);

      await expect(service.getBinary('user-1', 'doc-other')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('maps a missing stored binary to 404', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        firstName: 'علی',
        lastName: 'احمدی',
      });
      prisma.partner.findUnique.mockResolvedValue(makePartner());
      prisma.businessDocument.findFirst.mockResolvedValue({
        id: 'doc-1',
        type: PartnerDocumentType.BUSINESS_LICENSE,
        originalName: 'license.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        storageKey: 'partners/partner-1/doc-1.pdf',
        createdAt: new Date('2026-08-16T00:00:00.000Z'),
      });
      storage.get.mockRejectedValue(new DocumentNotFoundError('partners/partner-1/doc-1.pdf'));

      await expect(service.getBinary('user-1', 'doc-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getBinaryByPartner', () => {
    const document = {
      id: 'doc-1',
      type: PartnerDocumentType.BUSINESS_LICENSE,
      originalName: 'license.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 100,
      storageKey: 'partners/partner-1/doc-1.pdf',
      createdAt: new Date('2026-08-16T00:00:00.000Z'),
    };

    it('returns the binary for a document scoped to the given partner', async () => {
      prisma.businessDocument.findFirst.mockResolvedValue(document);
      storage.get.mockResolvedValue(Buffer.from('%PDF-1.7'));

      const { buffer, summary } = await service.getBinaryByPartner('partner-1', 'doc-1');

      expect(buffer.toString()).toBe('%PDF-1.7');
      expect(summary.id).toBe('doc-1');
      expect(prisma.businessDocument.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'doc-1',
          partnerId: 'partner-1',
          deletedAt: null,
          partner: { deletedAt: null },
        },
      });
      expect(JSON.stringify(summary)).not.toContain('storageKey');
    });

    it('throws 404 when the document belongs to another partner', async () => {
      prisma.businessDocument.findFirst.mockResolvedValue(null);

      await expect(service.getBinaryByPartner('partner-1', 'doc-other')).rejects.toThrow(
        NotFoundException,
      );
      expect(storage.get).not.toHaveBeenCalled();
    });

    it('throws 404 for a soft-deleted document', async () => {
      prisma.businessDocument.findFirst.mockResolvedValue(null);

      await expect(service.getBinaryByPartner('partner-1', 'doc-deleted')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws 404 when the owning partner is soft-deleted', async () => {
      prisma.businessDocument.findFirst.mockResolvedValue(null);

      await expect(service.getBinaryByPartner('partner-1', 'doc-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.businessDocument.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ partner: { deletedAt: null } }),
        }),
      );
    });

    it('maps a missing stored binary to 404', async () => {
      prisma.businessDocument.findFirst.mockResolvedValue(document);
      storage.get.mockRejectedValue(new DocumentNotFoundError('partners/partner-1/doc-1.pdf'));

      await expect(service.getBinaryByPartner('partner-1', 'doc-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    beforeEach(() => {
      prisma.userProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        firstName: 'علی',
        lastName: 'احمدی',
      });
      prisma.partner.findUnique.mockResolvedValue(makePartner());
      prisma.businessDocument.findFirst.mockResolvedValue({
        id: 'doc-1',
        type: PartnerDocumentType.SUPPORTING,
        originalName: 'support.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        storageKey: 'partners/partner-1/doc-1.pdf',
        createdAt: new Date('2026-08-16T00:00:00.000Z'),
      });
      tx.$queryRaw.mockResolvedValue([
        { approvalStatus: PartnerApprovalStatus.DRAFT, deletedAt: null },
      ]);
      tx.businessDocument.updateMany.mockResolvedValue({ count: 1 });
    });

    it('soft-deletes the row and removes the binary after commit', async () => {
      await service.remove('user-1', 'doc-1');

      expect(tx.businessDocument.updateMany).toHaveBeenCalledWith({
        where: { id: 'doc-1', deletedAt: null },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PARTNER_DOCUMENT_REMOVED',
          entity: 'BusinessDocument',
          entityId: 'doc-1',
        }),
        expect.anything(),
      );
      expect(storage.delete).toHaveBeenCalledWith('partners/partner-1/doc-1.pdf');
    });

    it('aborts with 409 when the application becomes locked mid-removal', async () => {
      tx.$queryRaw.mockResolvedValue([
        { approvalStatus: PartnerApprovalStatus.PENDING, deletedAt: null },
      ]);

      await expect(service.remove('user-1', 'doc-1')).rejects.toThrow(
        ConflictException,
      );
      expect(tx.businessDocument.updateMany).not.toHaveBeenCalled();
    });

    it('does not fail when the binary removal fails after commit', async () => {
      storage.delete.mockRejectedValue(new Error('fs error'));
      const loggerSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

      await expect(service.remove('user-1', 'doc-1')).resolves.toBeUndefined();

      loggerSpy.mockRestore();
    });

    it('blocks removal while the application is PENDING', async () => {
      prisma.partner.findUnique.mockResolvedValue(
        makePartner({ approvalStatus: PartnerApprovalStatus.PENDING }),
      );

      await expect(service.remove('user-1', 'doc-1')).rejects.toThrow(
        ConflictException,
      );
      expect(tx.businessDocument.updateMany).not.toHaveBeenCalled();
    });

    it('blocks removal while the application is APPROVED', async () => {
      prisma.partner.findUnique.mockResolvedValue(
        makePartner({ approvalStatus: PartnerApprovalStatus.APPROVED }),
      );

      await expect(service.remove('user-1', 'doc-1')).rejects.toThrow(
        ConflictException,
      );
      expect(tx.businessDocument.updateMany).not.toHaveBeenCalled();
    });

    it('throws 404 for a document that is not owned', async () => {
      prisma.businessDocument.findFirst.mockResolvedValue(null);

      await expect(service.remove('user-1', 'doc-other')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
