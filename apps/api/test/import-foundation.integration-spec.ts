import {
  ImportRecordStatus,
  ImportRunStatus,
  Prisma,
  ProductCondition,
} from '@prisma/client';
import { PrismaService } from '../src/common/database/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { ProductsService } from '../src/modules/products/products.service';

import { StorefrontCacheService } from '../src/common/storefront-cache/storefront-cache.service';
import { ConfigService } from '@nestjs/config';
jest.setTimeout(30_000);

/**
 * Import foundation database integration (SS-200).
 *
 * Covers the persistence primitives the future WooCommerce importer will rely
 * on: external source identity on Product/ProductVariant and the
 * ImportRun/ImportRecord audit trail. No importer logic lives here.
 */
describe('Catalog import foundation database integration (SS-200)', () => {
  let prisma: PrismaService;
  let service: ProductsService;

  const createdProductIds: string[] = [];
  const createdVariantIds: string[] = [];
  const createdBrandIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdRunIds: string[] = [];
  const actorId = '22222222-2222-4222-8222-222222222222';

  function uniqueSuffix(): string {
    return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  }

  async function createBrand(): Promise<{ id: string }> {
    const brand = await prisma.brand.create({
      data: {
        name: `برند ${uniqueSuffix()}`,
        slug: `brand-imp-${uniqueSuffix()}`,
      },
    });
    createdBrandIds.push(brand.id);
    return { id: brand.id };
  }

  async function createCategory(): Promise<{ id: string }> {
    const category = await prisma.category.create({
      data: {
        name: `دسته ${uniqueSuffix()}`,
        slug: `cat-imp-${uniqueSuffix()}`,
      },
    });
    createdCategoryIds.push(category.id);
    return { id: category.id };
  }

  async function createProduct(
    overrides: Partial<Prisma.ProductUncheckedCreateInput> = {},
  ): Promise<{ id: string }> {
    const brand = await createBrand();
    const category = await createCategory();
    const suffix = uniqueSuffix();
    const product = await prisma.product.create({
      data: {
        name: `محصول ${suffix}`,
        slug: `prod-imp-${suffix}`,
        brandId: brand.id,
        categoryId: category.id,
        condition: ProductCondition.NEW,
        createdBy: actorId,
        ...overrides,
      },
    });
    createdProductIds.push(product.id);
    return { id: product.id };
  }

  async function createVariant(
    productId: string,
    overrides: Partial<Prisma.ProductVariantUncheckedCreateInput> = {},
  ): Promise<{ id: string }> {
    const variant = await prisma.productVariant.create({
      data: {
        productId,
        sku: `SKU-IMP-${uniqueSuffix()}`,
        price: '100.00',
        createdBy: actorId,
        ...overrides,
      },
    });
    createdVariantIds.push(variant.id);
    return { id: variant.id };
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = new AuditService(prisma);
    service = new ProductsService(prisma, audit, new StorefrontCacheService(new ConfigService()));
  });

  afterAll(async () => {
    await prisma.importRecord.deleteMany({
      where: { runId: { in: createdRunIds } },
    });
    await prisma.importRun.deleteMany({ where: { id: { in: createdRunIds } } });
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
    await prisma.$disconnect();
  });

  describe('Product source identity', () => {
    it('stores an external identity on create', async () => {
      const { id } = await createProduct({
        sourceSystem: 'WOOCOMMERCE',
        sourceId: `2774-${uniqueSuffix()}`,
        sourceType: 'simple',
      });

      const row = await prisma.product.findUniqueOrThrow({ where: { id } });
      expect(row.sourceSystem).toBe('WOOCOMMERCE');
      expect(row.sourceType).toBe('simple');
      expect(row.sourceId).toContain('2774-');
    });

    it('rejects a duplicate (sourceSystem, sourceId) pair', async () => {
      const sourceId = `dup-${uniqueSuffix()}`;
      await createProduct({
        sourceSystem: 'WOOCOMMERCE',
        sourceId,
        sourceType: 'simple',
      });

      await expect(
        createProduct({
          sourceSystem: 'WOOCOMMERCE',
          sourceId,
          sourceType: 'simple',
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('lets separate source systems share a sourceId', async () => {
      const sourceId = `shared-${uniqueSuffix()}`;
      await createProduct({
        sourceSystem: 'WOOCOMMERCE',
        sourceId,
        sourceType: 'simple',
      });

      const { id } = await createProduct({
        sourceSystem: 'HOLO',
        sourceId,
        sourceType: 'kala',
      });
      const row = await prisma.product.findUniqueOrThrow({ where: { id } });
      expect(row.sourceSystem).toBe('HOLO');
    });

    it('allows many products without any source identity', async () => {
      const first = await createProduct();
      const second = await createProduct();

      const rows = await prisma.product.findMany({
        where: { id: { in: [first.id, second.id] } },
      });
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.sourceSystem === null)).toBe(true);
    });

    it('preserves source identity across service updates', async () => {
      const sourceId = `stable-${uniqueSuffix()}`;
      const { id } = await createProduct({
        sourceSystem: 'WOOCOMMERCE',
        sourceId,
        sourceType: 'simple',
      });

      await service.update(
        id,
        { name: `نام به‌روزشده ${uniqueSuffix()}` },
        actorId,
      );

      const row = await prisma.product.findUniqueOrThrow({ where: { id } });
      expect(row.sourceSystem).toBe('WOOCOMMERCE');
      expect(row.sourceId).toBe(sourceId);
      expect(row.sourceType).toBe('simple');
    });
  });

  describe('ProductVariant source identity', () => {
    it('rejects a duplicate variant identity and stays independent of products', async () => {
      const sourceId = `var-${uniqueSuffix()}`;
      const { id: productId } = await createProduct({
        sourceSystem: 'WOOCOMMERCE',
        sourceId: `prod-${sourceId}`,
        sourceType: 'variable',
      });
      await createVariant(productId, {
        sourceSystem: 'WOOCOMMERCE',
        sourceId,
        sourceType: 'variation',
      });

      // Same pair on a second variant must fail…
      await expect(
        createVariant(productId, {
          sourceSystem: 'WOOCOMMERCE',
          sourceId,
          sourceType: 'variation',
        }),
      ).rejects.toMatchObject({ code: 'P2002' });

      // …but the same pair on a *product* is independent and must succeed.
      const other = await createProduct({
        sourceSystem: 'WOOCOMMERCE',
        sourceId: sourceId,
        sourceType: 'simple',
      });
      const row = await prisma.product.findUniqueOrThrow({
        where: { id: other.id },
      });
      expect(row.sourceId).toBe(sourceId);
    });
  });

  describe('ImportRun / ImportRecord', () => {
    async function createRun(): Promise<{ id: string }> {
      const run = await prisma.importRun.create({
        data: { sourceSystem: 'WOOCOMMERCE' },
      });
      createdRunIds.push(run.id);
      return { id: run.id };
    }

    it('defaults a run to RUNNING and a record to PENDING', async () => {
      const { id: runId } = await createRun();
      const record = await prisma.importRecord.create({
        data: {
          runId,
          sourceSystem: 'WOOCOMMERCE',
          sourceId: `row-${uniqueSuffix()}`,
          sourceType: 'simple',
        },
      });

      expect(runId).toBeDefined();
      const run = await prisma.importRun.findUniqueOrThrow({
        where: { id: runId },
      });
      expect(run.status).toBe(ImportRunStatus.RUNNING);
      expect(record.status).toBe(ImportRecordStatus.PENDING);
      expect(record.attempts).toBe(0);
    });

    it('rejects a duplicate (runId, sourceSystem, sourceId) record', async () => {
      const { id: runId } = await createRun();
      const sourceId = `row-dup-${uniqueSuffix()}`;
      await prisma.importRecord.create({
        data: { runId, sourceSystem: 'WOOCOMMERCE', sourceId },
      });

      await expect(
        prisma.importRecord.create({
          data: { runId, sourceSystem: 'WOOCOMMERCE', sourceId },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('persists FAILED errors and replays to IMPORTED with a bounded source snapshot', async () => {
      const { id: runId } = await createRun();
      const { id: productId } = await createProduct({
        sourceSystem: 'WOOCOMMERCE',
        sourceId: `replay-${uniqueSuffix()}`,
        sourceType: 'simple',
      });

      const failed = await prisma.importRecord.create({
        data: {
          runId,
          sourceSystem: 'WOOCOMMERCE',
          sourceId: `replay-row-${uniqueSuffix()}`,
          sourceType: 'simple',
          status: ImportRecordStatus.FAILED,
          attempts: 1,
          error: 'دانلود تصویر ناموفق بود.',
        },
      });
      expect(failed.error).toContain('تصویر');

      const replayed = await prisma.importRecord.update({
        where: { id: failed.id },
        data: {
          status: ImportRecordStatus.IMPORTED,
          attempts: 2,
          error: null,
          productId,
          sourceRowHash: 'sha256:abc123',
          sourceData: {
            شناسه: '2774',
            نوع: 'simple',
            نام: 'هارد اکسترنال نمونه',
          },
        },
      });
      expect(replayed.status).toBe(ImportRecordStatus.IMPORTED);
      expect(replayed.productId).toBe(productId);
      expect(replayed.sourceData).toMatchObject({ نوع: 'simple' });
    });

    it('resolves records by (runId, status) for resume and by (sourceSystem, sourceId) for history', async () => {
      const { id: runId } = await createRun();
      const sourceId = `lookup-${uniqueSuffix()}`;
      await prisma.importRecord.create({
        data: {
          runId,
          sourceSystem: 'WOOCOMMERCE',
          sourceId,
          status: ImportRecordStatus.SKIPPED,
        },
      });

      const pending = await prisma.importRecord.findMany({
        where: { runId, status: ImportRecordStatus.PENDING },
      });
      expect(pending).toHaveLength(0);

      const history = await prisma.importRecord.findMany({
        where: { sourceSystem: 'WOOCOMMERCE', sourceId },
      });
      expect(history).toHaveLength(1);
      expect(history[0]?.status).toBe(ImportRecordStatus.SKIPPED);
    });

    it('cascades record cleanup when a run is deleted', async () => {
      const run = await prisma.importRun.create({
        data: { sourceSystem: 'WOOCOMMERCE' },
      });
      await prisma.importRecord.create({
        data: {
          runId: run.id,
          sourceSystem: 'WOOCOMMERCE',
          sourceId: `cascade-${uniqueSuffix()}`,
        },
      });

      await prisma.importRun.delete({ where: { id: run.id } });
      const leftovers = await prisma.importRecord.findMany({
        where: { runId: run.id },
      });
      expect(leftovers).toHaveLength(0);
    });
  });
});
