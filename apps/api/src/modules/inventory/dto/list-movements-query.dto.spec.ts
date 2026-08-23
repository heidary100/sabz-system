import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListMovementsQueryDto } from './list-movements-query.dto';

const VARIANT = '11111111-1111-4111-8111-111111111111';
const WAREHOUSE = '22222222-2222-4222-8222-222222222222';

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

describe('ListMovementsQueryDto', () => {
  it('accepts an empty query', async () => {
    await expectValid(plainToInstance(ListMovementsQueryDto, {}));
  });

  it('accepts valid page and limit', async () => {
    await expectValid(plainToInstance(ListMovementsQueryDto, { page: 2, limit: 50 }));
  });

  it('rejects a page below 1', async () => {
    await expectInvalid(plainToInstance(ListMovementsQueryDto, { page: 0 }), 'page');
  });

  it('rejects a non-integer page', async () => {
    await expectInvalid(plainToInstance(ListMovementsQueryDto, { page: 1.5 }), 'page');
  });

  it('rejects a limit below 1', async () => {
    await expectInvalid(plainToInstance(ListMovementsQueryDto, { limit: 0 }), 'limit');
  });

  it('rejects a limit above 100', async () => {
    await expectInvalid(
      plainToInstance(ListMovementsQueryDto, { limit: 101 }),
      'limit',
    );
  });

  it('accepts UUID filters', async () => {
    await expectValid(
      plainToInstance(ListMovementsQueryDto, {
        variantId: VARIANT,
        warehouseId: WAREHOUSE,
      }),
    );
  });

  it('rejects an invalid variantId', async () => {
    await expectInvalid(
      plainToInstance(ListMovementsQueryDto, { variantId: 'not-a-uuid' }),
      'variantId',
    );
  });

  it('rejects an invalid warehouseId', async () => {
    await expectInvalid(
      plainToInstance(ListMovementsQueryDto, { warehouseId: 'not-a-uuid' }),
      'warehouseId',
    );
  });

  it('rejects an invalid movement type', async () => {
    await expectInvalid(
      plainToInstance(ListMovementsQueryDto, { type: 'NOT_A_TYPE' }),
      'type',
    );
  });

  it('accepts the currently produced movement types', async () => {
    for (const type of ['INITIAL_STOCK', 'PURCHASE_RECEIPT', 'MANUAL_ADJUSTMENT']) {
      await expectValid(plainToInstance(ListMovementsQueryDto, { type }));
    }
  });

  it('accepts forward-declared movement types such as SALE', async () => {
    for (const type of [
      'SALE',
      'RESERVATION',
      'RESERVATION_RELEASE',
      'DAMAGE',
      'RETURN_RECEIVED',
      'RETURN_REJECTED',
      'STOCK_TRANSFER',
      'HOLO_IMPORT',
    ]) {
      await expectValid(plainToInstance(ListMovementsQueryDto, { type }));
    }
  });

  it('rejects an invalid ISO from date', async () => {
    await expectInvalid(
      plainToInstance(ListMovementsQueryDto, { from: 'not-a-date' }),
      'from',
    );
  });

  it('rejects an invalid ISO to date', async () => {
    await expectInvalid(
      plainToInstance(ListMovementsQueryDto, { to: 'not-a-date' }),
      'to',
    );
  });

  it('accepts valid ISO dates including date-only values', async () => {
    await expectValid(
      plainToInstance(ListMovementsQueryDto, {
        from: '2026-01-01',
        to: '2026-08-31T23:59:59.999Z',
      }),
    );
  });

  it('transforms numeric query strings into integers', () => {
    const instance = plainToInstance(ListMovementsQueryDto, {
      page: '3',
      limit: '25',
    });
    expect(instance.page).toBe(3);
    expect(instance.limit).toBe(25);
  });
});