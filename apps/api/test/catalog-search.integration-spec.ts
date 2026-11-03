import { ProductCondition, ProductStatus, WarehouseStatus } from '@prisma/client';
import {
  compactFa,
  normalizeFa,
  normalizeSku,
  NORMALIZE_FA_PARITY_FIXTURES,
  NORMALIZE_SKU_PARITY_FIXTURES,
  truncateQuery,
  MAX_QUERY_GRAPHEMES,
} from '@sabz/search';
import { PrismaService } from '../src/common/database/prisma.service';
import { recomputeProductMinPrice } from '../src/modules/products/min-price';
import { PublicCatalogService } from '../src/modules/products/public-catalog.service';
import { PricingService } from '../src/modules/pricing/pricing.service';

jest.setTimeout(60_000);

/**
 * Catalog search integration (SS-216).
 *
 * Three layers against the dedicated test database (which `migrate deploy`
 * builds from all committed migrations):
 *
 * 1. Migration guard — pg_trgm, the three normalizer functions and all
 *    expression indexes exist after a fresh migrate (also the tripwire for
 *    Prisma shadow-drift dropping custom SQL objects).
 * 2. SQL↔TS parity — the PostgreSQL normalizers produce EXACTLY the shared
 *    TypeScript outputs over the shared fixture lists (no tolerance).
 * 3. Search behavior — real probes through PublicCatalogService: Persian
 *    normalization, compounds, typo tolerance, SKU tiers, ranking
 *    relations, filters, sorts, pagination.
 */
