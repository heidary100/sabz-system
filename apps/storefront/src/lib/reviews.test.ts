import { describe, expect, it } from 'vitest';
import { productReviewsPath } from './reviews';

describe('productReviewsPath', () => {
  it('builds the paginated public list path', () => {
    expect(productReviewsPath('p1')).toBe('/reviews/product/p1?page=1&limit=10');
    expect(productReviewsPath('p1', 2, 24)).toBe(
      '/reviews/product/p1?page=2&limit=24',
    );
  });

  it('encodes the product id', () => {
    expect(productReviewsPath('a/b')).toBe(
      '/reviews/product/a%2Fb?page=1&limit=10',
    );
  });
});
