import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, WarehouseStatus } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { WarehousesService } from './warehouses.service';

const now = new Date('2026-08-20T00:00:00.000Z');

function makeDetailRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wh-1',
    code: 'WH-01',
    name: 'انبار تهران',
    address: null,
    contactName: null,
    contactPhone: null,
    status: WarehouseStatus.ACTIVE,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

describe('WarehousesService', () => {
  let service: WarehousesService;
  let prisma: {
    warehouse: {
      count: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let audit: { log: jest.Mock };
  let tx: {
    warehouse: {
      findUnique: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    $queryRaw: jest.Mock;
  };
  const actorId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    tx = {
      warehouse: {
        findUnique: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      $queryRaw: jest.fn(),
    };
    prisma = {
      warehouse: {
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    prisma.$transaction.mockImplementation((arg: unknown) => {
      if (typeof arg === 'function') {
        return arg(tx);
      }
      if (Array.isArray(arg)) {
        return Promise.all(arg as Promise<unknown>[]);
      }
      return arg;
    });

    service = new WarehousesService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
  });

  describe('list', () => {
    it('builds the query with default pagination, deletedAt null and deterministic ordering', async () => {
      prisma.warehouse.count.mockResolvedValue(1);
      prisma.warehouse.findMany.mockResolvedValue([
        { id: 'wh-1', code: 'WH-01', name: 'انبار تهران', status: WarehouseStatus.ACTIVE },
      ]);

      const result = await service.list({});

      expect(prisma.warehouse.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
        select: expect.any(Object),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 0,
        take: 20,
      });
      expect(result).toEqual({
        items: [{ id: 'wh-1', code: 'WH-01', name: 'انبار تهران', status: WarehouseStatus.ACTIVE }],
        total: 1,
        page: 1,
        limit: 20,
      });
    });

    it('applies status filter, search OR semantics and escaped contains', async () => {
      prisma.warehouse.count.mockResolvedValue(0);
      prisma.warehouse.findMany.mockResolvedValue([]);

      await service.list({ page: 2, limit: 10, status: WarehouseStatus.INACTIVE, search: 'تهران' });

      const where = (prisma.warehouse.findMany as jest.Mock).mock.calls[0][0].where;
      expect(where).toEqual({
        deletedAt: null,
        status: WarehouseStatus.INACTIVE,
        OR: [
          { name: { contains: 'تهران', mode: 'insensitive' } },
          { code: { contains: 'تهران', mode: 'insensitive' } },
        ],
      });
      expect((prisma.warehouse.findMany as jest.Mock).mock.calls[0][0]).toEqual(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });

    it('escapes LIKE wildcards in the search term', async () => {
      prisma.warehouse.count.mockResolvedValue(0);
      prisma.warehouse.findMany.mockResolvedValue([]);

      await service.list({ search: 'WH_%01' });

      const where = (prisma.warehouse.findMany as jest.Mock).mock.calls[0][0].where;
      expect(where.OR[0].name.contains).toBe('WH\\_\\%01');
      expect(where.OR[1].code.contains).toBe('WH\\_\\%01');
    });

    it('uses page 1 and limit 20 defaults when query is empty', async () => {
      prisma.warehouse.count.mockResolvedValue(0);
      prisma.warehouse.findMany.mockResolvedValue([]);

      await service.list({});

      const call = (prisma.warehouse.findMany as jest.Mock).mock.calls[0][0];
      expect(call.skip).toBe(0);
      expect(call.take).toBe(20);
    });
  });

  describe('getDetail', () => {
    it('returns a WarehouseDetail without internal fields', async () => {
      prisma.warehouse.findUnique.mockResolvedValue(
        makeDetailRow({
          address: 'تهران، خیابان ولیعصر',
          contactName: 'علی رضایی',
          contactPhone: '02112345678',
        }),
      );
      const result = await service.getDetail('wh-1');
      expect(result).toEqual({
        id: 'wh-1',
        code: 'WH-01',
        name: 'انبار تهران',
        address: 'تهران، خیابان ولیعصر',
        contactName: 'علی رضایی',
        contactPhone: '02112345678',
        status: WarehouseStatus.ACTIVE,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });
      expect(result).not.toHaveProperty('deletedAt');
      expect(result).not.toHaveProperty('createdBy');
      expect(result).not.toHaveProperty('updatedBy');
    });

    it('throws 404 when the warehouse is soft-deleted', async () => {
      prisma.warehouse.findUnique.mockResolvedValue(makeDetailRow({ deletedAt: now }));
      await expect(service.getDetail('wh-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws 404 when the warehouse is missing', async () => {
      prisma.warehouse.findUnique.mockResolvedValue(null);
      await expect(service.getDetail('wh-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    it('creates a warehouse, defaults ACTIVE, and audits WAREHOUSE_CREATED', async () => {
      tx.warehouse.create.mockResolvedValue(makeDetailRow());

      const result = await service.create({ code: 'WH-01', name: 'انبار تهران' }, actorId);

      expect(tx.warehouse.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            code: 'WH-01',
            name: 'انبار تهران',
            address: null,
            contactName: null,
            contactPhone: null,
            createdBy: actorId,
          }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'WAREHOUSE_CREATED',
          entity: 'Warehouse',
          entityId: 'wh-1',
          before: null,
        }),
        tx,
      );
      expect(result.status).toBe(WarehouseStatus.ACTIVE);
    });

    it('persists optional contact/address fields and includes them in the audit after payload', async () => {
      tx.warehouse.create.mockResolvedValue(
        makeDetailRow({
          address: 'تهران',
          contactName: 'علی',
          contactPhone: '021111',
        }),
      );

      await service.create(
        { code: 'WH-01', name: 'انبار تهران', address: 'تهران', contactName: 'علی', contactPhone: '021111' },
        actorId,
      );

      const entry = audit.log.mock.calls[0][0];
      expect(entry.after).toEqual({
        code: 'WH-01',
        name: 'انبار تهران',
        status: WarehouseStatus.ACTIVE,
        address: 'تهران',
        contactName: 'علی',
        contactPhone: '021111',
      });
    });

    it('omits null optional fields from the create audit after payload', async () => {
      tx.warehouse.create.mockResolvedValue(makeDetailRow());
      await service.create({ code: 'WH-01', name: 'انبار تهران' }, actorId);
      const entry = audit.log.mock.calls[0][0];
      expect(entry.after).toEqual({
        code: 'WH-01',
        name: 'انبار تهران',
        status: WarehouseStatus.ACTIVE,
      });
      expect(JSON.stringify(entry.after)).not.toContain('deletedAt');
      expect(JSON.stringify(entry.after)).not.toContain('createdBy');
      expect(JSON.stringify(entry.after)).not.toContain('updatedBy');
    });

    it('maps a P2002 duplicate code to 409', async () => {
      const error = new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: '6',
        meta: { modelName: 'Warehouse' },
      });
      tx.warehouse.create.mockRejectedValue(error);
      await expect(
        service.create({ code: 'WH-01', name: 'انبار تهران' }, actorId),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('update', () => {
    it('updates changed fields including null-clear semantics and audits WAREHOUSE_UPDATED', async () => {
      tx.warehouse.findUnique
        .mockResolvedValueOnce(makeDetailRow({ contactName: 'علی رضایی' }))
        .mockResolvedValueOnce(makeDetailRow({ contactName: null, name: 'انبار مرکزی' }));
      tx.warehouse.updateMany.mockResolvedValue({ count: 1 });

      await service.update('wh-1', { name: 'انبار مرکزی', contactName: null }, actorId);

      expect(tx.warehouse.updateMany).toHaveBeenCalledWith({
        where: { id: 'wh-1', deletedAt: null },
        data: expect.objectContaining({ name: 'انبار مرکزی', contactName: null, updatedBy: actorId }),
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'WAREHOUSE_UPDATED',
          before: expect.objectContaining({ name: 'انبار تهران', contactName: 'علی رضایی' }),
          after: expect.objectContaining({ name: 'انبار مرکزی', contactName: null }),
        }),
        tx,
      );
    });

    it('returns the detail for a no-op update without auditing', async () => {
      tx.warehouse.findUnique.mockResolvedValueOnce(makeDetailRow()).mockResolvedValueOnce(makeDetailRow());
      const result = await service.update('wh-1', {}, actorId);
      expect(result.name).toBe('انبار تهران');
      expect(tx.warehouse.updateMany).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('skips the audit and update when every changed value is unchanged', async () => {
      tx.warehouse.findUnique.mockResolvedValue(makeDetailRow({ name: 'انبار تهران' }));
      const result = await service.update('wh-1', { name: 'انبار تهران' }, actorId);
      expect(result.name).toBe('انبار تهران');
      expect(tx.warehouse.updateMany).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('throws 404 when the warehouse is missing', async () => {
      tx.warehouse.findUnique.mockResolvedValue(null);
      await expect(service.update('wh-1', { name: 'x' }, actorId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws 404 when the warehouse is soft-deleted', async () => {
      tx.warehouse.findUnique.mockResolvedValue(makeDetailRow({ deletedAt: now }));
      await expect(service.update('wh-1', { name: 'x' }, actorId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws 404 when a concurrent soft-delete removed it during update', async () => {
      tx.warehouse.findUnique
        .mockResolvedValueOnce(makeDetailRow())
        .mockResolvedValueOnce(makeDetailRow({ deletedAt: now }));
      tx.warehouse.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.update('wh-1', { name: 'x' }, actorId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(audit.log).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'WAREHOUSE_UPDATED' }),
        tx,
      );
    });

    it('maps a P2002 duplicate code to 409', async () => {
      tx.warehouse.findUnique.mockResolvedValue(makeDetailRow());
      const error = new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: '6',
        meta: { modelName: 'Warehouse' },
      });
      tx.warehouse.updateMany.mockRejectedValue(error);
      await expect(service.update('wh-1', { code: 'taken' }, actorId)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('deactivate', () => {
    it('deactivates an ACTIVE warehouse and audits WAREHOUSE_DEACTIVATED', async () => {
      tx.warehouse.findUnique
        .mockResolvedValueOnce(makeDetailRow())
        .mockResolvedValueOnce(makeDetailRow({ status: WarehouseStatus.INACTIVE }));
      tx.$queryRaw.mockResolvedValue([
        { id: 'wh-1' },
        { id: 'wh-2' },
      ]);
      tx.warehouse.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.deactivate('wh-1', actorId, '127.0.0.1');

      expect(tx.warehouse.updateMany).toHaveBeenCalledWith({
        where: { id: 'wh-1', status: WarehouseStatus.ACTIVE, deletedAt: null },
        data: { status: WarehouseStatus.INACTIVE, updatedBy: actorId },
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'WAREHOUSE_DEACTIVATED',
          entity: 'Warehouse',
          entityId: 'wh-1',
          before: { status: WarehouseStatus.ACTIVE },
          after: { status: WarehouseStatus.INACTIVE },
          ipAddress: '127.0.0.1',
        }),
        tx,
      );
      expect(result.status).toBe(WarehouseStatus.INACTIVE);
    });

    it('throws 404 when missing or soft-deleted', async () => {
      tx.warehouse.findUnique.mockResolvedValue(null);
      await expect(service.deactivate('wh-1', actorId)).rejects.toBeInstanceOf(NotFoundException);
      tx.warehouse.findUnique.mockResolvedValue(makeDetailRow({ deletedAt: now }));
      await expect(service.deactivate('wh-1', actorId)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws 409 when already INACTIVE', async () => {
      tx.warehouse.findUnique.mockResolvedValue(makeDetailRow({ status: WarehouseStatus.INACTIVE }));
      await expect(service.deactivate('wh-1', actorId)).rejects.toBeInstanceOf(ConflictException);
      expect(tx.$queryRaw).not.toHaveBeenCalled();
    });

    it('throws 409 when the warehouse is the last active warehouse', async () => {
      tx.warehouse.findUnique.mockResolvedValue(makeDetailRow());
      tx.$queryRaw.mockResolvedValue([{ id: 'wh-1' }]);
      await expect(service.deactivate('wh-1', actorId)).rejects.toBeInstanceOf(ConflictException);
      expect(tx.warehouse.updateMany).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('throws 409 when the conditional update races a concurrent transition', async () => {
      tx.warehouse.findUnique.mockResolvedValue(makeDetailRow());
      tx.$queryRaw.mockResolvedValue([{ id: 'wh-1' }, { id: 'wh-2' }]);
      tx.warehouse.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.deactivate('wh-1', actorId)).rejects.toBeInstanceOf(ConflictException);
      expect(audit.log).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'WAREHOUSE_DEACTIVATED' }),
        tx,
      );
    });

    it('retries a transient transaction error and succeeds on the second attempt', async () => {
      const transient = new Prisma.PrismaClientKnownRequestError('timeout', {
        code: 'P2028',
        clientVersion: '6',
      });
      prisma.$transaction
        .mockRejectedValueOnce(transient)
        .mockImplementationOnce((arg: unknown) => {
          if (typeof arg === 'function') {
            return arg(tx);
          }
          return arg;
        });

      tx.warehouse.findUnique
        .mockResolvedValueOnce(makeDetailRow())
        .mockResolvedValueOnce(makeDetailRow({ status: WarehouseStatus.INACTIVE }));
      tx.$queryRaw.mockResolvedValue([{ id: 'wh-1' }, { id: 'wh-2' }]);
      tx.warehouse.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.deactivate('wh-1', actorId);
      expect(result.status).toBe(WarehouseStatus.INACTIVE);
      expect(audit.log).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    });

    it('maps exhausted transient retries to 409', async () => {
      const transient = new Prisma.PrismaClientKnownRequestError('timeout', {
        code: 'P2034',
        clientVersion: '6',
      });
      prisma.$transaction.mockRejectedValue(transient);

      await expect(service.deactivate('wh-1', actorId)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    });

    it('does not retry non-transient errors', async () => {
      const unique = new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: '6',
        meta: { modelName: 'Warehouse' },
      });
      prisma.$transaction.mockRejectedValue(unique);

      await expect(service.deactivate('wh-1', actorId)).rejects.toBe(unique);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('activate', () => {
    it('activates an INACTIVE warehouse and audits WAREHOUSE_ACTIVATED', async () => {
      tx.warehouse.findUnique
        .mockResolvedValueOnce(makeDetailRow({ status: WarehouseStatus.INACTIVE }))
        .mockResolvedValueOnce(makeDetailRow());
      tx.warehouse.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.activate('wh-1', actorId, '127.0.0.1');

      expect(tx.warehouse.updateMany).toHaveBeenCalledWith({
        where: { id: 'wh-1', status: WarehouseStatus.INACTIVE, deletedAt: null },
        data: { status: WarehouseStatus.ACTIVE, updatedBy: actorId },
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'WAREHOUSE_ACTIVATED',
          before: { status: WarehouseStatus.INACTIVE },
          after: { status: WarehouseStatus.ACTIVE },
          ipAddress: '127.0.0.1',
        }),
        tx,
      );
      expect(result.status).toBe(WarehouseStatus.ACTIVE);
    });

    it('throws 404 when missing or soft-deleted', async () => {
      tx.warehouse.findUnique.mockResolvedValue(null);
      await expect(service.activate('wh-1', actorId)).rejects.toBeInstanceOf(NotFoundException);
      tx.warehouse.findUnique.mockResolvedValue(makeDetailRow({ deletedAt: now }));
      await expect(service.activate('wh-1', actorId)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws 409 when already ACTIVE', async () => {
      tx.warehouse.findUnique.mockResolvedValue(makeDetailRow());
      await expect(service.activate('wh-1', actorId)).rejects.toBeInstanceOf(ConflictException);
      expect(tx.warehouse.updateMany).not.toHaveBeenCalled();
    });

    it('throws 409 when the conditional update races a concurrent transition', async () => {
      tx.warehouse.findUnique.mockResolvedValue(makeDetailRow({ status: WarehouseStatus.INACTIVE }));
      tx.warehouse.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.activate('wh-1', actorId)).rejects.toBeInstanceOf(ConflictException);
      expect(audit.log).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'WAREHOUSE_ACTIVATED' }),
        tx,
      );
    });
  });

  describe('audit failure rollback', () => {
    it('rolls back the mutation when the audit write fails', async () => {
      tx.warehouse.create.mockResolvedValue(makeDetailRow());
      audit.log.mockRejectedValueOnce(new Error('audit failed'));

      await expect(
        service.create({ code: 'WH-01', name: 'انبار تهران' }, actorId),
      ).rejects.toThrow('audit failed');

      const entry = audit.log.mock.calls[0][0];
      expect(entry.action).toBe('WAREHOUSE_CREATED');
    });
  });
});