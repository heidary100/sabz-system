import {
  buildFileIndex,
  classifyCustomLine,
  createClaimants,
  resolveRow,
} from './woo-resolve';
import type { WooReferenceData } from './woo-reference';
import type { WooRecord } from './woo-parse';

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
  'قیمت عادی': '10000000',
  'دسته‌ها': 'کالای دیجیتال',
};

describe('resolveRow (SS-206)', () => {
  it('rejects rows without identity, name, or known type', async () => {
    const empty = refs();
    const claimants = createClaimants(empty);
    await expect(
      resolveRow(record({ ...BASE, 'شناسه': '' }), empty, buildFileIndex([]), claimants),
    ).resolves.toMatchObject({ action: 'SKIP' });
    await expect(
      resolveRow(record({ ...BASE, 'نام': '' }), empty, buildFileIndex([]), claimants),
    ).resolves.toMatchObject({ action: 'SKIP' });
    await expect(
      resolveRow(record({ ...BASE, 'نوع': 'grouped' }), empty, buildFileIndex([]), claimants),
    ).resolves.toMatchObject({ action: 'SKIP' });
  });

  it('links variations by mother SKU and flags orphans', async () => {    const parent = record({
      ...BASE,
      'شناسه': '9003',
      'نوع': 'variable',
      'شناسه محصول': 'PARENT-SKU',
    });
    const child = record({
      ...BASE,
      'شناسه': '9004',
      'نوع': 'variation',
      'مادر': 'PARENT-SKU',
      'قیمت عادی': '',
    });
    const orphan = record({
      ...BASE,
      'شناسه': '9005',
      'نوع': 'variation',
      'مادر': '',
    });
    const index = buildFileIndex([parent, child, orphan]);
    const claimants = createClaimants(refs());

    const linked = await resolveRow(child, refs(), index, claimants);
    expect(linked.variationLink).toBe('linked');
    expect(linked.parentSourceKey).toBe('WOOCOMMERCE:9003');

    const lost = await resolveRow(orphan, refs(), index, claimants);
    expect(lost).toMatchObject({ action: 'SKIP', variationLink: 'orphan' });
  });

  it('classifies pricing: priced, sale, priceless, and the sale-only edge', async () => {
    const empty = refs();
    const priced = await resolveRow(
      record({ ...BASE, 'قیمت فروش ویژه': '12000000' }),
      empty,
      buildFileIndex([]),
      createClaimants(empty),
    );
    expect(priced).toMatchObject({ priceStatus: 'PRICED', hasSale: true });

    const priceless = await resolveRow(
      record({ ...BASE, 'قیمت عادی': '' }),
      empty,
      buildFileIndex([]),
      createClaimants(empty),
    );
    expect(priceless).toMatchObject({
      priceStatus: 'CALL_FOR_PRICE',
      status: 'PUBLISHED',
    });

    const edge = await resolveRow(
      record({ ...BASE, 'قیمت عادی': '', 'قیمت فروش ویژه': '9000000' }),
      empty,
      buildFileIndex([]),
      createClaimants(empty),
    );
    expect(edge.hasSale).toBe(false);
    expect(edge.reasons.join(' ')).toContain('sale-without-regular');
  });

  it('proposes DRAFT for drafts and shells without variations', async () => {
    const empty = refs();
    const draft = await resolveRow(
      record({ ...BASE, 'منتشر شده': '0' }),
      empty,
      buildFileIndex([]),
      createClaimants(empty),
    );
    expect(draft).toMatchObject({ action: 'CREATE', status: 'DRAFT' });

    const shell = record({
      ...BASE,
      'شناسه': '9003',
      'نوع': 'variable',
      'شناسه محصول': 'PARENT-SKU',
      'قیمت عادی': '',
    });
    const gated = await resolveRow(
      shell,
      empty,
      buildFileIndex([shell]),
      createClaimants(empty),
    );
    expect(gated).toMatchObject({ status: 'DRAFT', linkedVariations: 0 });
    expect(gated.reasons.join(' ')).toContain('shell-without-variations');
  });

  it('marks known source keys UPDATE and reports SKU collisions', async () => {
    const known = refs({
      sourceKeys: new Set(['WOOCOMMERCE:9001']),
      variantSkus: new Set(['TAKEN-SKU']),
    });
    const update = await resolveRow(
      record(BASE),
      known,
      buildFileIndex([]),
      createClaimants(known),
    );
    expect(update.action).toBe('UPDATE');

    const collision = await resolveRow(
      record({ ...BASE, 'شناسه': '9009', 'شناسه محصول': 'TAKEN-SKU' }),
      known,
      buildFileIndex([]),
      createClaimants(known),
    );
    expect(collision.skuCollision).toBe(true);
  });

  it('resolves deepest category, missing tail, and the uncategorized bucket', async () => {
    const tree = refs({
      categories: [
        { id: 'c1', name: 'کالای دیجیتال', slug: 'digital', parentId: null },
        { id: 'c2', name: 'صوتی', slug: 'audio', parentId: 'c1' },
      ],
    });
    const row = await resolveRow(
      record({
        ...BASE,
        'دسته‌ها': 'کالای دیجیتال > صوتی > هدفون, کالای دیجیتال',
      }),
      tree,
      buildFileIndex([]),
      createClaimants(tree),
    );
    expect(row.category.leaf).toBe('هدفون');
    expect(row.category.missingSegments).toEqual(['هدفون']);
    expect(row.action).toBe('CREATE');

    const bucket = await resolveRow(
      record({ ...BASE, 'دسته‌ها': 'دسته بندی نشده' }),
      tree,
      buildFileIndex([]),
      createClaimants(tree),
    );
    expect(bucket).toMatchObject({ action: 'SKIP' });
    expect(bucket.category.uncategorized).toBe(true);
  });

  it('prefers the brand column over the brand attribute', async () => {
    const tree = refs({
      brands: [{ id: 'b1', name: 'ColumnBrand', slug: 'columnbrand' }],
    });
    const row = await resolveRow(
      record({
        ...BASE,
        'برندها': 'ColumnBrand',
        'نام 1 صفت': 'برند',
        'مقدار(های) 1 صفت': 'AttrBrand',
      }),
      tree,
      buildFileIndex([]),
      createClaimants(tree),
    );
    expect(row.brandName).toBe('ColumnBrand');
    expect(row.brandToCreate).toBe(false);

    const missing = await resolveRow(
      record({ ...BASE, 'برندها': 'NewBrand' }),
      tree,
      buildFileIndex([]),
      createClaimants(tree),
    );
    expect(missing.brandToCreate).toBe(true);

    const bare = await resolveRow(record(BASE), tree, buildFileIndex([]), createClaimants(tree));
    expect(bare.brandName).toBeNull();
  });

  it('resolves a curated cross-language brand alias instead of creating a duplicate', async () => {
    const tree = refs({
      brands: [{ id: 'b1', name: 'گرین لاین', slug: 'green-lion' }],
      brandAliasOwners: new Map([
        [
          'green lion',
          {
            brand: { id: 'b1', name: 'گرین لاین', slug: 'green-lion' },
            deletedAt: null,
            mergedIntoBrandId: null,
          },
        ],
      ]),
    });
    const row = await resolveRow(
      record({ ...BASE, 'برندها': 'GREEN LION' }),
      tree,
      buildFileIndex([]),
      createClaimants(tree),
    );
    expect(row.brandName).toBe('GREEN LION');
    expect(row.brandToCreate).toBe(false);
    expect(row.reasons.join(' ')).toContain('brand-alias-resolved');
  });

  it('previews suffixed slugs on collision', async () => {
    const taken = refs();
    const claimants = createClaimants(taken);
    claimants.slugs.add('lptap');
    const row = await resolveRow(
      record({ ...BASE, 'نام': 'لپتاپ' }),
      taken,
      buildFileIndex([]),
      claimants,
    );
    expect(row.slugPreview).toBe('lptap-2');
    expect(row.slugSuffixed).toBe(true);
  });

  it('counts media, tags, specs, and custom-attribute parsing', async () => {    const row = await resolveRow(
      record({
        ...BASE,
        'تصاویر': 'https://x/1.jpg, https://x/1.jpg, https://x/2.jpg',
        'متا: second_image': 'https://x/2.jpg',
        'برچسب‌ها': 'a, b',
        'نام 1 صفت': 'انتخاب رنگ',
        'مقدار(های) 1 صفت': 'مشکی',
        'صفت 1 سراسری': '1',
        'متا: custom_attributes': 'ظرفیت: 1 ترابایت\nخط خراب بدون جداکننده',
        'متا: product_english_name': 'Sample EN',
        'متا: garrantie': 'گارانتی',
        'متا: rank_math_focus_keyword': 'kw',
      }),
      refs(),
      buildFileIndex([]),
      createClaimants(refs()),
    );
    expect(row.media).toMatchObject({ count: 3, distinct: 2, hasSecondImage: true });
    expect(row.content).toMatchObject({
      tagCount: 2,
      attributeSlots: 1,
      variantAxis: true,
      customLines: 2,
      customBullets: 1,
      customUnparsed: 0,
      hasEnglishName: true,
      hasWarranty: true,
      hasSeo: true,
    });
  });

  it('inherits the parent taxonomy for linked variations', async () => {
    const parent = record({
      ...BASE,
      'شناسه': '9003',
      'نوع': 'variable',
      'شناسه محصول': 'PARENT-SKU',
      'دسته‌ها': 'کالای دیجیتال > صوتی',
      'برندها': 'ParentBrand',
    });
    const child = record({
      ...BASE,
      'شناسه': '9004',
      'نوع': 'variation',
      'مادر': 'PARENT-SKU',
      'دسته‌ها': '',
      'قیمت عادی': '',
    });
    const index = buildFileIndex([parent, child]);
    const claimants = createClaimants(refs());

    const linked = await resolveRow(child, refs(), index, claimants);
    expect(linked).toMatchObject({ action: 'CREATE', variationLink: 'linked' });
    expect(linked.category.leaf).toBe('صوتی');
    expect(linked.category.missingSegments).toEqual(['کالای دیجیتال', 'صوتی']);
    expect(linked.brandName).toBeNull();
    expect(linked.reasons.join(' ')).toContain('inherits-category');
  });

  it('flags variation brand values conflicting with the parent', async () => {
    const parent = record({
      ...BASE,
      'شناسه': '9003',
      'نوع': 'variable',
      'شناسه محصول': 'PARENT-SKU',
      'برندها': 'ParentBrand',
    });
    const child = record({
      ...BASE,
      'شناسه': '9004',
      'نوع': 'variation',
      'مادر': 'PARENT-SKU',
      'نام 1 صفت': 'برند',
      'مقدار(های) 1 صفت': 'ChildBrand',
    });
    const index = buildFileIndex([parent, child]);
    const linked = await resolveRow(child, refs(), index, createClaimants(refs()));
    expect(linked.reasons.join(' ')).toContain('brand-mismatch');
    expect(linked.flags).toContain('brand-mismatch');
  });
});

describe('classifyCustomLine (SS-206)', () => {
  it('separates specs, bullets, empties, and true dirt', () => {
    expect(classifyCustomLine('ظرفیت: 1 ترابایت')).toBe('spec');
    expect(classifyCustomLine('A+ Grade')).toBe('bullet');
    expect(classifyCustomLine('مقاوم در برابر آب')).toBe('bullet');
    expect(classifyCustomLine('   ')).toBeNull();
    expect(classifyCustomLine(': بدون کلید')).toBe('unparseable');
    expect(classifyCustomLine(`کلید: ${'x'.repeat(600)}`)).toBe('unparseable');
  });
});
