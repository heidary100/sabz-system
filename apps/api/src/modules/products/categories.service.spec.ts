import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CategoriesService } from './categories.service';

const now = new Date('2026-08-19T00:00:00.000Z');

function makeSummaryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cat-1',
    name: 'لپتاپ',
    slug: 'laptop',
    parentId: null,
    sortOrder: 0,
    isVisible: true,
    deletedAt: null,
    ...overrides,
  };
}

function makeDetailRow(overrides: Record<string, unknown> = {}) {
  return {
    ...makeSummaryRow(),
    children: [],
    ...overrides,
  };
}

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: {
    category: {
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
    category: {
      findUnique: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
      count: jest.Mock;
    };
    product: { count: jest.Mock };
  };
  const actorId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    tx = {
      category: {
        findUnique: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
      },
      product: { count: jest.fn() },
    };
    prisma = {
      category: {
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

    service = new CategoriesService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
  });

  describe('list', () => {
    it('builds the query with default pagination, deletedAt null and deterministic ordering', async () => {
      prisma.category.count.mockResolvedValue(1);
      prisma.category.findMany.mockResolvedValue([makeSummaryRow()]);

      const result = await service.list({});

      expect(prisma.category.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
        select: expect.any(Object),
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
        skip: 0,
        take: 20,
      });
      expect(result).toEqual({
        items: [
          {
            id: 'cat-1',
            name: 'لپتاپ',
            slug: 'laptop',
            parentId: null,
            sortOrder: 0,
            isVisible: true,
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      });
    });

    it('respects custom page and limit', async () => {
      prisma.category.count.mockResolvedValue(0);
      prisma.category.findMany.mockResolvedValue([]);
      await service.list({ page: 3, limit: 50 });
      expect(prisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 100, take: 50 }),
      );
    });
  });

  describe('getDetail', () => {
    it('returns a CategoryDetail with children', async () => {
      prisma.category.findUnique.mockResolvedValue(
        makeDetailRow({
          children: [
            { id: 'cat-2', name: 'گیمینگ', slug: 'gaming', parentId: 'cat-1', sortOrder: 1, isVisible: true },
          ],
        }),
      );
      const result = await service.getDetail('cat-1');
      expect(result.children).toHaveLength(1);
      expect(result).not.toHaveProperty('deletedAt');
    });

    it('throws 404 when the category is soft-deleted', async () => {
      prisma.category.findUnique.mockResolvedValue(makeDetailRow({ deletedAt: now }));
      await expect(service.getDetail('cat-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws 404 when the category is missing', async () => {
      prisma.category.findUnique.mockResolvedValue(null);
      await expect(service.getDetail('cat-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    it('creates a category, generates a slug from name, and audits CATEGORY_CREATED', async () => {
      tx.category.create.mockResolvedValue(makeDetailRow({ name: 'Laptop', slug: 'laptop' }));

      const result = await service.create({ name: 'Laptop' }, actorId);

      expect(tx.category.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Laptop',
            slug: 'laptop',
            parentId: null,
            sortOrder: 0,
            isVisible: true,
          }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CATEGORY_CREATED', entity: 'Category', entityId: 'cat-1' }),
        tx,
      );
      expect(result.slug).toBe('laptop');
    });

    it('falls back to a random prefixed slug when the name is non-alphanumeric', async () => {
      tx.category.create.mockResolvedValue(makeDetailRow({ slug: 'category-abcd1234' }));
      await service.create({ name: 'لپتاپ' }, actorId);
      const data = (tx.category.create as jest.Mock).mock.calls[0][0].data;
      expect(data.slug).toMatch(/^category-[0-9a-f]{8}$/);
    });

    it('uses an explicit slug when provided', async () => {
      tx.category.create.mockResolvedValue(makeDetailRow({ slug: 'notebooks' }));
      await service.create({ name: 'لپتاپ', slug: 'notebooks' }, actorId);
      expect(tx.category.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ slug: 'notebooks' }) }),
      );
    });

    it('throws 404 when the parent does not exist', async () => {
      tx.category.create = jest.fn();
      tx.category.findUnique.mockResolvedValue(null);
      await expect(
        service.create({ name: 'لپتاپ', parentId: 'cat-9' }, actorId),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.category.create).not.toHaveBeenCalled();
    });

    it('throws 404 when the parent is soft-deleted', async () => {
      tx.category.findUnique.mockResolvedValue({ id: 'cat-9', deletedAt: now });
      await expect(
        service.create({ name: 'لپتاپ', parentId: 'cat-9' }, actorId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('maps a P2002 duplicate slug to 409', async () => {
      const error = new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: '6',
        meta: { modelName: 'Category' },
      });
      tx.category.create.mockRejectedValue(error);
      await expect(service.create({ name: 'لپتاپ', slug: 'laptop' }, actorId)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('update', () => {
    it('updates changed fields and audits CATEGORY_UPDATED with a delta', async () => {
      tx.category.findUnique
        .mockResolvedValueOnce({ id: 'cat-1', name: 'لپتاپ', slug: 'laptop', parentId: null, sortOrder: 0, isVisible: true, deletedAt: null })
        .mockResolvedValueOnce(makeDetailRow({ name: 'نوتبوک' }));
      tx.category.updateMany.mockResolvedValue({ count: 1 });

      await service.update('cat-1', { name: 'نوتبوک' }, actorId);

      expect(tx.category.updateMany).toHaveBeenCalledWith({
        where: { id: 'cat-1', deletedAt: null },
        data: expect.objectContaining({ name: 'نوتبوک', updatedBy: actorId }),
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CATEGORY_UPDATED',
          before: expect.objectContaining({ name: 'لپتاپ' }),
          after: expect.objectContaining({ name: 'نوتبوک' }),
        }),
        tx,
      );
    });

    it('returns the detail for a no-op update without auditing', async () => {
      tx.category.findUnique
        .mockResolvedValueOnce({ id: 'cat-1', name: 'لپتاپ', slug: 'laptop', parentId: null, sortOrder: 0, isVisible: true, deletedAt: null })
        .mockResolvedValueOnce(makeDetailRow({ name: 'لپتاپ' }));
      const result = await service.update('cat-1', {}, actorId);
      expect(result.name).toBe('لپتاپ');
      expect(tx.category.updateMany).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('throws 404 for a no-op update when the category is concurrently soft-deleted', async () => {
      tx.category.findUnique
        .mockResolvedValueOnce({ id: 'cat-1', name: 'لپتاپ', slug: 'laptop', parentId: null, sortOrder: 0, isVisible: true, deletedAt: null })
        .mockResolvedValueOnce(makeDetailRow({ deletedAt: now }));
      await expect(service.update('cat-1', {}, actorId)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws 404 when the category is missing', async () => {
      tx.category.findUnique.mockResolvedValue(null);
      await expect(service.update('cat-1', { name: 'x' }, actorId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws 404 when a concurrent soft-delete removed it during update', async () => {
      tx.category.findUnique
        .mockResolvedValueOnce({ id: 'cat-1', name: 'لپتاپ', slug: 'laptop', parentId: null, sortOrder: 0, isVisible: true, deletedAt: null })
        .mockResolvedValueOnce(makeDetailRow({ deletedAt: now }));
      tx.category.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.update('cat-1', { name: 'x' }, actorId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(audit.log).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CATEGORY_UPDATED' }),
        tx,
      );
    });

    it('rejects self-parenting with 409', async () => {
      tx.category.findUnique.mockResolvedValue({ id: 'cat-1', name: 'لپتاپ', slug: 'laptop', parentId: null, sortOrder: 0, isVisible: true, deletedAt: null });
      await expect(
        service.update('cat-1', { parentId: 'cat-1' }, actorId),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects moving under a descendant with 409 (cycle)', async () => {
      tx.category.findUnique
        .mockResolvedValueOnce({ id: 'cat-1', name: 'لپتاپ', slug: 'laptop', parentId: null, sortOrder: 0, isVisible: true, deletedAt: null })
        .mockResolvedValueOnce({ id: 'cat-2', deletedAt: null })
        .mockResolvedValueOnce({ id: 'cat-3', parentId: 'cat-1', deletedAt: null });
      await expect(
        service.update('cat-1', { parentId: 'cat-3' }, actorId),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('allows moving to root (parentId null)', async () => {
      tx.category.findUnique
        .mockResolvedValueOnce({ id: 'cat-1', name: 'لپتاپ', slug: 'laptop', parentId: 'cat-2', sortOrder: 0, isVisible: true, deletedAt: null })
        .mockResolvedValueOnce(makeDetailRow({ parentId: null }));
      tx.category.updateMany.mockResolvedValue({ count: 1 });

      await service.update('cat-1', { parentId: null }, actorId);
      expect(tx.category.updateMany).toHaveBeenCalledWith({
        where: { id: 'cat-1', deletedAt: null },
        data: expect.objectContaining({ parentId: null, updatedBy: actorId }),
      });
    });

    it('maps a P2002 duplicate slug to 409', async () => {
      tx.category.findUnique.mockResolvedValue({ id: 'cat-1', name: 'لپتاپ', slug: 'laptop', parentId: null, sortOrder: 0, isVisible: true, deletedAt: null });
      const error = new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: '6',
        meta: { modelName: 'Category' },
      });
      tx.category.updateMany.mockRejectedValue(error);
      await expect(service.update('cat-1', { slug: 'taken' }, actorId)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('softDelete', () => {
    it('soft-deletes a category with no children or active products and audits CATEGORY_DELETED', async () => {
      tx.category.findUnique
        .mockResolvedValueOnce({ id: 'cat-1', deletedAt: null })
        .mockResolvedValueOnce(makeDetailRow({ deletedAt: now }));
      tx.category.count.mockResolvedValue(0);
      tx.product.count.mockResolvedValue(0);
      tx.category.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.softDelete('cat-1', actorId);

      expect(tx.category.updateMany).toHaveBeenCalledWith({
        where: { id: 'cat-1', deletedAt: null },
        data: expect.objectContaining({ deletedAt: expect.any(Date), updatedBy: actorId }),
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CATEGORY_DELETED',
          after: expect.objectContaining({ deletedAt: expect.any(String) }),
        }),
        tx,
      );
      expect(result).not.toHaveProperty('deletedAt');
    });

    it('rejects deletion when active children exist with 409', async () => {
      tx.category.findUnique.mockResolvedValueOnce({ id: 'cat-1', deletedAt: null });
      tx.category.count.mockResolvedValue(2);
      await expect(service.softDelete('cat-1', actorId)).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects deletion when active products reference it with 409', async () => {
      tx.category.findUnique.mockResolvedValueOnce({ id: 'cat-1', deletedAt: null });
      tx.category.count.mockResolvedValue(0);
      tx.product.count.mockResolvedValue(1);
      await expect(service.softDelete('cat-1', actorId)).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws 404 when the category is already deleted', async () => {
      tx.category.findUnique.mockResolvedValue({ id: 'cat-1', deletedAt: now });
      await expect(service.softDelete('cat-1', actorId)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws 404 when a concurrent mutation removed it (updateMany count 0)', async () => {
      tx.category.findUnique.mockResolvedValueOnce({ id: 'cat-1', deletedAt: null });
      tx.category.count.mockResolvedValue(0);
      tx.product.count.mockResolvedValue(0);
      tx.category.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.softDelete('cat-1', actorId)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('audit payload safety', () => {
    it('never includes createdBy/updatedBy in category mutation payloads', async () => {
      tx.category.create.mockResolvedValue(makeDetailRow());
      await service.create({ name: 'لپتاپ' }, actorId);
      const call = audit.log.mock.calls[0][0];
      expect(JSON.stringify(call.after)).not.toContain('createdBy');
      expect(JSON.stringify(call.after)).not.toContain('updatedBy');
      expect(JSON.stringify(call.after)).not.toContain('logoKey');
    });
  });
});
