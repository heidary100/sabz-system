import { join } from 'node:path';
import { ProductStatus } from '@prisma/client';
import { PrismaService } from '../src/common/database/prisma.service';
import { WooReferenceLoader } from '../src/modules/import/woo-reference';
import {
  buildFileIndex,
  createClaimants,
  resolveRow,
} from '../src/modules/import/woo-resolve';
import { attachImageIndex, buildReport } from '../src/modules/import/woo-report';
import { parseWooCsvFile, splitCell } from '../src/modules/import/woo-parse';

jest.setTimeout(30_000);

/**
 * WooCommerce dry-run pipeline integration (SS-206).
 *
 * Runs the real parser → reference loader → resolver → reporter chain over
 * the committed 8-row fixture and asserts the matrix. Proves the dry-run
 * writes nothing by snapshotting table counts before and after.
 */
describe('WooCommerce dry-run pipeline integration (SS-206)', () => {
  let prisma: PrismaService;

  const fixture = join(
    __dirname,
    '..',
    'src',
    'modules',
    'import',
    'fixtures',
    'woo-sample.csv',
  );

  async function counts(): Promise<Record<string, number>> {
    const [product, variant, category, brand, tag, attribute, media, run, record] =
      await Promise.all([
        prisma.product.count(),
        prisma.productVariant.count(),
        prisma.category.count(),
        prisma.brand.count(),
        prisma.tag.count(),
        prisma.attribute.count(),
        prisma.productMedia.count(),
        prisma.importRun.count(),
        prisma.importRecord.count(),
      ]);
    return { product, variant, category, brand, tag, attribute, media, run, record };
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('resolves the 8-row fixture to the expected matrix without writing', async () => {
    const before = await counts();
    const parsed = parseWooCsvFile(fixture);
    expect(parsed.header).toHaveLength(243);
    expect(parsed.rows).toHaveLength(8);
    // Multiline HTML cell survives the parse intact.
    expect(parsed.rows[0]!.cells['توضیحات']).toContain('\n');

    const refs = await new WooReferenceLoader(prisma).load();
    const index = buildFileIndex(parsed.rows);
    const claimants = createClaimants(refs);
    const verdicts = [];
    const imageUrls: string[] = [];
    for (const row of parsed.rows) {
      verdicts.push(await resolveRow(row, refs, index, claimants));
      for (const url of splitCell(row.cells['تصاویر'] ?? '')) {
        imageUrls.push(url);
      }
    }
    const report = buildReport(fixture, parsed.header, verdicts, {
      categories: refs.categories.length,
      brands: refs.brands.length,
      knownSourceKeys: refs.sourceKeys.size,
    });
    attachImageIndex(report, imageUrls);

    expect(report.rows).toBe(8);
    expect(report.columns.fallback).toEqual([]);
    // R1 priced+sale CREATE, R2 priceless CREATE, R3 shell CREATE,
    // R4 linked variation CREATE, R5 orphan SKIP, R6 draft CREATE,
    // R7 private CREATE-as-DRAFT, R8 sale-edge CREATE.
    expect(report.byAction).toMatchObject({ CREATE: 7, SKIP: 1 });
    expect(report.byType).toMatchObject({ simple: 5, variable: 1, variation: 2 });
    expect(report.published).toBe(5);
    expect(report.drafts).toBe(3);
    expect(report.priceless).toBe(2);
    expect(report.onSale).toBe(1);
    expect(report.orphanVariations).toBe(1);
    expect(report.imageless).toBe(3);
    expect(report.unbranded).toBe(5);
    expect(report.images.refs).toBe(4);
    expect(report.images.distinct).toHaveLength(4);
    expect(report.customUnparsedLines).toBe(0);

    const byId = new Map(verdicts.map((verdict) => [verdict.sourceId, verdict]));
    expect(byId.get('9001')).toMatchObject({
      action: 'CREATE',
      priceStatus: 'PRICED',
      hasSale: true,
      status: 'PUBLISHED',
    });
    expect(byId.get('9001')!.content.tagCount).toBe(2);
    expect(byId.get('9002')).toMatchObject({
      priceStatus: 'CALL_FOR_PRICE',
      status: 'PUBLISHED',
    });
    expect(byId.get('9004')).toMatchObject({
      action: 'CREATE',
      variationLink: 'linked',
      parentSourceKey: 'WOOCOMMERCE:9003',
    });
    expect(byId.get('9004')!.category.leaf).toBe('هارد دیسک اکسترنال');
    expect(byId.get('9005')).toMatchObject({ action: 'SKIP' });
    expect(byId.get('9007')).toMatchObject({ status: 'DRAFT', isFeatured: true });

    // Dry-run proof: not a single row written anywhere.
    expect(await counts()).toEqual(before);
  });

  it('marks known source keys UPDATE on repeat runs', async () => {
    const brand = await prisma.brand.create({
      data: { name: `برند dryrun`, slug: `brand-dryrun-${Date.now()}` },
    });
    const category = await prisma.category.create({
      data: { name: `دسته dryrun`, slug: `cat-dryrun-${Date.now()}` },
    });
    const product = await prisma.product.create({
      data: {
        name: 'dryrun',
        slug: `dryrun-${Date.now()}`,
        brandId: brand.id,
        categoryId: category.id,
        condition: 'NEW',
        status: ProductStatus.DRAFT,
        sourceSystem: 'WOOCOMMERCE',
        sourceId: '9001',
        sourceType: 'simple',
      },
    });
    try {
      const refs = await new WooReferenceLoader(prisma).load();
      expect(refs.sourceKeys.has('WOOCOMMERCE:9001')).toBe(true);
      const parsed = parseWooCsvFile(fixture);
      const verdicts = [];
      const claimants = createClaimants(refs);
      const index = buildFileIndex(parsed.rows);
      for (const row of parsed.rows) {
        verdicts.push(await resolveRow(row, refs, index, claimants));
      }
    const report = buildReport(fixture, parsed.header, verdicts, {
      categories: refs.categories.length,
      brands: refs.brands.length,
      knownSourceKeys: refs.sourceKeys.size,
    });
      expect(report.byAction).toMatchObject({ CREATE: 6, UPDATE: 1, SKIP: 1 });
    } finally {
      await prisma.product.delete({ where: { id: product.id } });
      await prisma.brand.delete({ where: { id: brand.id } });
      await prisma.category.delete({ where: { id: category.id } });
    }
  });
});