describe('Catalog search (SS-216)', () => {
  let prisma: PrismaService;
  let catalog: PublicCatalogService;

  const createdProductIds: string[] = [];
  const createdVariantIds: string[] = [];
  const createdBrandIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdTagIds: string[] = [];
  const createdWarehouseIds: string[] = [];

  function uniqueSuffix(): string {
    return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  }

  interface FixtureSpec {
    name: string;
    nameEn?: string;
    subtitle?: string;
    focusKeyword?: string;
    brandName?: string;
    brandNameEn?: string;
    categoryName?: string;
    tags?: string[];
    skus: string[];
    price?: string;
    status?: ProductStatus;
  }

  /** Creates one published fixture product with live variants and tags.
   *  SKUs are suffixed for uniqueness; the generated SKUs are returned. */
  async function createFixture(spec: FixtureSpec): Promise<{ id: string; skus: string[] }> {
    const suffix = uniqueSuffix();
    const skus = spec.skus.map((sku) => `${sku}-${suffix}`);
    let brandId: string | undefined;
    if (spec.brandName) {
      const brand = await prisma.brand.create({
        data: {
          name: spec.brandName,
          slug: `brand-ss216-${suffix}`,
          nameEn: spec.brandNameEn ?? null,
        },
      });
      createdBrandIds.push(brand.id);
      brandId = brand.id;
    }
    const category = await prisma.category.create({
      data: {
        name: spec.categoryName ?? `دسته آزمون ${suffix}`,
        slug: `cat-ss216-${suffix}`,
      },
    });
    createdCategoryIds.push(category.id);
    const product = await prisma.product.create({
      data: {
        name: spec.name,
        slug: `prod-ss216-${suffix}`,
        nameEn: spec.nameEn ?? null,
        subtitle: spec.subtitle ?? null,
        focusKeyword: spec.focusKeyword ?? null,
        brandId: brandId ?? null,
        categoryId: category.id,
        condition: ProductCondition.NEW,
        status: spec.status ?? ProductStatus.PUBLISHED,
        sourceSystem: 'WOOCOMMERCE',
        sourceId: suffix,
        sourceType: 'simple',
        variants: {
          create: skus.map((sku, index) => ({
            sku,
            name: `متغیر ${index + 1}`,
            price: spec.price ?? '1000000',
            priceStatus: 'PRICED',
          })),
        },
      },
      include: { variants: { select: { id: true } } },
    });
    createdProductIds.push(product.id);
    createdVariantIds.push(...product.variants.map((variant) => variant.id));
    // SS-217: raw fixture writes bypass the service writer, so maintain the
    // denormalized minPrice column explicitly.
    await recomputeProductMinPrice(prisma, product.id);
    for (const [index, tagName] of (spec.tags ?? []).entries()) {
      const tag = await prisma.tag.create({
        data: {
          name: tagName,
          key: compactFa(tagName),
          slug: `tag-ss216-${suffix}-${index}`,
        },
      });
      createdTagIds.push(tag.id);
      await prisma.productTag.create({
        data: { productId: product.id, tagId: tag.id, sortOrder: index },
      });
    }
    return { id: product.id, skus };
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    catalog = new PublicCatalogService(prisma, new PricingService(prisma));
  });

  afterAll(async () => {
    // InventoryItem restricts variant deletion, so it goes first; variants
    // cascade with their product.
    await prisma.productTag.deleteMany({
      where: { productId: { in: createdProductIds } },
    });
    await prisma.inventoryItem.deleteMany({
      where: { variantId: { in: createdVariantIds } },
    });
    await prisma.product.deleteMany({
      where: { id: { in: createdProductIds } },
    });
    await prisma.tag.deleteMany({ where: { id: { in: createdTagIds } } });
    await prisma.brand.deleteMany({ where: { id: { in: createdBrandIds } } });
    await prisma.category.deleteMany({
      where: { id: { in: createdCategoryIds } },
    });
    await prisma.warehouse.deleteMany({
      where: { id: { in: createdWarehouseIds } },
    });
    await prisma.$disconnect();
  });

  // ---------------------------------------------------------------------
  // 1. Migration guard
  // ---------------------------------------------------------------------

  describe('migration objects exist after fresh migrate', () => {
    it('has the pg_trgm extension', async () => {
      const rows = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT count(*) AS count FROM pg_extension WHERE extname = 'pg_trgm'`;
      expect(Number(rows[0]?.count)).toBe(1);
    });

    it('has the three normalizer functions', async () => {
      const rows = await prisma.$queryRaw<{ proname: string }[]>`
        SELECT proname FROM pg_proc
        WHERE pronamespace = 'public'::regnamespace
          AND proname IN ('normalize_fa', 'compact_fa', 'normalize_sku')`;
      expect(new Set(rows.map((row) => row.proname))).toEqual(
        new Set(['normalize_fa', 'compact_fa', 'normalize_sku']),
      );
    });

    it('has all eight search expression indexes', async () => {
      const rows = await prisma.$queryRaw<{ indexname: string }[]>`
        SELECT indexname FROM pg_indexes
        WHERE indexname IN (
          'Product_search_name_trgm_idx',
          'Product_search_nameEn_trgm_idx',
          'Product_search_aux_trgm_idx',
          'ProductVariant_search_sku_exact_idx',
          'ProductVariant_search_sku_trgm_idx',
          'Brand_search_name_trgm_idx',
          'Category_search_name_trgm_idx',
          'Tag_search_name_trgm_idx'
        )`;
      expect(rows).toHaveLength(8);
    });
  });

  // ---------------------------------------------------------------------
  // 2. SQL ↔ TS parity (exact, no tolerance)
  // ---------------------------------------------------------------------

  describe('SQL/TS normalizer parity', () => {
    it.each(NORMALIZE_FA_PARITY_FIXTURES)(
      'normalize_fa matches normalizeFa for %j',
      async (fixture) => {
        const rows = await prisma.$queryRaw<{ result: string }[]>`
          SELECT normalize_fa(${fixture}) AS result`;
        expect(rows[0]?.result).toBe(normalizeFa(fixture));
      },
    );

    it.each(NORMALIZE_FA_PARITY_FIXTURES)(
      'compact_fa matches compactFa for %j',
      async (fixture) => {
        const rows = await prisma.$queryRaw<{ result: string }[]>`
          SELECT compact_fa(${fixture}) AS result`;
        expect(rows[0]?.result).toBe(compactFa(fixture));
      },
    );

    it.each(NORMALIZE_SKU_PARITY_FIXTURES)(
      'normalize_sku matches normalizeSku for %j',
      async (fixture) => {
        const rows = await prisma.$queryRaw<{ result: string }[]>`
          SELECT normalize_sku(${fixture}) AS result`;
        expect(rows[0]?.result).toBe(normalizeSku(fixture));
      },
    );

    // SS-264: the fuzzy gate measures token length IN SQL over the same
    // normalized expression the indexes use. These pin the TS mirror
    // (`Array.from(normalizeFa(x)).length`) so the gate cannot drift.
    it.each(NORMALIZE_FA_PARITY_FIXTURES)(
      'char_length(normalize_fa) equals the TS code-point count for %j',
      async (fixture) => {
        const rows = await prisma.$queryRaw<{ result: number }[]>`
          SELECT char_length(normalize_fa(${fixture})) AS result`;
        expect(rows[0]?.result).toBe(Array.from(normalizeFa(fixture)).length);
      },
    );

    it.each(NORMALIZE_SKU_PARITY_FIXTURES)(
      'char_length(normalize_sku) equals the TS code-point count for %j',
      async (fixture) => {
        const rows = await prisma.$queryRaw<{ result: number }[]>`
          SELECT char_length(normalize_sku(${fixture})) AS result`;
        expect(rows[0]?.result).toBe(Array.from(normalizeSku(fixture)).length);
      },
    );
  });

  // ---------------------------------------------------------------------
  // 3. Search behavior probes
  // ---------------------------------------------------------------------

  describe('search probes', () => {
    let faProduct: { id: string };
    let enProduct: { id: string };
    let skuProduct: { id: string; skus: string[] };
    let brandProduct: { id: string };
    let tagProduct: { id: string };
    let keywordProduct: { id: string };
    let draftProduct: { id: string };
    let gateProduct: { id: string };

    const FA_NAME = 'گوشی موبایل آزمونی سرسبز';
    const EN_NAME = 'Galaxy TestPhone X54';

    beforeAll(async () => {
      faProduct = await createFixture({
        name: FA_NAME,
        skus: ['SS216-FA-BASE'],
        price: '2000000',
      });
      enProduct = await createFixture({
        name: `محصول آزمونی انگلیسی ${uniqueSuffix()}`,
        nameEn: EN_NAME,
        skus: ['SS216-EN-BASE'],
        price: '3000000',
      });
      skuProduct = await createFixture({
        name: `محصول آزمونی کد ${uniqueSuffix()}`,
        skus: ['SS216-SKU-EXACT-77'],
        price: '4000000',
      });
      brandProduct = await createFixture({
        name: `محصول آزمونی برند ${uniqueSuffix()}`,
        brandName: 'سرسبزتک آزمونی',
        brandNameEn: 'SabzTekTest',
        categoryName: 'دسته لپ‌تاپ آزمونی',
        skus: ['SS216-BRAND-BASE'],
      });
      tagProduct = await createFixture({
        name: `محصول آزمونی برچسب ${uniqueSuffix()}`,
        tags: ['برچسب‌واژه آزمونی'],
        skus: ['SS216-TAG-BASE'],
      });
      keywordProduct = await createFixture({
        name: `محصول آزمونی کلیدواژه ${uniqueSuffix()}`,
        subtitle: 'زیرعنوان ویژه پاوربانک خورشیدی',
        focusKeyword: 'پاوربانک آفتابی',
        skus: ['SS216-KW-BASE'],
      });
      draftProduct = await createFixture({
        name: FA_NAME,
        skus: ['SS216-DRAFT-BASE'],
        status: ProductStatus.DRAFT,
      });
      // SS-264 gate probe host: «باردگان» fuzz-matches the 5-cp «باردی» and
      // the 6-cp «باردیک» (pre-gate), contains the 4-cp «بارد», and matches
      // none of them exactly — a clean single-tier probe per token length.
      gateProduct = await createFixture({
        name: 'گوشی آزمون باردگان زرد',
        skus: ['SS264-GATE-BASE'],
        price: '1500000',
      });
    });

    it('finds a product by an exact Persian name token', async () => {
      const result = await catalog.listProducts({ q: 'سرسبز' });
      expect(result.items.map((item) => item.id)).toContain(faProduct.id);
    });

    it('treats ZWNJ, space and multi-space variants identically for ungated tiers', async () => {
      const spaced = await catalog.listProducts({ q: 'گوشی موبایل آزمونی' });
      const zwnj = await catalog.listProducts({ q: 'گوشی\u200cموبایل آزمونی' });
      const wide = await catalog.listProducts({ q: 'گوشی    موبایل آزمونی' });
      const idsOf = (r: { items: { id: string }[] }) =>
        r.items.map((item) => item.id).sort();
      // Space and multi-space tokenize identically → identical result sets.
      expect(idsOf(spaced)).toEqual(idsOf(wide));
      expect(idsOf(spaced)).toContain(faProduct.id);
      // The ZWNJ compound is ONE 11-cp token; the space form is two tokens
      // («گوشی» = 4 cp, fuzzy-gated since SS-264). The long compound's fuzzy
      // tier can match MORE than the split tokens (e.g. a name-initial
      // «گوشی» run), so full set-equality across tokenizations no longer
      // holds — what must hold is that the target is found by every spelling.
      expect(idsOf(zwnj)).toContain(faProduct.id);
    });

    it('matches Arabic ي/ك spellings against Persian data', async () => {
      // The data holds Persian ی/ک; the query uses Arabic yeh (U+064A) and
      // Arabic kaf (U+0643) — the classic keyboard-variant miss.
      const arabicYeh = await catalog.listProducts({
        q: '\u0645\u0648\u0628\u0627\u064a\u0644 \u0622\u0632\u0645\u0648\u0646\u064a',
      });
      expect(arabicYeh.items.map((item) => item.id)).toContain(faProduct.id);
      const arabicKaf = await catalog.listProducts({
        q: '\u0633\u0631\u0633\u0628\u0632\u062a\u0643',
      });
      expect(arabicKaf.items.map((item) => item.id)).toContain(brandProduct.id);
    });

    it('matches the madda spelling via the contains tier (5 cp: fuzzy-gated since SS-264)', async () => {
      // «آزمون» (5 code points) is a substring of the indexed «آزمونی», so
      // this rides the contains tier; since SS-264 it is BELOW the fuzzy
      // gate. The pure trigram tier is exercised at the 6-cp boundary in the
      // SS-264 describe below.
      const result = await catalog.listProducts({ q: '\u0622\u0632\u0645\u0648\u0646' });
      expect(result.items.map((item) => item.id)).toContain(faProduct.id);
    });

    it('SS-264: keeps a 5-cp near-word out of fuzzy entirely', async () => {
      // «باردی» shares a long trigram run with «باردگان» (word_similarity
      // far above 0.3 pre-gate) but is neither a substring nor above
      // FUZZY_MIN_TOKEN_LENGTH — it must match nothing at all.
      const result = await catalog.listProducts({ q: 'باردی' });
      expect(result.items.map((item) => item.id)).not.toContain(faProduct.id);
      expect(result.total).toBe(0);
    });

    it('SS-264: keeps trigram typo tolerance at the 6-cp boundary', async () => {
      // «باردیک» (6 code points) stays fuzzy-eligible and finds the product
      // that exact/prefix/contains branches all miss.
      const result = await catalog.listProducts({ q: 'باردیک' });
      expect(result.items.map((item) => item.id)).toContain(gateProduct.id);
    });

    it('SS-264: short tokens still match through the contains tier', async () => {
      // «بارد» (4 cp) is a substring of «باردگان» — contains is ungated.
      const result = await catalog.listProducts({ q: 'بارد' });
      expect(result.items.map((item) => item.id)).toContain(gateProduct.id);
    });

    it('SS-264: drops pure-fuzzy typo recall below the boundary (documented tradeoff)', async () => {
      // «ازمون» (4 cp, no madda, NOT a substring of «آزمونی») matched only
      // via the trigram tier before the gate. Short-token typo tolerance is
      // the accepted cost of the precision gate (issue #307).
      const result = await catalog.listProducts({ q: 'ازمون' });
      expect(result.items.map((item) => item.id)).not.toContain(faProduct.id);
    });

    it('finds products by English model name', async () => {
      const result = await catalog.listProducts({ q: 'TestPhone' });
      expect(result.items.map((item) => item.id)).toContain(enProduct.id);
    });

    it('ranks exact SKU first, above all textual matches', async () => {
      const result = await catalog.listProducts({ q: skuProduct.skus[0] ?? '' });
      expect(result.items[0]?.id).toBe(skuProduct.id);
      // The exact-SKU product is unique in relevance tier 1000; no other row
      // can share the top slot.
      const skuRows = result.items.filter((item) => item.id === skuProduct.id);
      expect(skuRows).toHaveLength(1);
    });

    it('supports SKU prefix search', async () => {
      const result = await catalog.listProducts({ q: 'SS216-SKU-EXACT' });
      expect(result.items.map((item) => item.id)).toContain(skuProduct.id);
    });

    it('tolerates a SKU typo below the exact tiers', async () => {
      const exactSku = skuProduct.skus[0] ?? '';
      const exact = await catalog.listProducts({ q: exactSku });
      // Corrupt one character mid-string: not a prefix, only trigram-similar.
      const typo = await catalog.listProducts({
        q: exactSku.replace('EXACT-77-', 'EXACT-78-'),
      });
      expect(typo.items.map((item) => item.id)).toContain(skuProduct.id);
      // Relational ranking: the exact query must rank the product higher than
      // the fuzzy one — measured by position among shared results.
      const exactPosition = exact.items.findIndex((item) => item.id === skuProduct.id);
      const typoPosition = typo.items.findIndex((item) => item.id === skuProduct.id);
      expect(exactPosition).toBe(0);
      expect(exactPosition).toBeLessThanOrEqual(typoPosition);
    });

    it('finds products by brand name and brand nameEn', async () => {
      const fa = await catalog.listProducts({ q: 'سرسبزتک' });
      expect(fa.items.map((item) => item.id)).toContain(brandProduct.id);
      const en = await catalog.listProducts({ q: 'SabzTekTest' });
      expect(en.items.map((item) => item.id)).toContain(brandProduct.id);
    });

    it('finds products by category name including compound variants', async () => {
      // The ZWNJ query normalizes to «لپ تاپ» (6 cp) and contains-matches the
      // normalized category name «دسته لپ تاپ آزمونی» — the contains tier is
      // ungated. The JOINED 5-cp spelling «لپتاپ» no longer fuzz-matches
      // spaced/ZWNJ compound names (SS-264 boundary; measured on the live
      // catalog: 134 → 125 hits with battery recall intact).
      const result = await catalog.listProducts({ q: 'لپ\u200cتاپ آزمونی' });
      expect(result.items.map((item) => item.id)).toContain(brandProduct.id);
    });

    it('finds products by tag name', async () => {
      const result = await catalog.listProducts({ q: 'برچسب\u200cواژه' });
      expect(result.items.map((item) => item.id)).toContain(tagProduct.id);
    });

    it('finds products by subtitle and focus keyword (imported-shape rows)', async () => {
      const bySubtitle = await catalog.listProducts({ q: 'خورشیدی' });
      expect(bySubtitle.items.map((item) => item.id)).toContain(keywordProduct.id);
      const byKeyword = await catalog.listProducts({ q: 'آفتابی' });
      expect(byKeyword.items.map((item) => item.id)).toContain(keywordProduct.id);
    });

    it('requires every token to match somewhere (token-AND across fields)', async () => {
      const both = await catalog.listProducts({ q: 'سرسبزتک آزمونی' });
      expect(both.items.map((item) => item.id)).toContain(brandProduct.id);
      // A token that matches nothing eliminates all rows. (Avoid digits:
      // fixture suffixes appear in slugs and would fuzzy-match.)
      const none = await catalog.listProducts({ q: 'سرسبزتک زیگزاگ‌ناخن' });
      expect(none.items).toHaveLength(0);
      expect(none.total).toBe(0);
    });

    it('excludes draft and soft-deleted products from search', async () => {
      const result = await catalog.listProducts({ q: 'سرسبز' });
      const ids = result.items.map((item) => item.id);
      expect(ids).toContain(faProduct.id);
      expect(ids).not.toContain(draftProduct.id);
    });

    it('never returns duplicate products and reports exact totals', async () => {
      const result = await catalog.listProducts({ q: 'آزمونی', limit: 50 });
      const ids = result.items.map((item) => item.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(result.total).toBeGreaterThanOrEqual(6);
    });

    it('paginates stably without overlap between pages', async () => {
      const page1 = await catalog.listProducts({ q: 'آزمونی', page: 1, limit: 2 });
      const page2 = await catalog.listProducts({ q: 'آزمونی', page: 2, limit: 2 });
      expect(page1.items).toHaveLength(2);
      expect(page1.total).toBeGreaterThanOrEqual(5);
      const ids1 = page1.items.map((item) => item.id);
      const ids2 = page2.items.map((item) => item.id);
      expect(ids1.some((id) => ids2.includes(id))).toBe(false);
      // Deterministic: the same page query returns the same page.
      const page1Again = await catalog.listProducts({ q: 'آزمونی', page: 1, limit: 2 });
      expect(page1Again.items.map((item) => item.id)).toEqual(ids1);
    });

    it('ranks an exact name match above a contains-only match', async () => {
      // Single token: exactProduct's name IS the query (tier 500), while
      // containsProduct merely contains it (tier 200). Relational assertion.
      const query = 'یگانگی';
      const exact = await createFixture({
        name: query,
        skus: [`SS216-RANK-EXACT-${uniqueSuffix()}`],
      });
      const contains = await createFixture({
        name: `${query} پیشرفته`,
        skus: [`SS216-RANK-CONTAINS-${uniqueSuffix()}`],
      });
      const result = await catalog.listProducts({ q: query, limit: 50 });
      const exactPosition = result.items.findIndex((item) => item.id === exact.id);
      const containsPosition = result.items.findIndex((item) => item.id === contains.id);
      expect(exactPosition).toBeGreaterThanOrEqual(0);
      expect(containsPosition).toBeGreaterThanOrEqual(0);
      expect(exactPosition).toBeLessThan(containsPosition);
    });

    it('composes search with category subtree, brand, condition and price filters', async () => {
      // Brand product lives in «دسته لپ‌تاپ آزمونی»; searching its category
      // with a brand token must find it, another category must not. The ZWNJ
      // spelling contains-matches the normalized category name (the joined
      // 5-cp «لپتاپ» lost its fuzzy path to compound names — SS-264).
      const inCategory = await catalog.listProducts({
        q: 'لپ\u200cتاپ',
        brand: undefined,
      });
      expect(inCategory.items.map((item) => item.id)).toContain(brandProduct.id);

      const brandFiltered = await catalog.listProducts({
        q: 'آزمونی',
        brand: 'unknown-brand-ss216',
      });
      expect(brandFiltered.total).toBe(0);

      const priceFiltered = await catalog.listProducts({
        q: 'آزمونی',
        priceFrom: '3500000',
        priceTo: '4500000',
      });
      const priceIds = priceFiltered.items.map((item) => item.id);
      expect(priceIds).toContain(skuProduct.id); // 4,000,000
      expect(priceIds).not.toContain(faProduct.id); // 2,000,000

      const conditionFiltered = await catalog.listProducts({
        q: 'آزمونی',
        condition: 'USED',
      });
      expect(conditionFiltered.total).toBe(0);
    });
  });

  describe('search with inventory truth and explicit sorts', () => {
    let inStockProduct: { id: string };
    let outOfStockProduct: { id: string };
    let cheapProduct: { id: string };
    let warehouseId: string;

    const NAME_TOKEN = 'هدست‌آزون سورت';

    beforeAll(async () => {
      const suffix = uniqueSuffix();
      const warehouse = await prisma.warehouse.create({
        data: {
          code: `WH-SS216-${suffix}`,
          name: `انبار آزمون ${suffix}`,
          status: WarehouseStatus.ACTIVE,
        },
      });
      createdWarehouseIds.push(warehouse.id);
      warehouseId = warehouse.id;

      inStockProduct = await createFixture({
        name: `${NAME_TOKEN} Zeta`,
        skus: [`SS216-SORT-RICH-${suffix}`],
        price: '5000000',
      });
      cheapProduct = await createFixture({
        name: `${NAME_TOKEN} Alpha`,
        skus: [`SS216-SORT-CHEAP-${suffix}`],
        price: '1000000',
      });
      outOfStockProduct = await createFixture({
        name: `${NAME_TOKEN} Mid`,
        skus: [`SS216-SORT-EMPTY-${suffix}`],
        price: '2000000',
      });

      const variants = await prisma.productVariant.findMany({
        where: {
          productId: {
            in: [inStockProduct.id, outOfStockProduct.id, cheapProduct.id],
          },
        },
        select: { id: true, productId: true },
      });
      for (const variant of variants) {
        await prisma.inventoryItem.create({
          data: {
            warehouseId,
            variantId: variant.id,
            // Out-of-stock fixture: fully reserved (onHand == reserved).
            quantityOnHand: variant.productId === outOfStockProduct.id ? 0 : 7,
            quantityReserved: 0,
          },
        });
      }
    });

    it('composes inStockOnly with q using the SS-112 inventory truth', async () => {
      const result = await catalog.listProducts({
        q: 'سورت',
        inStockOnly: true,
      });
      const ids = result.items.map((item) => item.id);
      expect(ids).toContain(inStockProduct.id);
      expect(ids).toContain(cheapProduct.id);
      expect(ids).not.toContain(outOfStockProduct.id);
    });

    it('keeps relevance primary for the default sort', async () => {
      const result = await catalog.listProducts({ q: 'سورت' });
      // Both same-name products match; deterministic order required.
      const ids = result.items.map((item) => item.id);
      expect(ids).toContain(inStockProduct.id);
      expect(ids).toContain(cheapProduct.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('applies explicit price sorts over the search predicate', async () => {
      const asc = await catalog.listProducts({
        q: 'سورت',
        sort: 'price_asc',
      });
      const ascPrices = asc.items
        .filter((item) => item.priceFrom !== '')
        .map((item) => Number(item.priceFrom));
      expect(ascPrices).toEqual([...ascPrices].sort((a, b) => a - b));

      const desc = await catalog.listProducts({
        q: 'سورت',
        sort: 'price_desc',
      });
      const descPrices = desc.items
        .filter((item) => item.priceFrom !== '')
        .map((item) => Number(item.priceFrom));
      expect(descPrices).toEqual([...descPrices].sort((a, b) => b - a));
    });

    it('applies explicit name sort over the search predicate', async () => {
      const result = await catalog.listProducts({ q: 'سورت', sort: 'name' });
      // Latin suffixes keep the collation expectation unambiguous.
      const names = result.items
        .filter((item) => item.name.includes('سورت'))
        .map((item) => item.name);
      expect(names).toEqual([
        expect.stringContaining('Alpha'),
        expect.stringContaining('Mid'),
        expect.stringContaining('Zeta'),
      ]);
    });

    it('treats whitespace-only q as absent (no search branch)', async () => {
      const blank = await catalog.listProducts({ q: '   ' });
      const all = await catalog.listProducts({});
      expect(blank.total).toBe(all.total);
    });
  });

  describe('query length policy', () => {
    it('accepts a 64-grapheme emoji query without splitting pairs', async () => {
      const emoji = '\u{1F600}';
      const q = emoji.repeat(MAX_QUERY_GRAPHEMES);
      expect(truncateQuery(q)).toBe(q);
      // No fixture matches; the point is that the query executes and returns
      // a well-formed empty result instead of throwing on broken Unicode.
      const result = await catalog.listProducts({ q });
      expect(result.items).toHaveLength(0);
    });
  });
});
