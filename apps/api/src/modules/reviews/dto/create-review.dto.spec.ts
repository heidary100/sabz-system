import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateReviewDto } from './create-review.dto';

describe('CreateReviewDto (SS-236)', () => {
  it('accepts a valid rating with an optional comment', async () => {
    const dto = plainToInstance(CreateReviewDto, {
      productId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      rating: 5,
      comment: 'عالی بود.',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts a missing comment', async () => {
    const dto = plainToInstance(CreateReviewDto, {
      productId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      rating: 1,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects out-of-range ratings', async () => {
    for (const rating of [0, 6, 4.5, '5']) {
      const dto = plainToInstance(CreateReviewDto, {
        productId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
        rating,
      });
      const errors = await validate(dto);
      expect(errors.some((error) => error.property === 'rating')).toBe(true);
    }
  });

  it('rejects an invalid productId and an over-long comment', async () => {
    const dto = plainToInstance(CreateReviewDto, {
      productId: 'not-a-uuid',
      rating: 5,
      comment: 'x'.repeat(2001),
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'productId')).toBe(true);
    expect(errors.some((error) => error.property === 'comment')).toBe(true);
  });
});
