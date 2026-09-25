import { PrismaClient, Prisma } from '@prisma/client';

/**
 * SS-217 minPrice EXPLAIN benchmark.
 *
 * Runs `EXPLAIN (ANALYZE, BUFFERS)` for the seven representative catalog
 * listing cases (raw SQL mirroring `PublicCatalogService.listProducts`'s
 * Prisma shape) so the plan is reproducible against any database the script
 * is pointed at. Verifies whether the partial sort indexes
 * (Product_public_minPrice_{asc,desc}_idx) are actually chosen, and how the
 * filters compose with the ordering. PostgreSQL may honestly prefer a seq
 * scan at small volumes — the script reports what it observes instead of
 * assuming the index is beneficial.
 *
 * Unlike search-explain.ts this probe does NOT inflate synthetic rows: the
 * production-shaped dataset (~1.1k products, production dump) is the target
 * volume for SS-217, and the dev seed (~23 rows) would mislead. Run it
 * against the restored production dataset for the perf report.
 *
 * Usage: pnpm --filter @sabz/api exec tsx scripts/minprice-explain.ts
 * Requires DATABASE_URL. Read-only: every statement is SELECT/EXPLAIN.
 */

const prisma = new PrismaClient();

interface Probe {
  name: string;
  /** Optional category slug to resolve a subtree scope for. */
  category?: string;
  brand?: string;
  condition?: string;
  inStockOnly?: boolean;
  priceFrom?: string;
  priceTo?: string;
  q?: string;
  sort: 'price_asc' | 'price_desc' | 'newest';
  page?: number;
}

async function probes(): Promise<Probe[]> {
  // Slugs are discovered from the target database (never hardcoded to the
  // demo seed): the category/brand with the most published products.
  const [category] = await prisma.$queryRaw<{ slug: string }[]>`
    SELECT c."slug" FROM "Category" c
    JOIN "Product" p ON p."categoryId" = c."id" AND p."deletedAt" IS NULL AND p."status" = 'PUBLISHED'
    WHERE c."deletedAt" IS NULL
    GROUP BY c."slug" ORDER BY count(*) DESC LIMIT 1`;
  const [brand] = await prisma.$queryRaw<{ slug: string }[]>`
    SELECT b."slug" FROM "Brand" b
    JOIN "Product" p ON p."brandId" = b."id" AND p."deletedAt" IS NULL AND p."status" = 'PUBLISHED'
    WHERE b."deletedAt" IS NULL
    GROUP BY b."slug" ORDER BY count(*) DESC LIMIT 1`;
  return [
    { name: 'price ascending (unfiltered)', sort: 'price_asc' },
    { name: 'price descending (unfiltered)', sort: 'price_desc' },
    { name: `category + price sort (${category?.slug ?? 'n/a'})`, sort: 'price_asc', category: category?.slug },
    { name: `brand + price sort (${brand?.slug ?? 'n/a'})`, sort: 'price_asc', brand: brand?.slug },
    { name: 'in-stock + price sort', sort: 'price_asc', inStockOnly: true },
    { name: 'price range + price sort', sort: 'price_asc', priceFrom: '1000000', priceTo: '5000000' },
    { name: 'search + price sort (top term)', sort: 'price_asc', q: await topSearchTerm() },
    { name: 'newest (control, unfiltered)', sort: 'newest' },
  ];
}

