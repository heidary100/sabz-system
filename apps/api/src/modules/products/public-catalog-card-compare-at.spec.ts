import { pickCardCompareAtPrice } from './public-catalog.service';

describe('pickCardCompareAtPrice (SS-225)', () => {
  it('returns the compareAtPrice of the minimum-priced PRICED variant', () => {
    expect(
      pickCardCompareAtPrice(
        [
          { price: '20000', compareAtPrice: '25000', priceStatus: 'PRICED' },
          { price: '15000', compareAtPrice: '18000', priceStatus: 'PRICED' },
        ],
        '15000',
      ),
    ).toBe('18000');
  });

  it('skips CALL_FOR_PRICE variants even at the minimum price', () => {
    expect(
      pickCardCompareAtPrice(
        [
          { price: '0', compareAtPrice: null, priceStatus: 'CALL_FOR_PRICE' },
          { price: '15000', compareAtPrice: '18000', priceStatus: 'PRICED' },
        ],
        '15000',
      ),
    ).toBe('18000');
  });

  it('returns null for a call-for-price product', () => {
    expect(
      pickCardCompareAtPrice(
        [{ price: '0', compareAtPrice: null, priceStatus: 'CALL_FOR_PRICE' }],
        null,
      ),
    ).toBeNull();
  });

  it('returns null when the winning variant has no reference price', () => {
    expect(
      pickCardCompareAtPrice(
        [{ price: '15000', compareAtPrice: null, priceStatus: 'PRICED' }],
        '15000',
      ),
    ).toBeNull();
  });

  it('returns null when the reference price is not above the selling price', () => {
    expect(
      pickCardCompareAtPrice(
        [
          { price: '15000', compareAtPrice: '15000', priceStatus: 'PRICED' },
          { price: '15000', compareAtPrice: '10000', priceStatus: 'PRICED' },
        ],
        '15000',
      ),
    ).toBeNull();
  });

  it('resolves ties to the first variant in load order', () => {
    expect(
      pickCardCompareAtPrice(
        [
          { price: '15000', compareAtPrice: '16000', priceStatus: 'PRICED' },
          { price: '15000', compareAtPrice: '20000', priceStatus: 'PRICED' },
        ],
        '15000',
      ),
    ).toBe('16000');
  });
});
