import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AddWishlistDto } from './add-wishlist.dto';

describe('AddWishlistDto', () => {
  it('accepts a UUID v4 productId', async () => {
    const dto = plainToInstance(AddWishlistDto, {
      productId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    });

    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects a missing productId', async () => {
    const dto = plainToInstance(AddWishlistDto, {});

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('rejects non-UUID productIds', async () => {
    for (const productId of ['not-a-uuid', '123', 'phone-slug']) {
      const dto = plainToInstance(AddWishlistDto, { productId });

      expect(await validate(dto)).not.toHaveLength(0);
    }
  });
});
