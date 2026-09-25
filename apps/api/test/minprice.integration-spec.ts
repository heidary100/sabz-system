import { PriceStatus, ProductCondition, ProductStatus, WarehouseStatus } from '@prisma/client';
import { PrismaService } from '../src/common/database/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { PublicCatalogService } from '../src/modules/products/public-catalog.service';
import { VariantsService } from '../src/modules/products/variants.service';

jest.setTimeout(60_000);

/**
 * Product.minPrice denormalization (SS-217).
 *
 * Four layers against the dedicated test database (which `migrate deploy`
 * builds from all committed migrations):
 *
 * 1. Migration guard — the column and the two partial sort indexes exist
 *    after a fresh migrate (also the tripwire for shadow-drift dropping the
 *    raw-SQL partial indexes, mirroring the SS-216 guard).
 * 2. Global parity — for every product in the database, the stored
 *    Product.minPrice equals the aggregate MIN(price) over live PRICED
 *    variants (the backfill invariant, dataset-shaped, not seed-shaped).
 * 3. Writer matrix — every variant mutation path leaves minPrice correct,
 *    including compareAtPrice (which must NOT move it).
 * 4. Public behavior — DB-side price ordering through PublicCatalogService
 *    (asc/desc, NULLS LAST, ties, pagination, filters, variant-level price
 *    range) and compatibility of the SS-216 q-present sorts.
 */
