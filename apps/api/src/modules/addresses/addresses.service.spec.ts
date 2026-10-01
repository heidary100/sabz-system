import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AddressesService } from './addresses.service';

const USER_ID = 'user-1';
const ADDRESS_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ADDRESS_ID,
    label: null,
    fullName: 'علی احمدی',
    phone: '09123456789',
    province: 'مازندران',
    city: 'ساری',
    address: 'ساری، بلوار پاسداران، روبروی مرکز تخصصی',
    postalCode: '4814938662',
    isDefault: false,
    createdAt: new Date('2026-09-03T00:00:00.000Z'),
    ...overrides,
  };
}

describe('AddressesService', () => {
  let service: AddressesService;
  let audit: { log: jest.Mock };
  let tx: {
    address: {
      updateMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      findFirst: jest.Mock;
    };
  };
  let prisma: {
    address: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
      updateMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    tx = {
      address: {
        updateMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findFirst: jest.fn(),
      },
    };
    prisma = {
      address: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    audit = { log: jest.fn() };
    service = new AddressesService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
  });

  it('lists the user\u2019s addresses as DTOs', async () => {
    prisma.address.findMany.mockResolvedValue([makeRow({ isDefault: true })]);

    const result = await service.list(USER_ID);

    expect(prisma.address.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER_ID } }),
    );
    expect(result.items).toHaveLength(1);
    expect(Object.keys(result)).toEqual(['items']);
    expect(Object.keys(result.items[0]!).sort()).toEqual(
      [
        'address',
        'city',
        'createdAt',
        'fullName',
        'id',
        'isDefault',
        'label',
        'phone',
        'postalCode',
        'province',
      ].sort(),
    );
  });

  it('marks the first address as default automatically', async () => {
    prisma.address.count.mockResolvedValue(0);
    tx.address.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(makeRow(data)),
    );

    const result = await service.create(USER_ID, {
      fullName: 'علی احمدی',
      phone: '09123456789',
      address: 'ساری، بلوار پاسداران، روبروی مرکز تخصصی پرتو',
    });

    expect(result.isDefault).toBe(true);
    expect(tx.address.updateMany).toHaveBeenCalled();
  });

  it('leaves later addresses non-default unless promoted', async () => {
    prisma.address.count.mockResolvedValue(2);
    tx.address.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(makeRow(data)),
    );

    const plain = await service.create(USER_ID, {
      fullName: 'علی احمدی',
      phone: '09123456789',
      address: 'ساری، بلوار پاسداران، روبروی مرکز تخصصی پرتو',
    });
    const promoted = await service.create(USER_ID, {
      fullName: 'علی احمدی',
      phone: '09123456789',
      address: 'ساری، بلوار پاسداران، روبروی مرکز تخصصی پرتو',
      isDefault: true,
    });

    expect(plain.isDefault).toBe(false);
    expect(promoted.isDefault).toBe(true);
  });

  it('404s on updating another user\u2019s address', async () => {
    prisma.address.findFirst.mockResolvedValue(null);

    await expect(
      service.update(USER_ID, ADDRESS_ID, { city: 'بابل' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reports not-removed for unknown ids (idempotent remove)', async () => {
    prisma.address.findFirst.mockResolvedValue(null);

    await expect(service.remove(USER_ID, ADDRESS_ID)).resolves.toEqual({
      removed: false,
    });
  });

  it('promotes the oldest sibling when the default is removed', async () => {
    const oldestId = '11111111-1111-4111-8111-111111111111';
    prisma.address.findFirst.mockResolvedValue({ id: ADDRESS_ID, isDefault: true });
    tx.address.findFirst.mockResolvedValue({ id: oldestId });

    const result = await service.remove(USER_ID, ADDRESS_ID);

    expect(result).toEqual({ removed: true });
    expect(tx.address.delete).toHaveBeenCalledWith({
      where: { id: ADDRESS_ID },
    });
    expect(tx.address.update).toHaveBeenCalledWith({
      where: { id: oldestId },
      data: { isDefault: true },
    });
  });

  // SS-244A: PII mutation audits.
  it('audits ADDRESS_CREATED with the new row id', async () => {
    prisma.address.count.mockResolvedValue(0);
    tx.address.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(makeRow(data)),
    );

    await service.create(
      USER_ID,
      {
        fullName: 'علی احمدی',
        phone: '09123456789',
        address: 'ساری، بلوار پاسداران، روبروی مرکز تخصصی پرتو',
      },
      '127.0.0.1',
    );

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ADDRESS_CREATED',
        entity: 'Address',
        entityId: ADDRESS_ID,
        ipAddress: '127.0.0.1',
      }),
    );
  });

  it('audits ADDRESS_UPDATED and ADDRESS_DELETED, but never a no-op remove', async () => {
    prisma.address.findFirst.mockResolvedValue({ id: ADDRESS_ID, isDefault: false });
    tx.address.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(makeRow({ ...data, id: ADDRESS_ID })),
    );

    await service.update(USER_ID, ADDRESS_ID, { city: 'بابل' });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ADDRESS_UPDATED', entity: 'Address' }),
    );

    audit.log.mockClear();
    prisma.address.findFirst.mockResolvedValue(null);
    await expect(service.remove(USER_ID, ADDRESS_ID)).resolves.toEqual({
      removed: false,
    });
    expect(audit.log).not.toHaveBeenCalled();

    prisma.address.findFirst.mockResolvedValue({ id: ADDRESS_ID, isDefault: false });
    tx.address.findFirst.mockResolvedValue(null);
    await service.remove(USER_ID, ADDRESS_ID);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ADDRESS_DELETED', entity: 'Address' }),
    );
  });
});
