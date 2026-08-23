import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ReserveInventoryDto } from './reserve-inventory.dto';

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

describe('ReserveInventoryDto', () => {
  it('accepts a minimal valid payload', async () => {
    await expectValid(
      plainToInstance(ReserveInventoryDto, {
        variantId: VARIANT,
        warehouseId: WAREHOUSE,
        quantity: 3,
      }),
    );
  });

  it('accepts an optional positive expiresIn', async () => {
    await expectValid(
      plainToInstance(ReserveInventoryDto, {
        variantId: VARIANT,
        warehouseId: WAREHOUSE,
        quantity: 3,
        expiresIn: 3600,
      }),
    );
  });

  it('rejects a missing variantId', async () => {
    await expectInvalid(
      plainToInstance(ReserveInventoryDto, { warehouseId: WAREHOUSE, quantity: 1 }),
      'variantId',
    );
  });

  it('rejects a non-UUID variantId', async () => {
    await expectInvalid(
      plainToInstance(ReserveInventoryDto, {
        variantId: 'not-a-uuid',
        warehouseId: WAREHOUSE,
        quantity: 1,
      }),
      'variantId',
    );
  });

  it('rejects a missing warehouseId', async () => {
    await expectInvalid(
      plainToInstance(ReserveInventoryDto, { variantId: VARIANT, quantity: 1 }),
      'warehouseId',
    );
  });

  it('rejects a non-UUID warehouseId', async () => {
    await expectInvalid(
      plainToInstance(ReserveInventoryDto, {
        variantId: VARIANT,
        warehouseId: 'nope',
        quantity: 1,
      }),
      'warehouseId',
    );
  });

  it('rejects a missing quantity', async () => {
    await expectInvalid(
      plainToInstance(ReserveInventoryDto, { variantId: VARIANT, warehouseId: WAREHOUSE }),
      'quantity',
    );
  });

  it('rejects a non-integer quantity', async () => {
    await expectInvalid(
      plainToInstance(ReserveInventoryDto, {
        variantId: VARIANT,
        warehouseId: WAREHOUSE,
        quantity: 1.5,
      }),
      'quantity',
    );
  });

  it('rejects quantity zero', async () => {
    await expectInvalid(
      plainToInstance(ReserveInventoryDto, {
        variantId: VARIANT,
        warehouseId: WAREHOUSE,
        quantity: 0,
      }),
      'quantity',
    );
  });

  it('rejects a negative quantity', async () => {
    await expectInvalid(
      plainToInstance(ReserveInventoryDto, {
        variantId: VARIANT,
        warehouseId: WAREHOUSE,
        quantity: -3,
      }),
      'quantity',
    );
  });

  it('rejects a non-integer expiresIn', async () => {
    await expectInvalid(
      plainToInstance(ReserveInventoryDto, {
        variantId: VARIANT,
        warehouseId: WAREHOUSE,
        quantity: 1,
        expiresIn: 1.5,
      }),
      'expiresIn',
    );
  });

  it('rejects expiresIn zero', async () => {
    await expectInvalid(
      plainToInstance(ReserveInventoryDto, {
        variantId: VARIANT,
        warehouseId: WAREHOUSE,
        quantity: 1,
        expiresIn: 0,
      }),
      'expiresIn',
    );
  });

  it('rejects a negative expiresIn', async () => {
    await expectInvalid(
      plainToInstance(ReserveInventoryDto, {
        variantId: VARIANT,
        warehouseId: WAREHOUSE,
        quantity: 1,
        expiresIn: -60,
      }),
      'expiresIn',
    );
  });
});