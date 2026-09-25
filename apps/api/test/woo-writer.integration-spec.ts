import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PriceStatus, ProductStatus } from '@prisma/client';
import { PrismaService } from '../src/common/database/prisma.service';
import { parseWooCsvFile } from '../src/modules/import/woo-parse';
import { WooRunner } from '../src/modules/import/woo-runner';

import { StorefrontCacheService } from '../src/common/storefront-cache/storefront-cache.service';
import { ConfigService } from '@nestjs/config';
jest.setTimeout(120_000);

/**
 * WooCommerce writer integration (SS-207).
 *
 * Runs the real writer over the committed 8-row fixture on sabz_test and
 * proves: write → re-write yields zero new rows (idempotency + resume),
 * draft→published transitions and price updates apply, ledger movements are
 * exactly one per variant, and a failed row never aborts its siblings.
 * Every created row is removed afterwards; the suite is order-independent.
 */
describe('WooCommerce writer integration (SS-207)', () => {
  let prisma: PrismaService;
  let runner: WooRunner;

  const fixture = join(
    __dirname,
    '..',
    'src',
    'modules',
    'import',
    'fixtures',
    'woo-sample.csv',
  );

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    runner = new WooRunner(prisma, new StorefrontCacheService(new ConfigService()));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function snapshot(): Promise<Snapshot> {
    const [products, variants, categories, brands, tags, attributes, values, runs] =
      await Promise.all([
        prisma.product.findMany({ select: { id: true } }),
        prisma.productVariant.findMany({ select: { id: true } }),
        prisma.category.findMany({ select: { id: true } }),
        prisma.brand.findMany({ select: { id: true } }),
        prisma.tag.findMany({ select: { id: true } }),
        prisma.attribute.findMany({ select: { id: true } }),
        prisma.attributeValue.findMany({ select: { id: true } }),
        prisma.importRun.findMany({ select: { id: true } }),
      ]);
    const toSet = (rows: Array<{ id: string }>): Set<string> => new Set(rows.map((row) => row.id));
    return {
      products: toSet(products),
      variants: toSet(variants),
      categories: toSet(categories),
      brands: toSet(brands),
      tags: toSet(tags),
      attributes: toSet(attributes),
      values: toSet(values),
      runs: toSet(runs),
    };
  }

  function diff(before: Set<string>, after: Array<{ id: string }>): string[] {
    return after.map((row) => row.id).filter((id) => !before.has(id));
  }

  interface Snapshot {
    products: Set<string>;
    variants: Set<string>;
    categories: Set<string>;
    brands: Set<string>;
    tags: Set<string>;
    attributes: Set<string>;
    values: Set<string>;
    runs: Set<string>;
  }

  async function cleanup(before: Snapshot): Promise<void> {
    const [products, variants, categories, brands, tags, attributes, values, runs] =
      await Promise.all([
        prisma.product.findMany({ select: { id: true } }),
        prisma.productVariant.findMany({ select: { id: true } }),
        prisma.category.findMany({ select: { id: true } }),
        prisma.brand.findMany({ select: { id: true } }),
        prisma.tag.findMany({ select: { id: true } }),
        prisma.attribute.findMany({ select: { id: true } }),
        prisma.attributeValue.findMany({ select: { id: true } }),
        prisma.importRun.findMany({ select: { id: true } }),
      ]);
    const newVariants = diff(before.variants, variants);
    const newProducts = diff(before.products, products);
    await prisma.importRun.deleteMany({ where: { id: { in: diff(before.runs, runs) } } });
    await prisma.inventoryMovement.deleteMany({ where: { variantId: { in: newVariants } } });
    await prisma.inventoryItem.deleteMany({ where: { variantId: { in: newVariants } } });
    await prisma.product.deleteMany({ where: { id: { in: newProducts } } });
    await prisma.attributeValue.deleteMany({ where: { id: { in: diff(before.values, values) } } });
    await prisma.attribute.deleteMany({ where: { id: { in: diff(before.attributes, attributes) } } });
    await prisma.tag.deleteMany({ where: { id: { in: diff(before.tags, tags) } } });
    await prisma.brand.deleteMany({ where: { id: { in: diff(before.brands, brands) } } });
    await prisma.category.deleteMany({ where: { id: { in: diff(before.categories, categories) } } });
  }

  async function productBySource(sourceId: string) {
    return prisma.product.findUniqueOrThrow({
      where: { sourceSystem_sourceId: { sourceSystem: 'WOOCOMMERCE', sourceId } },
      include: {
        brand: true,
        category: true,
        variants: { include: { options: { include: { attributeValue: { include: { attribute: true } } } } } },
        tags: { include: { tag: true }, orderBy: { sortOrder: 'asc' } },
        specs: { include: { attributeValue: { include: { attribute: true } } } },
      },
    });
  }

  it('writes the fixture, then re-writes with zero new rows', async () => {
    const before = await snapshot();
    try {
      const first = await runner.runImport({ file: fixture });
      expect(first.exitCode).toBe(0);
      expect(first.report.rows).toBe(8);
      expect(first.report.verdicts).toMatchObject({ create: 7, update: 0, skip: 1 });
      expect(first.report.products).toMatchObject({ created: 6, updated: 0, skipped: 1, failed: 0 });
      expect(first.report.variants).toMatchObject({ created: 6, updated: 0, failed: 0 });
      expect(first.report.shellsPublished).toBe(1);
      expect(first.report.movements).toBe(6);
      expect(first.report.resumed).toBe(0);

      // Spot-check the priced on-sale row (Rial verbatim, O-1).
      const priced = await productBySource('9001');
      expect(priced.status).toBe(ProductStatus.PUBLISHED);
      expect(priced.category.name).toBe('هارد دیسک اکسترنال');
      expect(priced.brand?.name).toBe('FixtureBrand');
      expect(priced.tags.map((row) => row.tag.name)).toEqual(['هارد اکسترنال', 'فیکسچر']);
      expect(priced.specs.some((row) => row.attributeValue.value === '1 ترابایت')).toBe(true);
      expect(priced.variants).toHaveLength(1);
      expect(priced.variants[0]).toMatchObject({
        sku: 'FIXTURE-HD1TB-BLK',
        priceStatus: PriceStatus.PRICED,
      });
      expect(priced.variants[0]!.price.toString()).toBe('15000000');
      expect(priced.variants[0]!.compareAtPrice?.toString()).toBe('18000000');
      const item = await prisma.inventoryItem.findFirstOrThrow({
        where: { variantId: priced.variants[0]!.id },
        include: { movements: true },
      });
      expect(item.quantityOnHand).toBe(7);
      expect(item.movements).toHaveLength(1);
      expect(item.movements[0]!.type).toBe('INITIAL_STOCK');

      // Call-for-price, drafts, and the linked shell.
      const priceless = await productBySource('9002');
      expect(priceless.variants[0]).toMatchObject({ priceStatus: PriceStatus.CALL_FOR_PRICE });
      expect(priceless.variants[0]!.price.toString()).toBe('0');
      expect(priceless.brand).toBeNull();
      expect((await productBySource('9006')).status).toBe(ProductStatus.DRAFT);
      expect((await productBySource('9007')).status).toBe(ProductStatus.DRAFT);
      const shell = await productBySource('9003');
      expect(shell.status).toBe(ProductStatus.PUBLISHED);
      expect(shell.variants).toHaveLength(1);
      expect(shell.variants[0]!.sku).toBe('FIXTURE-VARBASE-BLK');
      expect(
        shell.variants[0]!.options.some(
          (option) =>
            option.attributeValue.attribute.name === 'انتخاب رنگ' &&
            option.attributeValue.value === 'مشکی',
        ),
      ).toBe(true);

      const run = await prisma.importRun.findUniqueOrThrow({ where: { id: first.report.runId } });
      expect(run.status).toBe('COMPLETED');
      expect(await prisma.importRecord.count({ where: { runId: run.id, status: 'IMPORTED' } })).toBe(7);
      expect(await prisma.importRecord.count({ where: { runId: run.id, status: 'SKIPPED' } })).toBe(1);

      // Idempotency proof: re-write adds zero rows anywhere.
      const countAll = async () => ({
        products: await prisma.product.count(),
        variants: await prisma.productVariant.count(),
        movements: await prisma.inventoryMovement.count(),
        media: await prisma.productMedia.count(),
      });
      const afterFirst = await countAll();
      const second = await runner.runImport({ file: fixture });
      expect(second.exitCode).toBe(0);
      expect(second.report.products).toMatchObject({ created: 0, updated: 0, failed: 0 });
      expect(second.report.variants).toMatchObject({ created: 0, updated: 0 });
      expect(second.report.movements).toBe(0);
      expect(second.report.resumed).toBe(7);
      expect(await countAll()).toEqual(afterFirst);
      const secondRunRecords = await prisma.importRecord.count({ where: { runId: second.report.runId } });
      expect(secondRunRecords).toBe(8);
    } finally {
      await cleanup(before);
    }
  });

  it('applies draft→published transitions and price updates', async () => {
    const before = await snapshot();
    const dir = mkdtempSync(join(tmpdir(), 'woo-writer-'));
    try {
      await runner.runImport({ file: fixture });
      expect((await productBySource('9006')).status).toBe(ProductStatus.DRAFT);

      const raw = readFileSync(fixture, 'utf8');
      const edited = raw
        .replace('پیش‌نویس نمونه,0,', 'پیش‌نویس نمونه,1,')
        .replace('15000000,18000000,', '15000000,19000000,');
      expect(edited).not.toBe(raw);
      const updatedFile = join(dir, 'updated.csv');
      writeFileSync(updatedFile, edited, 'utf8');

      const rerun = await runner.runImport({ file: updatedFile });
      expect(rerun.exitCode).toBe(0);
      expect((await productBySource('9006')).status).toBe(ProductStatus.PUBLISHED);
      const repriced = await productBySource('9001');
      expect(repriced.variants[0]!.compareAtPrice?.toString()).toBe('19000000');
      expect(repriced.variants[0]!.price.toString()).toBe('15000000');
      const updatedRecords = await prisma.importRecord.count({
        where: { runId: rerun.report.runId, status: 'UPDATED' },
      });
      expect(updatedRecords).toBe(2);
      // Stock unchanged on both rows: no new ledger movements.
      expect(rerun.report.movements).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      await cleanup(before);
    }
  });

  it('isolates a failed row while siblings import', async () => {
    const before = await snapshot();
    const dir = mkdtempSync(join(tmpdir(), 'woo-writer-'));
    try {
      const header = parseWooCsvFile(fixture).header;
      const escape = (value: string): string =>
        /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
      const row = (cells: Record<string, string>): string =>
        header.map((name) => escape(cells[name] ?? '')).join(',');
      const csv = [
        header.map(escape).join(','),
        row({
          'شناسه': '9103',
          'نوع': 'simple',
          'شناسه محصول': 'SKU9103',
          'نام': 'کالای خوب',
          'منتشر شده': '1',
          'قابل مشاهده در کاتالوگ': 'visible',
          'قیمت عادی': '2000000',
          'دسته‌ها': 'کالای دیجیتال',
        }),
        row({
          'شناسه': '9101',
          'نوع': 'variable',
          'شناسه محصول': 'PARENT9101',
          'نام': '',
          'منتشر شده': '1',
          'قابل مشاهده در کاتالوگ': 'visible',
          'دسته‌ها': 'کالای دیجیتال',
        }),
        row({
          'شناسه': '9102',
          'نوع': 'variation',
          'شناسه محصول': 'VAR9102',
          'نام': 'واریشن تست',
          'منتشر شده': '1',
          'قابل مشاهده در کاتالوگ': 'visible',
          'مادر': 'PARENT9101',
          'قیمت عادی': '1000000',
          'دسته‌ها': 'کالای دیجیتال',
        }),
      ].join('\n');
      const badFile = join(dir, 'partial.csv');
      writeFileSync(badFile, `${csv}\n`, 'utf8');

      const strict = await runner.runImport({ file: badFile });
      expect(strict.exitCode).toBe(1);
      expect(strict.report.failures).toHaveLength(1);
      expect(strict.report.failures[0]).toMatchObject({ sourceId: '9102' });
      expect(strict.report.failures[0]!.error).toContain('والد');
      const strictRun = await prisma.importRun.findUniqueOrThrow({ where: { id: strict.report.runId } });
      expect(strictRun.status).toBe('FAILED');
      // Siblings are unaffected: good row imported, bad-parent skipped.
      expect((await productBySource('9103')).status).toBe(ProductStatus.PUBLISHED);
      expect(
        await prisma.importRecord.count({ where: { runId: strict.report.runId, status: 'SKIPPED' } }),
      ).toBe(1);

      // A higher threshold tolerates the known-bad row with exit 0.
      const lenient = await runner.runImport({ file: badFile, failureThreshold: 1 });
      expect(lenient.exitCode).toBe(0);
      const lenientRun = await prisma.importRun.findUniqueOrThrow({ where: { id: lenient.report.runId } });
      expect(lenientRun.status).toBe('COMPLETED');
    } finally {
      rmSync(dir, { recursive: true, force: true });
      await cleanup(before);
    }
  });
});
