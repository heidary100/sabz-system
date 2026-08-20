import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { WarehouseStatus } from '@prisma/client';
import { CreateWarehouseDto } from './create-warehouse.dto';
import { UpdateWarehouseDto } from './update-warehouse.dto';
import { ListWarehousesQueryDto } from './list-warehouses-query.dto';

async function expectValid<T extends object>(dto: T): Promise<void> {
  const errors = await validate(dto as object);
  expect(errors).toHaveLength(0);
}

async function expectInvalid<T extends object>(
  dto: T,
  property?: string,
): Promise<void> {
  const errors = await validate(dto as object);
  expect(errors.length).toBeGreaterThan(0);
  if (property) {
    expect(errors.some((error) => error.property === property)).toBe(true);
  }
}

describe('CreateWarehouseDto', () => {
  it('accepts a minimal valid payload', async () => {
    await expectValid(plainToInstance(CreateWarehouseDto, { code: 'WH-01', name: 'انبار تهران' }));
  });

  it('accepts optional address and contact fields', async () => {
    await expectValid(
      plainToInstance(CreateWarehouseDto, {
        code: 'WH-01',
        name: 'انبار تهران',
        address: 'تهران',
        contactName: 'علی',
        contactPhone: '021111',
      }),
    );
  });

  it('rejects a missing code', async () => {
    await expectInvalid(plainToInstance(CreateWarehouseDto, { name: 'انبار' }), 'code');
  });

  it('rejects an empty code after trimming', async () => {
    await expectInvalid(plainToInstance(CreateWarehouseDto, { code: '   ', name: 'انبار' }), 'code');
  });

  it('rejects a missing name', async () => {
    await expectInvalid(plainToInstance(CreateWarehouseDto, { code: 'WH-01' }), 'name');
  });

  it('trims required fields', () => {
    const instance = plainToInstance(CreateWarehouseDto, {
      code: '  WH-01  ',
      name: '  انبار تهران  ',
    });
    expect(instance.code).toBe('WH-01');
    expect(instance.name).toBe('انبار تهران');
  });

  it('drops null optional fields (treated as absent on create)', () => {
    const instance = plainToInstance(CreateWarehouseDto, {
      code: 'WH-01',
      name: 'انبار',
      address: null,
    });
    expect(instance.address).toBeUndefined();
  });

  it('rejects an overly long code', async () => {
    await expectInvalid(
      plainToInstance(CreateWarehouseDto, { code: 'x'.repeat(101), name: 'انبار' }),
      'code',
    );
  });

  it('rejects an overly long name', async () => {
    await expectInvalid(
      plainToInstance(CreateWarehouseDto, { code: 'WH-01', name: 'x'.repeat(256) }),
      'name',
    );
  });

  it('rejects a non-string code', async () => {
    await expectInvalid(plainToInstance(CreateWarehouseDto, { code: 42, name: 'انبار' }), 'code');
  });
});

describe('UpdateWarehouseDto', () => {
  it('accepts an empty update body', async () => {
    await expectValid(plainToInstance(UpdateWarehouseDto, {}));
  });

  it('preserves explicit null contact fields so they can be cleared', () => {
    const instance = plainToInstance(UpdateWarehouseDto, {
      address: null,
      contactName: null,
      contactPhone: null,
    });
    expect(instance.address).toBeNull();
    expect(instance.contactName).toBeNull();
    expect(instance.contactPhone).toBeNull();
  });

  it('trims non-null optional fields', () => {
    const instance = plainToInstance(UpdateWarehouseDto, { name: '  انبار مرکزی  ' });
    expect(instance.name).toBe('انبار مرکزی');
  });

  it('treats an empty code in update as a no-op (undefined after trim)', () => {
    const instance = plainToInstance(UpdateWarehouseDto, { code: '   ' });
    expect(instance.code).toBeUndefined();
  });

  it('rejects a non-string name', async () => {
    await expectInvalid(plainToInstance(UpdateWarehouseDto, { name: 42 }), 'name');
  });

  it('rejects an overly long address', async () => {
    await expectInvalid(
      plainToInstance(UpdateWarehouseDto, { address: 'x'.repeat(1001) }),
      'address',
    );
  });
});

describe('ListWarehousesQueryDto', () => {
  it('accepts an empty query', async () => {
    await expectValid(plainToInstance(ListWarehousesQueryDto, {}));
  });

  it('accepts valid pagination', async () => {
    const dto = plainToInstance(ListWarehousesQueryDto, { page: 2, limit: 50 });
    await expectValid(dto);
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(50);
  });

  it('rejects a limit above 100', async () => {
    await expectInvalid(plainToInstance(ListWarehousesQueryDto, { limit: 101 }), 'limit');
  });

  it('rejects a page below 1', async () => {
    await expectInvalid(plainToInstance(ListWarehousesQueryDto, { page: 0 }), 'page');
  });

  it('rejects a non-integer page', async () => {
    await expectInvalid(plainToInstance(ListWarehousesQueryDto, { page: 1.5 }), 'page');
  });

  it('trims the search term', () => {
    const dto = plainToInstance(ListWarehousesQueryDto, { search: '  تهران  ' });
    expect(dto.search).toBe('تهران');
  });

  it('rejects a search term longer than 100 characters', async () => {
    await expectInvalid(
      plainToInstance(ListWarehousesQueryDto, { search: 'x'.repeat(101) }),
      'search',
    );
  });

  it('accepts a valid status', async () => {
    await expectValid(plainToInstance(ListWarehousesQueryDto, { status: WarehouseStatus.INACTIVE }));
  });

  it('rejects an invalid status', async () => {
    await expectInvalid(plainToInstance(ListWarehousesQueryDto, { status: 'NOT_A_STATUS' }), 'status');
  });
});