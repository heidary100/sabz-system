import {
  buildFileIndex,
  createClaimants,
  resolveRow,
} from './woo-resolve';
import type { WooReferenceData } from './woo-reference';
import type { WooRecord } from './woo-parse';
import {
  buildProductPlan,
  buildRowHash,
  faError,
  parseWooPrice,
  readAttributeSlots,
  splitDottedName,
} from './woo-write';

function record(cells: Record<string, string>, line = 2): WooRecord {
  return { line, cells };
}

function refs(overrides: Partial<WooReferenceData> = {}): WooReferenceData {
  return {
    categories: [],
    brands: [],
    brandAliasOwners: new Map(),
    productSlugs: new Set(),
    variantSkus: new Set(),
    sourceKeys: new Set(),
    variantSkuToSourceKey: new Map(),
    ...overrides,
  };
}

const BASE = {
  'شناسه': '9001',
  'نوع': 'simple',
  'نام': 'کالای نمونه',
  'منتشر شده': '1',
  'قابل مشاهده در کاتالوگ': 'visible',
  'قیمت عادی': '18000000',
  'قیمت فروش ویژه': '15000000',
  'دسته‌ها': 'کالای دیجیتال',
};

async function planFor(cells: Record<string, string>, extraRefs: Partial<WooReferenceData> = {}) {
  const reference = refs(extraRefs);
  const rec = record(cells);
  const verdict = await resolveRow(rec, reference, buildFileIndex([rec]), createClaimants(reference));
  return { verdict, plan: buildProductPlan(rec, verdict) };
}

describe('parseWooPrice (SS-207, O-1 Rial verbatim)', () => {
  it('parses raw units with Latin/Persian thousands separators', () => {
    expect(parseWooPrice('18,000,000')).toBe(18000000);
    expect(parseWooPrice('18٬000٬000')).toBe(18000000);
  });

  it('rejects empty, zero, and negative values', () => {
    expect(parseWooPrice('')).toBeNull();
    expect(parseWooPrice('0')).toBeNull();
    expect(parseWooPrice('-5')).toBeNull();
  });
});

describe('buildRowHash (SS-207 resume)', () => {
  it('is stable and key-order independent', () => {
    const a = buildRowHash({ x: '1', y: '2' });
    const b = buildRowHash({ y: '2', x: '1' });
    const c = buildRowHash({ x: '1', y: '3' });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('faError (SS-207 Persian row errors)', () => {
  it('maps Prisma codes and passes service messages through', () => {
    expect(faError({ code: 'P2002' })).toContain('تکراری');
    expect(faError({ code: 'P2025' })).toContain('یافت نشد');
    expect(faError(new Error('قیمت نامعتبر است.'))).toBe('قیمت نامعتبر است.');
    expect(faError(null)).toContain('نامشخص');
  });
});

describe('splitDottedName + readAttributeSlots (SS-207 specs)', () => {
  it('splits dotted namespaces into group + name', () => {
    expect(splitDottedName('مشخصات کلی.وزن')).toEqual({ group: 'مشخصات کلی', name: 'وزن' });
    expect(splitDottedName('پردازنده')).toEqual({ group: null, name: 'پردازنده' });
  });

  it('reads the 22 numbered slots', () => {
    const slots = readAttributeSlots({ 'نام 1 صفت': 'برند', 'مقدار(های) 1 صفت': 'الف', 'نام 3 صفت': 'رم' });
    expect(slots.map((slot) => slot.name)).toEqual(['برند', 'رم']);
  });
});

describe('buildProductPlan (SS-207)', () => {
  it('maps a priced on-sale row to price=sale + compareAt=regular', async () => {
    const { verdict, plan } = await planFor(BASE);
    expect(verdict.action).toBe('CREATE');
    expect(plan).toMatchObject({
      price: '15000000',
      compareAtPrice: '18000000',
      priceStatus: 'PRICED',
      status: 'PUBLISHED',
      stockQty: 0,
      brandName: null,
    });
  });

  it('maps priceless published rows to CALL_FOR_PRICE with price 0', async () => {
    const { plan } = await planFor({ ...BASE, 'قیمت عادی': '', 'قیمت فروش ویژه': '' });
    expect(plan).toMatchObject({ price: '0', compareAtPrice: null, priceStatus: 'CALL_FOR_PRICE' });
  });

  it('drops compareAt on sale-without-regular edges', async () => {
    const { plan } = await planFor({ ...BASE, 'قیمت عادی': '', 'قیمت فروش ویژه': '12000000' });
    expect(plan).toMatchObject({ price: '0', compareAtPrice: null, priceStatus: 'CALL_FOR_PRICE' });
  });

  it('separates variant axes, specs, and brand slots', async () => {
    const { plan } = await planFor({
      ...BASE,
      'نام 1 صفت': 'انتخاب رنگ',
      'مقدار(های) 1 صفت': 'مشکی',
      'نام 2 صفت': 'برند',
      'مقدار(های) 2 صفت': 'FixtureBrand',
      'نام 3 صفت': 'مشخصات کلی.وزن',
      'مقدار(های) 3 صفت': '180 گرم',
      'متا: custom_attributes': 'ظرفیت: 1 ترابایت\nخط ویژگی بدون جداکننده',
    });
    expect(plan!.variantAxes).toEqual([{ name: 'انتخاب رنگ', value: 'مشکی' }]);
    expect(plan!.specs).toEqual([
      expect.objectContaining({ name: 'وزن', group: 'مشخصات کلی', source: 'WOO_ATTR' }),
    ]);
    expect(plan!.customSpecs).toEqual([
      expect.objectContaining({ name: 'ظرفیت', value: '1 ترابایت', source: 'WOO_CUSTOM' }),
    ]);
    // Brand slot never becomes a spec; bullets stay out of specs.
    expect(plan!.specs.some((spec) => spec.name === 'برند')).toBe(false);
  });

  it('returns null for SKIP verdicts', async () => {
    const { plan } = await planFor({ ...BASE, 'نام': '' });
    expect(plan).toBeNull();
  });

  it('orders media with second_image at gallery position 1', async () => {
    const { plan } = await planFor({
      ...BASE,
      'تصاویر': 'https://cdn.example.com/1.jpg, https://cdn.example.com/2.jpg',
      'متا: second_image': 'https://cdn.example.com/hover.jpg',
    });
    expect(plan!.media.map((item) => item.url)).toEqual([
      'https://cdn.example.com/1.jpg',
      'https://cdn.example.com/hover.jpg',
      'https://cdn.example.com/2.jpg',
    ]);
    expect(plan!.media[0]).toMatchObject({ sortOrder: 0, isPrimary: true });
  });
});
