import { PrismaClient } from '@prisma/client';
import {
  buildCatalogSearchPageSql,
  type CatalogSearchQuery,
} from '../src/modules/products/public-catalog-search';

/**
 * SS-216 search EXPLAIN benchmark.
 *
 * Runs `EXPLAIN (ANALYZE, BUFFERS)` for representative search probes through
 * the REAL production SQL builder (`buildCatalogSearchPageSql`), at:
 *   1. the current data volume (seed catalog),
 *   2. an inflated ~1,000-product volume (synthetic "bench-" rows, removed
 *      afterwards),
 *   3. optionally a ~10,000-row stress volume (`--scale 10000`).
 *
 * Usage: pnpm --filter @sabz/api exec tsx scripts/search-explain.ts [--scale 10000]
 * Requires DATABASE_URL (dev compose DB) — synthetic rows are always cleaned
 * up in a finally block.
 */

const prisma = new PrismaClient();

interface Probe {
  name: string;
  query: CatalogSearchQuery;
}

function probes(): Probe[] {
  const oneToken = (token: string, extra: Partial<CatalogSearchQuery> = {}): CatalogSearchQuery => ({
    tokens: [token],
    filters: {},
    sort: 'relevance',
    page: 1,
    limit: 24,
    ...extra,
  });
  return [
    { name: 'Persian exact-ish (گوشی)', query: oneToken('گوشی') },
    { name: 'ZWNJ variant (گوشی‌موبایل)', query: oneToken('گوشی\u200cموبایل') },
    { name: 'compound compact (لپتاپ)', query: oneToken('لپتاپ') },
    { name: 'English model (SSD)', query: oneToken('SSD') },
    { name: 'exact SKU (SEED-PB-HALO92-BASE)', query: oneToken('SEED-PB-HALO92-BASE') },
    { name: 'SKU typo (SEED-PB-HALO92-BASF)', query: oneToken('SEED-PB-HALO92-BASF') },
    { name: 'typo (آزمون/ازمون)', query: oneToken('ازمون') },
    { name: 'brand/category/tag term', query: oneToken('پاورولوژی') },
    { name: 'page 2', query: oneToken('گوشی', { page: 2 }) },
    {
      name: 'filtered (category+brand+price)',
      query: {
        tokens: ['گوشی'],
        filters: { priceFrom: '0', priceTo: '99999999', condition: 'NEW' },
        sort: 'relevance',
        page: 1,
        limit: 24,
      },
    },
    {
      name: 'explicit price sort (price_asc)',
      query: { tokens: ['گوشی'], filters: {}, sort: 'price_asc', page: 1, limit: 24 },
    },
    {
      name: 'explicit name sort',
      query: { tokens: ['گوشی'], filters: {}, sort: 'name', page: 1, limit: 24 },
    },
    { name: 'multi-token (گوشی موبایل)', query: { tokens: ['گوشی', 'موبایل'], filters: {}, sort: 'relevance', page: 1, limit: 24 } },
  ];
}

async function explain(query: CatalogSearchQuery): Promise<string> {
  const built = buildCatalogSearchPageSql(query);
  const rows = await prisma.$queryRaw<{ 'QUERY PLAN': string }[]>`
    EXPLAIN (ANALYZE, BUFFERS) ${built}`;
  return rows.map((row) => row['QUERY PLAN']).join('\n');
}

function summarize(plan: string): { ms: string; scan: string } {
  const ms = plan.match(/Execution Time: ([\d.]+) ms/)?.[1] ?? '?';
  const scans = new Set<string>();
  for (const line of plan.split('\n')) {
    if (line.includes('Bitmap Index Scan') || line.includes('Bitmap Heap Scan')) {
      scans.add('bitmap index');
    } else if (line.includes('Index Scan using')) {
      scans.add('index');
    } else if (/Seq Scan on "\w+"/.test(line)) {
      scans.add('seq');
    }
  }
  return { ms, scan: [...scans].sort().join('+') || '?' };
}

async function inflate(count: number): Promise<void> {
  const stamp = Date.now();
  const category = await prisma.category.create({
    data: { name: 'دسته بنچمارک', slug: `bench-cat-${stamp}` },
  });
  const products = Array.from({ length: count }, (_, i) => ({
    name: `گوشی موبایل بنچمارک مدل ${i % 100} سری ${i}`,
    slug: `bench-prod-${stamp}-${i}`,
    categoryId: category.id,
    condition: 'NEW' as const,
    status: 'PUBLISHED' as const,
    nameEn: `Benchmark Phone Model ${i}`,
    subtitle: 'زیرعنوان بنچمارک',
    focusKeyword: 'بنچمارک',
  }));
  await prisma.product.createMany({ data: products });
  const created = await prisma.product.findMany({
    where: { slug: { startsWith: `bench-prod-${stamp}` } },
    select: { id: true },
  });
  await prisma.productVariant.createMany({
    data: created.map((product, i) => ({
      productId: product.id,
      sku: `BENCH-${stamp}-${i}`,
      price: `${(i % 50) * 100000 + 1000000}`,
    })),
  });
  benchCategoryIds.push(category.id);
  console.log(`[bench] inflated catalog with ${created.length} synthetic products`);
}

const benchCategoryIds: string[] = [];

async function cleanup(): Promise<void> {
  for (const categoryId of benchCategoryIds) {
    await prisma.product.deleteMany({ where: { categoryId } });
    await prisma.category.delete({ where: { id: categoryId } }).catch(() => undefined);
  }
}

async function runStage(label: string): Promise<void> {
  console.log(`\n=== ${label} (warm cache; first pass discarded) ===`);
  for (const probe of probes()) {
    await explain(probe.query); // warm-up pass, discarded
  }
  for (const probe of probes()) {
    const plan = await explain(probe.query);
    const { ms, scan } = summarize(plan);
    const total = plan.match(/rows=(\d+)/)?.[1] ?? '?';
    console.log(
      `${probe.name.padEnd(42)} ${ms.padStart(8)} ms  scan=${scan.padEnd(14)} firstMarkedRows=${total}`,
    );
  }
}

async function main(): Promise<void> {
  const scaleArg = process.argv.findIndex((arg) => arg === '--scale');
  const scale = scaleArg >= 0 ? Number(process.argv[scaleArg + 1]) : 0;

  try {
    await runStage('current volume');
    if (scale >= 1000) {
      await inflate(scale);
      await runStage(`inflated volume (~${scale} products)`);
    }
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