/** Most frequent normalized word across product names (a real search term). */
async function topSearchTerm(): Promise<string | undefined> {
  const rows = await prisma.$queryRaw<{ term: string }[]>`
    SELECT lower(regexp_replace("name", '[^\p{L}\p{N}]+', ' ', 'g')) AS term
    FROM "Product" WHERE "deletedAt" IS NULL AND "status" = 'PUBLISHED' LIMIT 200`;
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const word of row.term.split(' ')) {
      if (word.length >= 3) counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/**
 * Mirrors the visibility WHERE of PublicCatalogService (pre-SS-217 shape
 * unchanged), with the price-range predicate kept VARIANT-LEVEL. When a
 * filter narrows to explicit ids (in-stock prefilter), the same `id IN`
 * form the service uses is applied.
 */
async function explain(probe: Probe): Promise<string> {
  const limit = 24;
  const offset = ((probe.page ?? 1) - 1) * limit;

  let scopeIds: string[] | null = null;
  if (probe.category !== undefined) {
    const rows = await prisma.category.findMany({
      where: { deletedAt: null },
      select: { id: true, slug: true, parentId: true },
    });
    const root = rows.find((row) => row.slug === probe.category);
    if (!root) {
      return `-- category ${probe.category} not present on this database; skipped`;
    }
    scopeIds = [root.id];
  }

  let stockIds: string[] | null = null;
  if (probe.inStockOnly) {
    const items = await prisma.inventoryItem.findMany({
      where: { quantityOnHand: { gt: 0 } },
      select: { variant: { select: { productId: true } } },
      distinct: ['variantId'],
      take: 5000,
    });
    stockIds = [...new Set(items.map((item) => item.variant.productId))];
    if (stockIds.length === 0) {
      return '-- no in-stock products on this database; skipped';
    }
  }

  const direction = probe.sort === 'price_desc' ? 'DESC' : 'ASC';
  const orderBy =
    probe.sort === 'newest'
      ? Prisma.sql`ORDER BY p."createdAt" DESC, p."id" DESC`
      : Prisma.sql`ORDER BY p."minPrice" ${Prisma.raw(direction)} NULLS LAST, p."createdAt" DESC, p."id" DESC`;

  const plan = await prisma.$queryRaw<{ 'QUERY PLAN': string }[]>`
    EXPLAIN (ANALYZE, BUFFERS)
    SELECT p."id"
    FROM "Product" p
    WHERE p."deletedAt" IS NULL
      AND p."status" = 'PUBLISHED'
      ${scopeIds !== null ? Prisma.sql`AND p."categoryId" = ANY(${scopeIds}::text[])` : Prisma.empty}
      ${stockIds !== null ? Prisma.sql`AND p."id" = ANY(${stockIds}::text[])` : Prisma.empty}
      ${probe.brand !== undefined ? Prisma.sql`AND EXISTS (SELECT 1 FROM "Brand" b WHERE b."id" = p."brandId" AND b."deletedAt" IS NULL AND b."slug" = ${probe.brand})` : Prisma.empty}
      ${probe.condition !== undefined ? Prisma.sql`AND p."condition"::text = ${probe.condition}` : Prisma.empty}
      ${probe.priceFrom !== undefined || probe.priceTo !== undefined ? Prisma.sql`AND EXISTS (
        SELECT 1 FROM "ProductVariant" pv
        WHERE pv."productId" = p."id" AND pv."deletedAt" IS NULL AND pv."priceStatus" = 'PRICED'
        ${probe.priceFrom !== undefined ? Prisma.sql`AND pv."price" >= ${probe.priceFrom}::numeric` : Prisma.empty}
        ${probe.priceTo !== undefined ? Prisma.sql`AND pv."price" <= ${probe.priceTo}::numeric` : Prisma.empty}
      )` : Prisma.empty}
      ${probe.q !== undefined ? Prisma.sql`AND (p."name" ILIKE ${'%' + probe.q + '%'} OR EXISTS (
        SELECT 1 FROM "ProductTag" pt JOIN "Tag" g ON g."id" = pt."tagId"
        WHERE pt."productId" = p."id" AND g."name" ILIKE ${'%' + probe.q + '%'}
      ))` : Prisma.empty}
    ${orderBy}
    LIMIT ${limit} OFFSET ${offset}`;

  return plan.map((row) => row['QUERY PLAN']).join('\n');
}

function summarize(plan: string): { ms: string; scan: string } {
  const ms = plan.match(/Execution Time: ([\d.]+) ms/)?.[1] ?? '?';
  const scans = new Set<string>();
  for (const line of plan.split('\n')) {
    if (line.includes('Bitmap Index Scan') || line.includes('Bitmap Heap Scan')) {
      scans.add('bitmap index');
    } else if (line.includes('Index Scan using') || line.includes('Index Only Scan using')) {
      scans.add('index');
    } else if (/Seq Scan on "\w+"/.test(line)) {
      scans.add('seq');
    }
  }
  return { ms, scan: [...scans].sort().join('+') || '?' };
}

async function main(): Promise<void> {
  const counts = await prisma.$queryRaw<{ products: bigint; variants: bigint }[]>`
    SELECT
      (SELECT count(*) FROM "Product" WHERE "deletedAt" IS NULL AND "status" = 'PUBLISHED') AS products,
      (SELECT count(*) FROM "ProductVariant" WHERE "deletedAt" IS NULL) AS variants`;
  console.log(
    `dataset: ${counts[0]!.products} published products, ${counts[0]!.variants} live variants`,
  );

  for (const probe of await probes()) {
    await explain(probe); // warm-up pass, discarded
    const plan = await explain(probe);
    const { ms, scan } = summarize(plan);
    console.log(`\n=== ${probe.name} — ${ms} ms [${scan}] ===`);
    console.log(plan);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
