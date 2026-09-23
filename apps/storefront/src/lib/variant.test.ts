import { describe, expect, it } from 'vitest';
import type { CatalogProductVariantDto } from '@sabz/types';
import {
  defaultVariantId,
  getSelectedVariant,
  groupVariantOptions,
  hasStructuredOptions,
  isValueCompatible,
  parseVariantParam,
  resolveVariant,
  selectionOfVariant,
} from './variant';

const PRICED_ID = '11111111-1111-4111-8111-111111111111';
const PRICED_OOS_ID = '22222222-2222-4222-8222-222222222222';
const CALL_ID = '33333333-3333-4333-8333-333333333333';
const UNKNOWN_ID = '99999999-9999-4999-8999-999999999999';

function priced(inStock: boolean, id = PRICED_ID): CatalogProductVariantDto {
  return {
    id,
    sku: `SKU-${id.slice(0, 4)}`,
    name: 'مدل پایه',
    price: '1000000',
    compareAtPrice: null,
    priceStatus: 'PRICED',
    inStock,
    options: [],
  };
}

function callForPrice(inStock: boolean): CatalogProductVariantDto {
  return {
    id: CALL_ID,
    sku: 'SKU-CALL',
    name: null,
    price: '0',
    compareAtPrice: null,
    priceStatus: 'CALL_FOR_PRICE',
    inStock,
    options: [],
  };
}

describe('parseVariantParam', () => {
  it('accepts a valid UUID', () => {
    expect(parseVariantParam(PRICED_ID)).toBe(PRICED_ID);
  });

  it('rejects SKUs, garbage, arrays, and missing values without throwing', () => {
    expect(parseVariantParam('SEED-PB-HALO92-BASE')).toBeNull();
    expect(parseVariantParam('does-not-exist')).toBeNull();
    expect(parseVariantParam('')).toBeNull();
    expect(parseVariantParam([PRICED_ID])).toBeNull();
    expect(parseVariantParam(undefined)).toBeNull();
    expect(parseVariantParam(null)).toBeNull();
  });
});

describe('defaultVariantId', () => {
  it('returns null when there are no variants', () => {
    expect(defaultVariantId([], null)).toBeNull();
    expect(defaultVariantId([], PRICED_ID)).toBeNull();
  });

  it('selects the single variant automatically', () => {
    expect(defaultVariantId([priced(false)], null)).toBe(PRICED_ID);
  });

  it('honours a valid URL-selected variant', () => {
    const variants = [priced(true), { ...priced(true, PRICED_OOS_ID) }];
    expect(defaultVariantId(variants, PRICED_OOS_ID)).toBe(PRICED_OOS_ID);
  });

  it('falls back deterministically for unknown or invalid ids', () => {
    const variants = [priced(true)];
    expect(defaultVariantId(variants, UNKNOWN_ID)).toBe(PRICED_ID);
    expect(defaultVariantId(variants, 'not-a-uuid')).toBe(PRICED_ID);
  });

  it('prefers the first priced in-stock variant in mixed stock', () => {
    const variants = [
      { ...priced(false, PRICED_OOS_ID) },
      priced(true),
      callForPrice(true),
    ];
    expect(defaultVariantId(variants, null)).toBe(PRICED_ID);
  });

  it('falls back to an in-stock call-for-price variant when nothing is priced', () => {
    const variants = [{ ...priced(false, PRICED_OOS_ID) }, callForPrice(true)];
    expect(defaultVariantId(variants, null)).toBe(CALL_ID);
  });

  it('falls back to the first variant when everything is out of stock', () => {
    const variants = [{ ...priced(false, PRICED_OOS_ID) }, callForPrice(false)];
    expect(defaultVariantId(variants, null)).toBe(PRICED_OOS_ID);
  });
});

describe('getSelectedVariant', () => {
  it('returns null when there are no variants', () => {
    expect(getSelectedVariant([], null)).toBeNull();
  });

  it('returns the matching variant or the deterministic fallback', () => {
    const variants = [priced(true), callForPrice(false)];
    expect(getSelectedVariant(variants, CALL_ID)?.id).toBe(CALL_ID);
    expect(getSelectedVariant(variants, UNKNOWN_ID)?.id).toBe(PRICED_ID);
    expect(getSelectedVariant(variants, null)?.id).toBe(PRICED_ID);
  });

  it('works for option-less multi-variant products (flat selector fallback)', () => {
    const variants = [
      { ...priced(true, PRICED_OOS_ID), options: [] },
      { ...priced(true), options: [] },
    ];
    expect(getSelectedVariant(variants, PRICED_ID)?.sku).toBe('SKU-1111');
  });
});

