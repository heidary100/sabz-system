import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdjustInventoryDto } from './adjust-inventory.dto';

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

describe('AdjustInventoryDto', () => {
  it('accepts a minimal valid payload', async () => {
    await expectValid(
      plainToInstance(AdjustInventoryDto, {
        variantId: VARIANT,
        warehouseId: WAREHOUSE,
        quantity: 12,
        reason: 'تطبیق شمارش',
      }),
    );
  });

  it('accepts quantity zero (absolute set to zero)', async () => {
    await expectValid(
      plainToInstance(AdjustInventoryDto, {
        variantId: VARIANT,
        warehouseId: WAREHOUSE,
        quantity: 0,
        reason: 'کسر موجودی',
      }),
    );
  });

  it('accepts optional notes and trims reason', async () => {
    const instance = plainToInstance(AdjustInventoryDto, {
      variantId: VARIANT,
      warehouseId: WAREHOUSE,
      quantity: 8,
      reason: '  تطبیق  ',
      notes: '  یادداشت  ',
    });
    await expectValid(instance);
    expect(instance.reason).toBe('تطبیق');
    expect(instance.notes).toBe('یادداشت');
  });

  it('rejects a missing variantId', async () => {
    await expectInvalid(
      plainToInstance(AdjustInventoryDto, {
        warehouseId: WAREHOUSE,
        quantity: 1,
        reason: 'r',
      }),
      'variantId',
    );
  });

  it('rejects a non-UUID variantId', async () => {
    await expectInvalid(
      plainToInstance(AdjustInventoryDto, {
        variantId: 'bad',
        warehouseId: WAREHOUSE,
        quantity: 1,
        reason: 'r',
      }),
      'variantId',
    );
  });

  it('rejects a missing warehouseId', async () => {
    await expectInvalid(
      plainToInstance(AdjustInventoryDto, {
        variantId: VARIANT,
        quantity: 1,
        reason: 'r',
      }),
      'warehouseId',
    );
  });

  it('rejects a missing quantity', async () => {
    await expectInvalid(
      plainToInstance(AdjustInventoryDto, {
        variantId: VARIANT,
        warehouseId: WAREHOUSE,
        reason: 'r',
      }),
      'quantity',
    );
  });

  it('rejects a non-integer quantity', async () => {
    await expectInvalid(
      plainToInstance(AdjustInventoryDto, {
        variantId: VARIANT,
        warehouseId: WAREHOUSE,
        quantity: 1.5,
        reason: 'r',
      }),
      'quantity',
    );
  });

  it('rejects a negative quantity', async () => {
    await expectInvalid(
      plainToInstance(AdjustInventoryDto, {
        variantId: VARIANT,
        warehouseId: WAREHOUSE,
        quantity: -1,
        reason: 'r',
      }),
      'quantity',
    );
  });

  it('rejects a missing reason', async () => {
    await expectInvalid(
      plainToInstance(AdjustInventoryDto, {
        variantId: VARIANT,
        warehouseId: WAREHOUSE,
        quantity: 1,
      }),
      'reason',
    );
  });

  it('rejects an empty reason', async () => {
    await expectInvalid(
      plainToInstance(AdjustInventoryDto, {
        variantId: VARIANT,
        warehouseId: WAREHOUSE,
        quantity: 1,
        reason: '',
      }),
      'reason',
    );
  });

  it('rejects a whitespace-only reason after trimming', async () => {
    await expectInvalid(
      plainToInstance(AdjustInventoryDto, {
        variantId: VARIANT,
        warehouseId: WAREHOUSE,
        quantity: 1,
        reason: '   ',
      }),
      'reason',
    );
  });

  it('rejects an overly long reason', async () => {
    await expectInvalid(
      plainToInstance(AdjustInventoryDto, {
        variantId: VARIANT,
        warehouseId: WAREHOUSE,
        quantity: 1,
        reason: 'x'.repeat(501),
      }),
      'reason',
    );
  });

  it('rejects a non-string reason', async () => {
    await expectInvalid(
      plainToInstance(AdjustInventoryDto, {
        variantId: VARIANT,
        warehouseId: WAREHOUSE,
        quantity: 1,
        reason: 42,
      }),
      'reason',
    );
  });

  it('rejects overly long notes', async () => {
    await expectInvalid(
      plainToInstance(AdjustInventoryDto, {
        variantId: VARIANT,
        warehouseId: WAREHOUSE,
        quantity: 1,
        reason: 'r',
        notes: 'x'.repeat(1001),
      }),
      'notes',
    );
  });

  it('drops whitespace-only notes (treated as absent)', () => {
    const instance = plainToInstance(AdjustInventoryDto, {
      variantId: VARIANT,
      warehouseId: WAREHOUSE,
      quantity: 1,
      reason: 'r',
      notes: '  ',
    });
    expect(instance.notes).toBeUndefined();
  });
});
