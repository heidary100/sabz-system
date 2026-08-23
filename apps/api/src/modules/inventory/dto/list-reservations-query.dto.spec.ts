import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListReservationsQueryDto } from './list-reservations-query.dto';

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

describe('ListReservationsQueryDto', () => {
  it('accepts an empty query', async () => {
    await expectValid(plainToInstance(ListReservationsQueryDto, {}));
  });

  it('accepts valid page and limit', async () => {
    await expectValid(
      plainToInstance(ListReservationsQueryDto, { page: 2, limit: 50 }),
    );
  });

  it('rejects a page below 1', async () => {
    await expectInvalid(plainToInstance(ListReservationsQueryDto, { page: 0 }), 'page');
  });

  it('rejects a non-integer page', async () => {
    await expectInvalid(plainToInstance(ListReservationsQueryDto, { page: 1.5 }), 'page');
  });

  it('rejects a limit below 1', async () => {
    await expectInvalid(plainToInstance(ListReservationsQueryDto, { limit: 0 }), 'limit');
  });

  it('rejects a limit above 100', async () => {
    await expectInvalid(
      plainToInstance(ListReservationsQueryDto, { limit: 101 }),
      'limit',
    );
  });

  it('accepts UUID filters', async () => {
    await expectValid(
      plainToInstance(ListReservationsQueryDto, {
        variantId: VARIANT,
        warehouseId: WAREHOUSE,
      }),
    );
  });

  it('rejects an invalid variantId', async () => {
    await expectInvalid(
      plainToInstance(ListReservationsQueryDto, { variantId: 'not-a-uuid' }),
      'variantId',
    );
  });

  it('rejects an invalid warehouseId', async () => {
    await expectInvalid(
      plainToInstance(ListReservationsQueryDto, { warehouseId: 'not-a-uuid' }),
      'warehouseId',
    );
  });

  it('rejects an invalid status', async () => {
    await expectInvalid(
      plainToInstance(ListReservationsQueryDto, { status: 'NOT_A_STATUS' }),
      'status',
    );
  });

  it('accepts every ReservationStatus value', async () => {
    for (const status of ['ACTIVE', 'RELEASED', 'CONSUMED', 'EXPIRED']) {
      await expectValid(plainToInstance(ListReservationsQueryDto, { status }));
    }
  });

  it('transforms numeric query strings into integers', () => {
    const instance = plainToInstance(ListReservationsQueryDto, {
      page: '3',
      limit: '25',
    });
    expect(instance.page).toBe(3);
    expect(instance.limit).toBe(25);
  });
});