function optioned(
  id: string,
  options: Array<{ attributeName: string; attributeSlug: string; value: string; valueSlug: string }>,
  inStock = true,
): CatalogProductVariantDto {
  return {
    id,
    sku: `SKU-${id.slice(0, 4)}`,
    name: null,
    price: '1000000',
    compareAtPrice: null,
    priceStatus: 'PRICED',
    inStock,
    options,
  };
}

const COLOR = 'color';
const STORAGE = 'storage';

describe('hasStructuredOptions', () => {
  it('is false for empty or option-less variant sets', () => {
    expect(hasStructuredOptions([])).toBe(false);
    expect(hasStructuredOptions([priced(true)])).toBe(false);
  });

  it('requires every variant to carry options', () => {
    const withOptions = optioned(PRICED_ID, [
      { attributeName: 'رنگ', attributeSlug: COLOR, value: 'مشکی', valueSlug: 'black' },
    ]);
    expect(hasStructuredOptions([withOptions, priced(true)])).toBe(false);
    expect(hasStructuredOptions([withOptions])).toBe(true);
  });
});

describe('groupVariantOptions', () => {
  it('groups by axis in first-seen order with variant membership', () => {
    const variants = [
      optioned(PRICED_ID, [
        { attributeName: 'رنگ', attributeSlug: COLOR, value: 'مشکی', valueSlug: 'black' },
        { attributeName: 'حافظه', attributeSlug: STORAGE, value: '128GB', valueSlug: '128gb' },
      ]),
      optioned(PRICED_OOS_ID, [
        { attributeName: 'رنگ', attributeSlug: COLOR, value: 'سفید', valueSlug: 'white' },
        { attributeName: 'حافظه', attributeSlug: STORAGE, value: '128GB', valueSlug: '128gb' },
      ]),
    ];
    const groups = groupVariantOptions(variants);
    expect(groups.map((group) => group.attributeSlug)).toEqual([COLOR, STORAGE]);
    expect(groups[0]!.values.map((entry) => entry.valueSlug)).toEqual([
      'black',
      'white',
    ]);
    expect(groups[1]!.values).toHaveLength(1);
    expect(groups[1]!.values[0]!.variantIds).toEqual([PRICED_ID, PRICED_OOS_ID]);
  });

  it('returns no groups for option-less variants', () => {
    expect(groupVariantOptions([priced(true)])).toEqual([]);
  });
});

describe('resolveVariant / isValueCompatible / selectionOfVariant', () => {
  const variants = [
    optioned(PRICED_ID, [
      { attributeName: 'رنگ', attributeSlug: COLOR, value: 'مشکی', valueSlug: 'black' },
      { attributeName: 'حافظه', attributeSlug: STORAGE, value: '128GB', valueSlug: '128gb' },
    ]),
    optioned(PRICED_OOS_ID, [
      { attributeName: 'رنگ', attributeSlug: COLOR, value: 'سفید', valueSlug: 'white' },
      { attributeName: 'حافظه', attributeSlug: STORAGE, value: '256GB', valueSlug: '256gb' },
    ]),
  ];

  it('reads a variant selection key', () => {
    expect(selectionOfVariant(variants[0]!)).toEqual({
      [COLOR]: 'black',
      [STORAGE]: '128gb',
    });
  });

  it('resolves exact combinations to concrete variants only', () => {
    expect(
      resolveVariant(variants, { [COLOR]: 'black', [STORAGE]: '128gb' })?.id,
    ).toBe(PRICED_ID);
    expect(
      resolveVariant(variants, { [COLOR]: 'black', [STORAGE]: '256gb' }),
    ).toBeNull();
    expect(resolveVariant(variants, {})).toBeNull();
  });

  it('flags incompatible values without guessing', () => {
    // سفید only exists with 256GB: pairing it with 128GB resolves nowhere.
    expect(
      isValueCompatible(variants, { [STORAGE]: '128gb' }, COLOR, 'white'),
    ).toBe(false);
    expect(
      isValueCompatible(variants, { [STORAGE]: '128gb' }, COLOR, 'black'),
    ).toBe(true);
  });
});
