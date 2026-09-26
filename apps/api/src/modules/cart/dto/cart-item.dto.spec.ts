import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AddCartItemDto } from './add-cart-item.dto';
import { UpdateCartItemDto } from './update-cart-item.dto';

const VARIANT_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

describe('AddCartItemDto', () => {
  it('accepts a UUID v4 variantId with a valid quantity', async () => {
    const dto = plainToInstance(AddCartItemDto, {
      variantId: VARIANT_ID,
      quantity: 2,
    });

    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts a productId quick-add identity', async () => {
    const dto = plainToInstance(AddCartItemDto, {
      productId: VARIANT_ID,
      quantity: 1,
    });

    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects missing quantities (identity XOR is enforced by the service)', async () => {
    expect(await validate(plainToInstance(AddCartItemDto, {}))).not.toHaveLength(0);
    expect(
      await validate(plainToInstance(AddCartItemDto, { variantId: VARIANT_ID })),
    ).not.toHaveLength(0);
  });

  it('rejects non-UUID variantIds', async () => {
    for (const variantId of ['not-a-uuid', '123', 'phone-slug']) {
      const dto = plainToInstance(AddCartItemDto, { variantId, quantity: 1 });

      expect(await validate(dto)).not.toHaveLength(0);
    }
  });

  it('rejects quantities outside 1..99', async () => {
    for (const quantity of [0, -1, 100, 1.5, 'two']) {
      const dto = plainToInstance(AddCartItemDto, {
        variantId: VARIANT_ID,
        quantity,
      });

      expect(await validate(dto)).not.toHaveLength(0);
    }
  });
});

describe('UpdateCartItemDto', () => {
  it('accepts a valid absolute quantity', async () => {
    const dto = plainToInstance(UpdateCartItemDto, { quantity: 3 });

    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects missing, zero, negative, and oversized quantities', async () => {
    for (const body of [{}, { quantity: 0 }, { quantity: -2 }, { quantity: 100 }]) {
      const dto = plainToInstance(UpdateCartItemDto, body);

      expect(await validate(dto)).not.toHaveLength(0);
    }
  });
});
