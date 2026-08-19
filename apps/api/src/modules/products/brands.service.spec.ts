import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BrandsService } from './brands.service';

const now = new Date('2026-08-19T00:00:00.000Z');

function makeSummaryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'brand-1',
    name: 'دل',
    slug: 'dell',
    description: null,
    isFeatured: false,
    deletedAt: null,
    ...overrides,
  };
}

describe('BrandsService', () => {
  let service: BrandsService;
  let prisma: {
    brand: {
      count: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    product: { count: jest.Mock };
    $transaction: jest.Mock;
  };
  let audit: { log: jest.Mock };
  let tx: {
    brand: {
      findUnique: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    product: { count: jest.Mock };
  };
  const actorId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    tx = {
      brand: {
        findUnique: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      product: { count: jest.fn() },
    };
    prisma = {
      brand: {
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      product: { count: jest.fn() },
      $transaction: jest.fn(),
    };
    audit = { log: jest.fn() };

    prisma.$transaction.mockImplementation((arg: unknown) => {
      if (typeof arg === 'function') {
        return arg(tx);
      }
      if (Array.isArray(arg)) {
        return Promise.all(arg as Promise<unknown>[]);
      }
      return arg;
    });

    service = new BrandsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
  });

  describe('list', () => {
    it('builds the query with default pagination, deletedAt null and deterministic ordering', async () => {
      prisma.brand.count.mockResolvedValue(1);
      prisma.brand.findMany.mockResolvedValue([makeSummaryRow()]);

      const result = await service.list({});

      expect(prisma.brand.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
        select: expect.any(Object),
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: 0,
        take: 20,
      });
      expect(result).toEqual({
        items: [
          { id: 'brand-1', name: 'دل', slug: 'dell', description: null, isFeatured: false },
        ],
        total: 1,
        page: 1,
        limit: 20,
      });
    });
  });

  describe('getDetail', () => {
    it('returns a BrandSummary without internal fields', async () => {
      prisma.brand.findUnique.mockResolvedValue(makeSummaryRow());
      const result = await service.getDetail('brand-1');
      expect(result).toEqual({
        id: 'brand-1',
        name: 'دل',
        slug: 'dell',
        description: null,
        isFeatured: false,
      });
      expect(result).not.toHaveProperty('logoKey');
      expect(result).not.toHaveProperty('deletedAt');
      expect(result).not.toHaveProperty('createdBy');
    });

    it('throws 404 when the brand is soft-deleted', async () => {
      prisma.brand.findUnique.mockResolvedValue(makeSummaryRow({ deletedAt: now }));
      await expect(service.getDetail('brand-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws 404 when the brand is missing', async () => {
      prisma.brand.findUnique.mockResolvedValue(null);
      await expect(service.getDetail('brand-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    it('creates a brand, generates a slug, defaults isFeatured false, and audits BRAND_CREATED', async () => {
      tx.brand.create.mockResolvedValue(makeSummaryRow({ name: 'Dell', slug: 'dell' }));

      const result = await service.create({ name: 'Dell' }, actorId);

      expect(tx.brand.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Dell',
            slug: 'dell',
            description: null,
            isFeatured: false,
          }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'BRAND_CREATED', entity: 'Brand', entityId: 'brand-1' }),
        tx,
      );
      expect(result.isFeatured).toBe(false);
    });

    it('falls back to a random prefixed slug when the name is non-alphanumeric', async () => {
      tx.brand.create.mockResolvedValue(makeSummaryRow({ slug: 'brand-abcd1234' }));
      await service.create({ name: 'دل' }, actorId);
      const data = (tx.brand.create as jest.Mock).mock.calls[0][0].data;
      expect(data.slug).toMatch(/^brand-[0-9a-f]{8}$/);
    });

    it('persists an explicit isFeatured true', async () => {
      tx.brand.create.mockResolvedValue(makeSummaryRow({ isFeatured: true }));
      await service.create({ name: 'دل', isFeatured: true }, actorId);
      expect(tx.brand.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isFeatured: true }) }),
      );
    });

    it('maps a P2002 duplicate slug to 409', async () => {
      const error = new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: '6',
        meta: { modelName: 'Brand' },
      });
      tx.brand.create.mockRejectedValue(error);
      await expect(service.create({ name: 'دل', slug: 'dell' }, actorId)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('update', () => {
    it('updates changed fields including isFeatured and audits BRAND_UPDATED', async () => {
      tx.brand.findUnique
        .mockResolvedValueOnce({ id: 'brand-1', name: 'دل', slug: 'dell', description: null, isFeatured: false, deletedAt: null })
        .mockResolvedValueOnce(makeSummaryRow({ isFeatured: true }));
      tx.brand.updateMany.mockResolvedValue({ count: 1 });

      await service.update('brand-1', { isFeatured: true }, actorId);

      expect(tx.brand.updateMany).toHaveBeenCalledWith({
        where: { id: 'brand-1', deletedAt: null },
        data: expect.objectContaining({ isFeatured: true, updatedBy: actorId }),
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'BRAND_UPDATED',
          before: expect.objectContaining({ isFeatured: false }),
          after: expect.objectContaining({ isFeatured: true }),
        }),
        tx,
      );
    });

    it('returns the detail for a no-op update without auditing', async () => {
      tx.brand.findUnique
        .mockResolvedValueOnce({ id: 'brand-1', name: 'دل', slug: 'dell', description: null, isFeatured: false, deletedAt: null })
        .mockResolvedValueOnce(makeSummaryRow());
      const result = await service.update('brand-1', {}, actorId);
      expect(result.name).toBe('دل');
      expect(tx.brand.updateMany).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('throws 404 for a no-op update when the brand is concurrently soft-deleted', async () => {
      tx.brand.findUnique
        .mockResolvedValueOnce({ id: 'brand-1', name: 'دل', slug: 'dell', description: null, isFeatured: false, deletedAt: null })
        .mockResolvedValueOnce(makeSummaryRow({ deletedAt: now }));
      await expect(service.update('brand-1', {}, actorId)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws 404 when the brand is missing', async () => {
      tx.brand.findUnique.mockResolvedValue(null);
      await expect(service.update('brand-1', { name: 'x' }, actorId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws 404 when a concurrent soft-delete removed it during update', async () => {
      tx.brand.findUnique
        .mockResolvedValueOnce({ id: 'brand-1', name: 'دل', slug: 'dell', description: null, isFeatured: false, deletedAt: null })
        .mockResolvedValueOnce(makeSummaryRow({ deletedAt: now }));
      tx.brand.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.update('brand-1', { name: 'x' }, actorId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(audit.log).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'BRAND_UPDATED' }),
        tx,
      );
    });

    it('maps a P2002 duplicate slug to 409', async () => {
      tx.brand.findUnique.mockResolvedValue({ id: 'brand-1', name: 'دل', slug: 'dell', description: null, isFeatured: false, deletedAt: null });
      const error = new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: '6',
        meta: { modelName: 'Brand' },
      });
      tx.brand.updateMany.mockRejectedValue(error);
      await expect(service.update('brand-1', { slug: 'taken' }, actorId)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('softDelete', () => {
    it('soft-deletes a brand with no active products and audits BRAND_DELETED', async () => {
      tx.brand.findUnique
        .mockResolvedValueOnce({ id: 'brand-1', deletedAt: null })
        .mockResolvedValueOnce(makeSummaryRow({ deletedAt: now }));
      tx.product.count.mockResolvedValue(0);
      tx.brand.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.softDelete('brand-1', actorId);

      expect(tx.brand.updateMany).toHaveBeenCalledWith({
        where: { id: 'brand-1', deletedAt: null },
        data: expect.objectContaining({ deletedAt: expect.any(Date), updatedBy: actorId }),
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'BRAND_DELETED',
          after: expect.objectContaining({ deletedAt: expect.any(String) }),
        }),
        tx,
      );
      expect(result).not.toHaveProperty('logoKey');
    });

    it('rejects deletion when active products reference it with 409', async () => {
      tx.brand.findUnique.mockResolvedValueOnce({ id: 'brand-1', deletedAt: null });
      tx.product.count.mockResolvedValue(3);
      await expect(service.softDelete('brand-1', actorId)).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws 404 when the brand is already deleted', async () => {
      tx.brand.findUnique.mockResolvedValue({ id: 'brand-1', deletedAt: now });
      await expect(service.softDelete('brand-1', actorId)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('audit payload safety', () => {
    it('never includes createdBy/updatedBy/logoKey in brand mutation payloads', async () => {
      tx.brand.create.mockResolvedValue(makeSummaryRow());
      await service.create({ name: 'دل', isFeatured: true }, actorId);
      const call = audit.log.mock.calls[0][0];
      expect(JSON.stringify(call.after)).not.toContain('createdBy');
      expect(JSON.stringify(call.after)).not.toContain('updatedBy');
      expect(JSON.stringify(call.after)).not.toContain('logoKey');
    });
  });
});
