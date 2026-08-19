import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateVariantDto } from './create-variant.dto';
import { UpdateVariantDto } from './update-variant.dto';
import { UpdateVariantInventoryDto } from './update-inventory.dto';

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

describe('CreateVariantDto', () => {
  const base = { sku: 'XPS13-BASE', price: '1500.00' };

  it('accepts a valid create payload', async () => {
    await expectValid(plainToInstance(CreateVariantDto, base));
  });

  it('trims and accepts optional barcode/name', async () => {
    await expectValid(
      plainToInstance(CreateVariantDto, {
        ...base,
        barcode: ' 123456 ',
        name: '  پایه  ',
        stockQuantity: 3,
      }),
    );
  });

  it('trims surrounding whitespace from price', async () => {
    const dto = plainToInstance(CreateVariantDto, { ...base, price: '  1500.00  ' });
    expect(dto.price).toBe('1500.00');
    await expectValid(dto);
  });

  it('rejects a missing sku', async () => {
    await expectInvalid(
      plainToInstance(CreateVariantDto, { ...base, sku: undefined }),
      'sku',
    );
  });

  it('rejects an empty sku', async () => {
    await expectInvalid(
      plainToInstance(CreateVariantDto, { ...base, sku: '   ' }),
      'sku',
    );
  });

  it('rejects an over-long sku', async () => {
    await expectInvalid(
      plainToInstance(CreateVariantDto, { ...base, sku: 'x'.repeat(65) }),
      'sku',
    );
  });

  it('rejects a missing price', async () => {
    await expectInvalid(
      plainToInstance(CreateVariantDto, { ...base, price: undefined }),
      'price',
    );
  });

  it('rejects a price with more than 2 decimals', async () => {
    await expectInvalid(
      plainToInstance(CreateVariantDto, { ...base, price: '100.123' }),
      'price',
    );
  });

  it('rejects a price with too many digits', async () => {
    await expectInvalid(
      plainToInstance(CreateVariantDto, { ...base, price: '12345678901' }),
      'price',
    );
  });

  it('rejects a negative stockQuantity', async () => {
    await expectInvalid(
      plainToInstance(CreateVariantDto, { ...base, stockQuantity: -1 }),
      'stockQuantity',
    );
  });

  it('rejects a fractional stockQuantity', async () => {
    await expectInvalid(
      plainToInstance(CreateVariantDto, { ...base, stockQuantity: 1.5 }),
      'stockQuantity',
    );
  });

  it('ignores any productId passed in the body', async () => {
    // The owning product is a route param only; the DTO declares no productId
    // property, so a body-supplied productId is not part of the contract and
    // does not fail validation.
    const dto = plainToInstance(CreateVariantDto, {
      ...base,
      productId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
    });
    await expectValid(dto);
  });
});

describe('UpdateVariantDto', () => {
  it('accepts an empty update (all fields optional)', async () => {
    await expectValid(plainToInstance(UpdateVariantDto, {}));
  });

  it('accepts a valid price/sku/barcode/name update', async () => {
    await expectValid(
      plainToInstance(UpdateVariantDto, {
        sku: 'NEW-SKU',
        barcode: '98765',
        name: 'نام جدید',
        price: '99.99',
      }),
    );
  });

  it('accepts null to clear barcode/name', async () => {
    await expectValid(
      plainToInstance(UpdateVariantDto, { barcode: null, name: null }),
    );
  });

  it('rejects a negative/zero-invalid price pattern', async () => {
    await expectInvalid(
      plainToInstance(UpdateVariantDto, { price: 'abc' }),
      'price',
    );
  });

  it('rejects an over-long sku', async () => {
    await expectInvalid(
      plainToInstance(UpdateVariantDto, { sku: 'x'.repeat(65) }),
      'sku',
    );
  });

  it('does not validate or accept productId or inventory fields', async () => {
    // productId (re-parenting) and stockQuantity (inventory authority lives in
    // the inventory endpoint) are intentionally not part of the update contract;
    // passing them does not fail validation.
    const dto = plainToInstance(UpdateVariantDto, {
      productId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
      stockQuantity: 5,
    });
    await expectValid(dto);
  });
});

describe('UpdateVariantInventoryDto', () => {
  it('accepts a valid non-negative stockQuantity', async () => {
    await expectValid(plainToInstance(UpdateVariantInventoryDto, { stockQuantity: 0 }));
  });

  it('rejects a missing stockQuantity', async () => {
    await expectInvalid(plainToInstance(UpdateVariantInventoryDto, {}), 'stockQuantity');
  });

  it('rejects a negative stockQuantity', async () => {
    await expectInvalid(
      plainToInstance(UpdateVariantInventoryDto, { stockQuantity: -1 }),
      'stockQuantity',
    );
  });

  it('rejects a fractional stockQuantity', async () => {
    await expectInvalid(
      plainToInstance(UpdateVariantInventoryDto, { stockQuantity: 1.5 }),
      'stockQuantity',
    );
  });
});
