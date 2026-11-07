import { ProductCondition, ProductStatus } from '@prisma/client';
import { PrismaService } from '../src/common/database/prisma.service';
import {
  runBrandMerge,
  type BrandMergeReport,
} from '../src/modules/products/brand-merge';
import { PublicCatalogService } from '../src/modules/products/public-catalog.service';
import { PricingService } from '../src/modules/pricing/pricing.service';

jest.setTimeout(90_000);

const SLUGS = [
  'green-lion',
  'green-lion-2',
  'porodo',
  'porodo-2',
  'powerology',
  'powerology-2',
  'ay-dyta',
  'adata',
  'avrykv',
  'orico',
  'vryty',
  'verity',
];

describe('SS-258 brand merge (integration)', () => {
  let prisma: PrismaService;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let categoryId = '';
  const productIds: string[] = [];
  const promotionIds: string[] = [];
  const brandIds: string[] = [];

  async function cleanup(): Promise<void> {
    const brands = await prisma.brand.findMany({
      where: { slug: { in: SLUGS } },
      select: { id: true },
    });
    const ids = brands.map((brand) => brand.id);
    if (ids.length > 0) {
      await prisma.product.deleteMany({ where: { brandId: { in: ids } } });
      await prisma.promotion.deleteMany({ where: { brandId: { in: ids } } });
      await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
      await prisma.brand.deleteMany({
        where: { id: { in: ids }, mergedIntoBrandId: { not: null } },
      });
      await prisma.brand.deleteMany({ where: { id: { in: ids } } });
    }
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    await cleanup();
    // Older admin-brand e2e runs can leave `A`/`dup-brand-*` rows in the
    // disposable test database; they would create an unrelated alias collision.
    await prisma.brand.deleteMany({
      where: { name: 'A', slug: { startsWith: 'dup-brand-' } },
    });

    const category = await prisma.category.create({
      data: {
        name: `SS258 Category ${suffix}`,
        slug: `ss258-category-${suffix}`,
        isVisible: true,
      },
    });
    categoryId = category.id;

    const canonicalGreen = await prisma.brand.create({
      data: { name: 'گرین لاین', nameEn: 'Green Lion', slug: 'green-lion' },
    });
    const canonicalPorodo = await prisma.brand.create({
      data: { name: 'پرودو', nameEn: 'Porodo', slug: 'porodo' },
    });
    const canonicalPowerology = await prisma.brand.create({
      data: { name: 'پاورولوژی', nameEn: 'Powerology', slug: 'powerology' },
    });
    const canonicalAdata = await prisma.brand.create({
      data: { name: 'ای دیتا', slug: 'ay-dyta' },
    });
    const canonicalOrico = await prisma.brand.create({
      data: { name: 'اوریکو', slug: 'avrykv' },
    });
    const canonicalVerity = await prisma.brand.create({
      data: { name: 'وریتی', slug: 'vryty' },
    });
    const duplicateGreen = await prisma.brand.create({
      data: { name: 'Green Lion', slug: 'green-lion-2' },
    });
    const duplicatePorodo = await prisma.brand.create({
      data: { name: 'Porodo', slug: 'porodo-2' },
    });
    const duplicatePowerology = await prisma.brand.create({
      data: { name: 'Powerology', slug: 'powerology-2' },
    });
    const duplicateAdata = await prisma.brand.create({
      data: { name: 'adata', slug: 'adata', deletedAt: new Date() },
    });
    const duplicateOrico = await prisma.brand.create({
      data: { name: 'orico', slug: 'orico', deletedAt: new Date() },
    });
    const duplicateVerity = await prisma.brand.create({
      data: { name: 'Verity', slug: 'verity', deletedAt: new Date() },
    });
    brandIds.push(
      canonicalGreen.id,
      canonicalPorodo.id,
      canonicalPowerology.id,
      canonicalAdata.id,
      canonicalOrico.id,
      canonicalVerity.id,
      duplicateGreen.id,
      duplicatePorodo.id,
      duplicatePowerology.id,
      duplicateAdata.id,
      duplicateOrico.id,
      duplicateVerity.id,
    );

    const productRows = [
      { brandId: duplicateGreen.id, name: 'SS258 Green 1' },
      { brandId: duplicateGreen.id, name: 'SS258 Green 2' },
      { brandId: duplicatePorodo.id, name: 'SS258 Porodo 1' },
      { brandId: duplicatePowerology.id, name: 'SS258 Powerology 1' },
    ];
    for (const [index, row] of productRows.entries()) {
      const product = await prisma.product.create({
        data: {
          name: row.name,
          slug: `ss258-${suffix}-${index}`,
          brandId: row.brandId,
          categoryId: category.id,
          condition: ProductCondition.NEW,
          status: ProductStatus.PUBLISHED,
        },
      });
      productIds.push(product.id);
    }

    const promotion = await prisma.promotion.create({
      data: {
        code: `SS258-${suffix}`,
        titleFa: 'SS258 promotion',
        type: 'PERCENT',
        value: '10',
        startsAt: new Date('2026-01-01T00:00:00.000Z'),
        endsAt: new Date('2027-01-01T00:00:00.000Z'),
        isActive: true,
        brandId: duplicateGreen.id,
        minQuantity: 1,
      },
    });
    promotionIds.push(promotion.id);
  });

  afterAll(async () => {
    await prisma.promotion.deleteMany({ where: { id: { in: promotionIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: brandIds } } });
    await prisma.brand.deleteMany({
      where: { id: { in: brandIds }, mergedIntoBrandId: { not: null } },
    });
    await prisma.brand.deleteMany({ where: { id: { in: brandIds } } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.$disconnect();
  });

  it('dry-run reports the curated mappings without writing', async () => {
    const report = await runBrandMerge(prisma, { apply: false });
    expect(report.status).toBe('ready');
    expect(report.mode).toBe('dry-run');
    expect(report.mappings.map((mapping) => mapping.duplicate.slug)).toEqual(
      expect.arrayContaining([
        'green-lion-2',
        'porodo-2',
        'powerology-2',
        'adata',
        'orico',
        'verity',
      ]),
    );
    const green = report.mappings.find(
      (mapping) => mapping.identity === 'Green Lion',
    )!;
    expect(green.operations.productsReassigned).toBe(2);
    expect(green.operations.promotionsReassigned).toBe(1);

    const duplicate = await prisma.brand.findUniqueOrThrow({
      where: { slug: 'green-lion-2' },
      select: { deletedAt: true, mergedIntoBrandId: true },
    });
    expect(duplicate.deletedAt).toBeNull();
    expect(duplicate.mergedIntoBrandId).toBeNull();
  });

  it('applies the merge, preserves products/promotions, and links duplicates', async () => {
    const report: BrandMergeReport = await runBrandMerge(prisma, {
      apply: true,
    });
    expect(report.status).toBe('applied');
    expect(report.totals.changes).toBeGreaterThan(0);

    const [green, porodo, powerology] = await Promise.all([
      prisma.brand.findUniqueOrThrow({
        where: { slug: 'green-lion' },
        select: { id: true },
      }),
      prisma.brand.findUniqueOrThrow({
        where: { slug: 'porodo' },
        select: { id: true },
      }),
      prisma.brand.findUniqueOrThrow({
        where: { slug: 'powerology' },
        select: { id: true },
      }),
    ]);
    expect(
      await prisma.product.count({ where: { brandId: green.id } }),
    ).toBe(2);
    expect(
      await prisma.product.count({ where: { brandId: porodo.id } }),
    ).toBe(1);
    expect(
      await prisma.product.count({ where: { brandId: powerology.id } }),
    ).toBe(1);

    const promotion = await prisma.promotion.findUniqueOrThrow({
      where: { id: promotionIds[0]! },
      select: { brandId: true },
    });
    expect(promotion.brandId).toBe(green.id);

    for (const slug of [
      'green-lion-2',
      'porodo-2',
      'powerology-2',
      'adata',
      'orico',
      'verity',
    ]) {
      const duplicate = await prisma.brand.findUniqueOrThrow({
        where: { slug },
        select: { deletedAt: true, mergedIntoBrandId: true },
      });
      expect(duplicate.deletedAt).not.toBeNull();
      expect(duplicate.mergedIntoBrandId).not.toBeNull();
    }

    const greenAlias = await prisma.brandAlias.findUniqueOrThrow({
      where: { normalizedKey: 'green lion' },
      select: { brandId: true, kind: true },
    });
    expect(greenAlias.brandId).toBe(green.id);
    const adataAlias = await prisma.brandAlias.findUniqueOrThrow({
      where: { normalizedKey: 'adata' },
      select: { brandId: true },
    });
    expect(adataAlias.brandId).not.toBeNull();
  });

  it('resolves a merged duplicate slug to canonical products', async () => {
    const catalog = new PublicCatalogService(
      prisma,
      new PricingService(prisma),
    );
    const result = await catalog.listProducts({
      brand: 'green-lion-2',
      limit: 10,
    });
    expect(result.total).toBe(2);
    expect(result.items.map((item) => item.slug)).toEqual(
      expect.arrayContaining([`ss258-${suffix}-0`, `ss258-${suffix}-1`]),
    );
  });

  it('is idempotent: a second apply performs zero data changes', async () => {
    const report = await runBrandMerge(prisma, { apply: true });
    expect(report.status).toBe('applied');
    expect(report.totals.changes).toBe(0);
  });
});
