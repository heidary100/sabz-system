import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ReceiveStockDto } from './receive-stock.dto';

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

describe('ReceiveStockDto', () => {
  it('accepts a minimal valid payload', async () => {
    await expectValid(
      plainToInstance(ReceiveStockDto, {
        variantId: VARIANT,
        warehouseId: WAREHOUSE,
        quantity: 10,
      }),
    );
  });

  it('accepts optional notes', async () => {
    await expectValid(
      plainToInstance(ReceiveStockDto, {
        variantId: VARIANT,
        warehouseId: WAREHOUSE,
        quantity: 5,
        notes: '  رسید انبار  ',
      }),
    );
  });

  it('rejects a missing variantId', async () => {
    await expectInvalid(
      plainToInstance(ReceiveStockDto, { warehouseId: WAREHOUSE, quantity: 1 }),
      'variantId',
    );
  });

  it('rejects a non-UUID variantId', async () => {
    await expectInvalid(
      plainToInstance(ReceiveStockDto, {
        variantId: 'not-a-uuid',
        warehouseId: WAREHOUSE,
        quantity: 1,
      }),
      'variantId',
    );
  });

  it('rejects a missing warehouseId', async () => {
    await expectInvalid(
      plainToInstance(ReceiveStockDto, { variantId: VARIANT, quantity: 1 }),
      'warehouseId',
    );
  });

  it('rejects a non-UUID warehouseId', async () => {
    await expectInvalid(
      plainToInstance(ReceiveStockDto, {
        variantId: VARIANT,
        warehouseId: 'nope',
        quantity: 1,
      }),
      'warehouseId',
    );
  });

  it('rejects a missing quantity', async () => {
    await expectInvalid(
      plainToInstance(ReceiveStockDto, { variantId: VARIANT, warehouseId: WAREHOUSE }),
      'quantity',
    );
  });

  it('rejects a non-integer quantity', async () => {
    await expectInvalid(
      plainToInstance(ReceiveStockDto, {
        variantId: VARIANT,
        warehouseId: WAREHOUSE,
        quantity: 1.5,
      }),
      'quantity',
    );
  });

  it('rejects quantity zero', async () => {
    await expectInvalid(
      plainToInstance(ReceiveStockDto, {
        variantId: VARIANT,
        warehouseId: WAREHOUSE,
        quantity: 0,
      }),
      'quantity',
    );
  });

  it('rejects a negative quantity', async () => {
    await expectInvalid(
      plainToInstance(ReceiveStockDto, {
        variantId: VARIANT,
        warehouseId: WAREHOUSE,
        quantity: -3,
      }),
      'quantity',
    );
  });

  it('trims optional notes', () => {
    const instance = plainToInstance(ReceiveStockDto, {
      variantId: VARIANT,
      warehouseId: WAREHOUSE,
      quantity: 1,
      notes: '  رسید  ',
    });
    expect(instance.notes).toBe('رسید');
  });

  it('drops whitespace-only notes (treated as absent)', () => {
    const instance = plainToInstance(ReceiveStockDto, {
      variantId: VARIANT,
      warehouseId: WAREHOUSE,
      quantity: 1,
      notes: '   ',
    });
    expect(instance.notes).toBeUndefined();
  });

  it('rejects overly long notes', async () => {
    await expectInvalid(
      plainToInstance(ReceiveStockDto, {
        variantId: VARIANT,
        warehouseId: WAREHOUSE,
        quantity: 1,
        notes: 'x'.repeat(1001),
      }),
      'notes',
    );
  });
});