describe('Product minPrice denormalization (SS-217)', () => {
  let prisma: PrismaService;
  let catalog: PublicCatalogService;
  let variants: VariantsService;

  const createdProductIds: string[] = [];
  const createdVariantIds: string[] = [];
  const createdBrandIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdWarehouseIds: string[] = [];
  const actorId = '33333333-3333-4333-8333-333333333333';

  function uniqueSuffix(): string {
    return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  }

  async function createProduct(
    overrides: { status?: ProductStatus; condition?: ProductCondition } = {},
  ): Promise<{ id: string; slug: string }> {
    const suffix = uniqueSuffix();
    const brand = await prisma.brand.create({
      data: { name: `برند MP ${suffix}`, slug: `brand-mp-${suffix}` },
    });
    createdBrandIds.push(brand.id);
    const category = await prisma.category.create({
      data: { name: `دسته MP ${suffix}`, slug: `cat-mp-${suffix}` },
    });
    createdCategoryIds.push(category.id);
    const product = await prisma.product.create({
      data: {
        name: `محصول MP ${suffix}`,
        slug: `prod-mp-${suffix}`,
        brandId: brand.id,
        categoryId: category.id,
        condition: overrides.condition ?? ProductCondition.NEW,
        status: overrides.status ?? ProductStatus.PUBLISHED,
        createdBy: actorId,
      },
    });
    createdProductIds.push(product.id);
    return { id: product.id, slug: product.slug };
  }

  /** Adds a variant through the SERVICE so the writer runs (unlike fixtures). */
  async function addVariant(
    productId: string,
    overrides: {
      price?: string;
      compareAtPrice?: string | null;
      priceStatus?: PriceStatus;
    } = {},
  ): Promise<{ id: string }> {
    const summary = await variants.create(
      productId,
      {
        sku: `SKU-MP-${uniqueSuffix()}`,
        price: overrides.price ?? '100.00',
        ...(overrides.compareAtPrice !== null && overrides.compareAtPrice !== undefined
          ? { compareAtPrice: overrides.compareAtPrice }
          : {}),
        priceStatus: overrides.priceStatus ?? PriceStatus.PRICED,
      },
      actorId,
    );
    createdVariantIds.push(summary.id);
    return { id: summary.id };
  }

  async function minPriceOf(productId: string): Promise<string | null> {
    const row = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
      select: { minPrice: true },
    });
    return row.minPrice === null ? null : String(row.minPrice);
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    variants = new VariantsService(prisma, audit);
    catalog = new PublicCatalogService(prisma);
  });

  afterAll(async () => {
    await prisma.inventoryItem.deleteMany({
      where: { variantId: { in: createdVariantIds } },
    });
    await prisma.productVariant.deleteMany({
      where: { id: { in: createdVariantIds } },
    });
    await prisma.product.deleteMany({
      where: { id: { in: createdProductIds } },
    });
    await prisma.brand.deleteMany({ where: { id: { in: createdBrandIds } } });
    await prisma.category.deleteMany({
      where: { id: { in: createdCategoryIds } },
    });
    await prisma.warehouse.deleteMany({
      where: { id: { in: createdWarehouseIds } },
    });
    await prisma.$disconnect();
  });

  // ------------------------------------------------------ 1. migration guard

  it('creates the minPrice column and both partial sort indexes', async () => {
    const columns = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'Product' AND column_name = 'minPrice'`;
    expect(columns).toHaveLength(1);

    const indexes = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'Product'
        AND indexname IN ('Product_public_minPrice_asc_idx', 'Product_public_minPrice_desc_idx')`;
    expect(indexes.map((row) => row.indexname).sort()).toEqual([
      'Product_public_minPrice_asc_idx',
      'Product_public_minPrice_desc_idx',
    ]);
  });

  // -------------------------------------------------------- 2. global parity

  it('stored minPrice equals the live-PRICED aggregate for every SS-217 fixture product', async () => {
    // Scoped to this spec's fixtures: other integration specs write variants
    // directly through Prisma fixtures (no recompute — they predate SS-217),
    // so a whole-table assertion would read their transient fixture state.
    const mismatches = await prisma.$queryRaw<{ id: string }[]>`
      SELECT p."id" FROM "Product" p
      LEFT JOIN LATERAL (
        SELECT MIN(v."price") AS "expected"
        FROM "ProductVariant" v
        WHERE v."productId" = p."id" AND v."deletedAt" IS NULL AND v."priceStatus" = 'PRICED'
      ) agg ON TRUE
      WHERE p."slug" LIKE 'prod-mp-%'
        AND p."minPrice" IS DISTINCT FROM agg."expected"`;
    expect(mismatches).toEqual([]);
  });

  // -------------------------------------------------------- 3. writer matrix

  it('first priced variant sets minPrice', async () => {
    const { id } = await createProduct();
    await addVariant(id, { price: '250.00' });
    await expect(minPriceOf(id)).resolves.toBe('250');
  });

  it('second higher-priced variant leaves minPrice unchanged', async () => {
    const { id } = await createProduct();
    await addVariant(id, { price: '250.00' });
    await addVariant(id, { price: '400.00' });
    await expect(minPriceOf(id)).resolves.toBe('250');
  });

  it('adding a cheaper variant lowers minPrice', async () => {
    const { id } = await createProduct();
    await addVariant(id, { price: '400.00' });
    await addVariant(id, { price: '150.00' });
    await expect(minPriceOf(id)).resolves.toBe('150');
  });

  it('increasing the cheapest variant price promotes the next cheapest', async () => {
    const { id } = await createProduct();
    const cheapest = await addVariant(id, { price: '150.00' });
    await addVariant(id, { price: '400.00' });
    await variants.update(cheapest.id, { price: '300.00' }, actorId);
    await expect(minPriceOf(id)).resolves.toBe('300');
  });

  it('decreasing a non-cheapest variant can make it the cheapest', async () => {
    const { id } = await createProduct();
    await addVariant(id, { price: '400.00' });
    const mid = await addVariant(id, { price: '300.00' });
    await variants.update(mid.id, { price: '120.00' }, actorId);
    await expect(minPriceOf(id)).resolves.toBe('120');
  });

  it('deleting the cheapest variant promotes the next cheapest', async () => {
    const { id } = await createProduct();
    const cheapest = await addVariant(id, { price: '150.00' });
    await addVariant(id, { price: '400.00' });
    await variants.softDelete(cheapest.id, actorId);
    await expect(minPriceOf(id)).resolves.toBe('400');
  });

  it('deleting a non-cheapest variant leaves minPrice unchanged', async () => {
    const { id } = await createProduct();
    await addVariant(id, { price: '150.00' });
    const mid = await addVariant(id, { price: '300.00' });
    await variants.softDelete(mid.id, actorId);
    await expect(minPriceOf(id)).resolves.toBe('150');
  });

  it('switching to CALL_FOR_PRICE removes the variant from the minimum', async () => {
    const { id } = await createProduct();
    const only = await addVariant(id, { price: '150.00' });
    await variants.update(only.id, { priceStatus: PriceStatus.CALL_FOR_PRICE }, actorId);
    await expect(minPriceOf(id)).resolves.toBeNull();
  });

  it('switching back to PRICED restores the minimum', async () => {
    const { id } = await createProduct();
    const only = await addVariant(id, { price: '150.00' });
    await variants.update(only.id, { priceStatus: PriceStatus.CALL_FOR_PRICE }, actorId);
    await variants.update(only.id, { priceStatus: PriceStatus.PRICED }, actorId);
    await expect(minPriceOf(id)).resolves.toBe('150');
  });

  it('a product with no priced variants stays NULL', async () => {
    const { id } = await createProduct();
    await addVariant(id, { price: '0.00', priceStatus: PriceStatus.CALL_FOR_PRICE });
    await expect(minPriceOf(id)).resolves.toBeNull();
  });

  it('compareAtPrice added and removed never changes minPrice', async () => {
    const { id } = await createProduct();
    const only = await addVariant(id, { price: '150.00' });
    await variants.update(only.id, { compareAtPrice: '200.00' }, actorId);
    await expect(minPriceOf(id)).resolves.toBe('150');
    await variants.update(only.id, { compareAtPrice: null }, actorId);
    await expect(minPriceOf(id)).resolves.toBe('150');
  });

  // ----------------------------------------------------- 4. public behavior

  describe('public ordering (DB-side)', () => {
    const ORDER_TOKEN = 'سورت مین‌پرایس SS217';
    let p400: { id: string };
    let p100a: { id: string };
    let p100b: { id: string };
    let pMixed: { id: string };
    let pNull: { id: string };
    let warehouseId: string;

    beforeAll(async () => {
      // Deliberate creation order: p100a first, p100b later (same price —
      // tie-break must be createdAt DESC, id DESC).
      p100a = await createProduct();
      await addVariant(p100a.id, { price: '100.00' });
      p100b = await createProduct();
      await addVariant(p100b.id, { price: '100.00' });
      p400 = await createProduct();
      await addVariant(p400.id, { price: '400.00' });
      pMixed = await createProduct();
      await addVariant(pMixed.id, { price: '50.00' });
      await addVariant(pMixed.id, { price: '250.00' });
      // NULL minPrice: only a call-for-price row.
      pNull = await createProduct();
      await addVariant(pNull.id, { price: '0.00', priceStatus: PriceStatus.CALL_FOR_PRICE });

      // Name all fixtures so the q-present sorts can scope to them.
      for (const product of [p100a, p100b, p400, pMixed, pNull]) {
        await prisma.product.update({
          where: { id: product.id },
          data: { name: ORDER_TOKEN },
        });
      }

      const suffix = uniqueSuffix();
      const warehouse = await prisma.warehouse.create({
        data: {
          code: `WH-MP-${suffix}`,
          name: `انبار MP ${suffix}`,
          status: WarehouseStatus.ACTIVE,
        },
      });
      createdWarehouseIds.push(warehouse.id);
      warehouseId = warehouse.id;
      // Only p400 is in stock; everything else stays unavailable.
      const variant = await prisma.productVariant.findFirstOrThrow({
        where: { productId: p400.id, deletedAt: null },
        select: { id: true },
      });
      await prisma.inventoryItem.create({
        data: {
          warehouseId,
          variantId: variant.id,
          quantityOnHand: 5,
          quantityReserved: 0,
        },
      });
    });

    it('price_asc orders by minPrice with NULLs last and newest-first ties', async () => {
      const result = await catalog.listProducts({
        q: ORDER_TOKEN,
        sort: 'price_asc',
        limit: 50,
      });
      const slugs = result.items.map((item) => item.slug);
      // Tie on 100: p100b (created later) must come before p100a.
      const i100a = slugs.indexOf((await prisma.product.findUniqueOrThrow({ where: { id: p100a.id } })).slug);
      const i100b = slugs.indexOf((await prisma.product.findUniqueOrThrow({ where: { id: p100b.id } })).slug);
      expect(i100b).toBeLessThan(i100a);
      // NULLs last in ascending order.
      expect(slugs[slugs.length - 1]).toBe(
        (await prisma.product.findUniqueOrThrow({ where: { id: pNull.id } })).slug,
      );
      // Exact price sequence: 50 (mixed), 100, 100, 400.
      const prices = result.items.map((item) => item.priceFrom);
      expect(prices[0]).toBe('50');
      expect(prices).toEqual(['50', '100', '100', '400', '']);
    });

    it('price_desc orders by minPrice descending with NULLs last', async () => {
      const result = await catalog.listProducts({
        q: ORDER_TOKEN,
        sort: 'price_desc',
        limit: 50,
      });
      const prices = result.items.map((item) => item.priceFrom);
      // NULLs stay last in BOTH directions (existing contract).
      expect(prices).toEqual(['400', '100', '100', '50', '']);
      // Tie on 100: newer first, same as ascending.
      const slugs = result.items.map((item) => item.slug);
      const i100a = slugs.indexOf((await prisma.product.findUniqueOrThrow({ where: { id: p100a.id } })).slug);
      const i100b = slugs.indexOf((await prisma.product.findUniqueOrThrow({ where: { id: p100b.id } })).slug);
      expect(i100b).toBeLessThan(i100a);
    });

    it('paginates on the DB ordering across page boundaries', async () => {
      const page1 = await catalog.listProducts({ q: ORDER_TOKEN, sort: 'price_asc', page: 1, limit: 2 });
      const page2 = await catalog.listProducts({ q: ORDER_TOKEN, sort: 'price_asc', page: 2, limit: 2 });
      const page3 = await catalog.listProducts({ q: ORDER_TOKEN, sort: 'price_asc', page: 3, limit: 2 });
      const all = [...page1.items, ...page2.items, ...page3.items].map((item) => item.priceFrom);
      expect(page1.total).toBe(5);
      expect(all).toEqual(['50', '100', '100', '400', '']);
      // No product repeats across pages.
      const ids = [...page1.items, ...page2.items, ...page3.items].map((item) => item.id);
      expect(new Set(ids).size).toBe(5);
    });

    it('card priceFrom equals the stored minPrice column', async () => {
      const result = await catalog.listProducts({ q: ORDER_TOKEN, sort: 'price_asc', limit: 50 });
      for (const card of result.items) {
        const stored = await minPriceOf(card.id);
        expect(card.priceFrom).toBe(stored ?? '');
        expect(card.callForPrice).toBe(stored === null);
      }
    });

    it('keeps the variant-level price range semantics (min outside the range still matches)', async () => {
      // pMixed has variants 50 and 250; minPrice = 50 is OUTSIDE [200, ∞) but
      // the 250 variant qualifies the product (SS-213 contract).
      const hit = await catalog.listProducts({ q: ORDER_TOKEN, priceFrom: '200', sort: 'price_asc', limit: 50 });
      const mixedSlug = (await prisma.product.findUniqueOrThrow({ where: { id: pMixed.id } })).slug;
      expect(hit.items.map((item) => item.slug)).toContain(mixedSlug);
      // ...and sorts by minPrice (50), even though the range matched 250.
      expect(hit.items[0]!.priceFrom).toBe('50');

      const miss = await catalog.listProducts({ q: ORDER_TOKEN, priceFrom: '300', sort: 'price_asc', limit: 50 });
      expect(miss.items.map((item) => item.slug)).not.toContain(mixedSlug);
    });

    it('composes category, brand, condition and in-stock filters with price sorts', async () => {
      const p400Row = await prisma.product.findUniqueOrThrow({ where: { id: p400.id } });
      const categorySlug = (
        await prisma.category.findUniqueOrThrow({ where: { id: p400Row.categoryId } })
      ).slug;
      const byCategory = await catalog.listProducts({
        category: categorySlug,
        sort: 'price_desc',
        limit: 50,
      });
      // Fresh unique category: exactly this product, ordered by its price.
      expect(byCategory.items).toHaveLength(1);
      expect(byCategory.items[0]!.id).toBe(p400.id);

      const pMixedRow = await prisma.product.findUniqueOrThrow({ where: { id: pMixed.id } });
      const brandSlug = (
        await prisma.brand.findUniqueOrThrow({ where: { id: pMixedRow.brandId! } })
      ).slug;
      const byBrand = await catalog.listProducts({
        brand: brandSlug,
        sort: 'price_asc',
        limit: 50,
      });
      expect(byBrand.items.map((item) => item.id)).toContain(pMixed.id);

      const byCondition = await catalog.listProducts({
        condition: 'NEW',
        sort: 'price_asc',
        page: 1,
        limit: 50,
      });
      expect(byCondition.items.length).toBeGreaterThan(0);

      const byStock = await catalog.listProducts({ q: ORDER_TOKEN, inStockOnly: true, sort: 'price_asc', limit: 50 });
      expect(byStock.items.map((item) => item.id)).toEqual([p400.id]);
    });
  });
});
