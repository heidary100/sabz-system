import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaService } from '../src/common/database/prisma.service';
import { FfmpegRunner } from '../src/modules/products/media-processing/ffmpeg.runner';
import { ImageProcessorService } from '../src/modules/products/media-processing/image-processor.service';
import { MediaProcessingService } from '../src/modules/products/media-processing/media-processing.service';
import { VideoProcessorService } from '../src/modules/products/media-processing/video-processor.service';
import { resolveWatermarkConfig } from '../src/modules/products/media-processing/watermark-config';
import { WatermarkOverlayService } from '../src/modules/products/media-processing/watermark-overlay.service';
import { LocalDiskMediaStorage } from '../src/modules/products/storage/local-disk-media.storage';
import { MediaFetchError } from '../src/modules/import/woo-media';
import type { DownloadedMedia } from '../src/modules/import/woo-media';
import { WooMediaRunner } from '../src/modules/import/woo-media-runner';
import { WooRunner } from '../src/modules/import/woo-runner';

import { StorefrontCacheService } from '../src/common/storefront-cache/storefront-cache.service';
import { ConfigService } from '@nestjs/config';
jest.setTimeout(180_000);

/**
 * WooCommerce media downloader integration (SS-208).
 *
 * Runs the SS-207 writer over the committed 8-row fixture (with media
 * placeholders), then the downloader with a mocked fetch: proves placeholders
 * backfill in place with real storage keys + content hashes, CSV ordering and
 * primary assignment hold, a failed image is dead-lettered without failing
 * its siblings, retries fire, and re-runs are no-ops (skip-dedup + resume).
 * Every created row and stored binary is removed afterwards.
 */
describe('WooCommerce media downloader integration (SS-208)', () => {
  let prisma: PrismaService;
  let runner: WooMediaRunner;
  let writer: WooRunner;
  let storageDir: string;
  let storage: LocalDiskMediaStorage;

  const fixture = join(
    __dirname,
    '..',
    'src',
    'modules',
    'import',
    'fixtures',
    'woo-sample.csv',
  );

  const FAIL_URL = 'https://cdn.example.com/fix/1b.jpg';
  const FLAKY_URL = 'https://cdn.example.com/fix/7.jpg';
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

  const calls = new Map<string, number>();

  async function mockDownload(url: string): Promise<DownloadedMedia> {
    calls.set(url, (calls.get(url) ?? 0) + 1);
    if (url === FAIL_URL) {
      // Persistent transient failure: exhausts all 3 attempts, then dead-letters.
      throw new MediaFetchError('دریافت تصویر از آدرس ناموفق بود.', true);
    }
    if (url === FLAKY_URL && calls.get(url) === 1) {
      throw new MediaFetchError('دریافت تصویر از آدرس ناموفق بود.', true);
    }
    const dir = mkdtempSync(join(tmpdir(), 'sabz-media-mock-'));
    const filePath = join(dir, 'dl.bin');
    writeFileSync(filePath, PNG);
    return {
      filePath,
      dir,
      sizeBytes: PNG.length,
      contentHash: createHash('sha256').update(PNG).digest('hex'),
      detectedMime: 'image/png',
    };
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    writer = new WooRunner(prisma, new StorefrontCacheService(new ConfigService()));
    storageDir = mkdtempSync(join(tmpdir(), 'sabz-media-store-'));
    const tempDir = join(storageDir, 'tmp');
    storage = new LocalDiskMediaStorage(storageDir);
    const watermark = { ...resolveWatermarkConfig(), enabled: false };
    const overlay = new WatermarkOverlayService(watermark);
    const processing = new MediaProcessingService(
      new ImageProcessorService(overlay, watermark),
      new VideoProcessorService(
        overlay,
        new FfmpegRunner(FfmpegRunner.resolveBinary()),
        watermark,
        tempDir,
      ),
      watermark,
    );
    runner = new WooMediaRunner(prisma, storage, processing, tempDir, mockDownload);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    rmSync(storageDir, { recursive: true, force: true });
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
    const diff = (ids: Set<string>, rows: Array<{ id: string }>): string[] =>
      rows.map((row) => row.id).filter((id) => !ids.has(id));
    const newVariants = diff(before.variants, variants);
    const newProducts = diff(before.products, products);
    // ImportRecords cascade from ImportRun; ProductMedia cascades from Product.
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

  it('backfills placeholders, isolates failures, retries, then re-runs as no-ops', async () => {
    const before = await snapshot();
    try {
      const written = await writer.runImport({ file: fixture, includeMediaRefs: true });
      expect(written.exitCode).toBe(0);
      expect(written.report.mediaRefs).toBe(4);

      const placeholders = await prisma.productMedia.findMany({
        where: { storageKey: { startsWith: 'pending-woo:' } },
        select: { id: true },
      });
      expect(placeholders).toHaveLength(4);

      // Run 1: 1a/7/8 backfill, 1b dead-letters, 7 proves retry.
      const first = await runner.runMedia({
        file: fixture,
        allowPrivate: true,
        concurrency: 2,
      });
      expect(first.report.images.refs).toBe(4);
      expect(first.report.images.processed).toBe(3);
      expect(first.report.images.downloaded).toBe(3);
      expect(first.report.images.failed).toBe(1);
      expect(first.report.images.skippedDedup).toBe(0);
      expect(first.report.failures).toHaveLength(1);
      expect(first.report.failures[0]).toMatchObject({ sourceId: '9001', url: FAIL_URL });
      expect(calls.get(FAIL_URL)).toBe(3);
      expect(calls.get(FLAKY_URL)).toBe(2);

      const media9001 = await prisma.productMedia.findMany({
        where: {
          product: {
            sourceSystem: 'WOOCOMMERCE',
            sourceId: '9001',
          },
        },
        orderBy: { sortOrder: 'asc' },
      });
      expect(media9001).toHaveLength(2);
      // CSV order preserved; first image primary.
      expect(media9001.map((row) => row.sortOrder)).toEqual([0, 1]);
      expect(media9001[0]).toMatchObject({ isPrimary: true });
      // 1a backfilled with real binary; 1b placeholder survives its failure.
      const live1a = media9001.find((row) => row.sourceUrl?.endsWith('1a.jpg'));
      expect(live1a?.storageKey.startsWith('pending-woo:')).toBe(false);
      expect(live1a?.contentHash).toBe(createHash('sha256').update(PNG).digest('hex'));
      expect(live1a?.mimeType).toBe('image/png');
      const pending1b = media9001.find((row) => row.sourceUrl === FAIL_URL);
      expect(pending1b?.storageKey.startsWith('pending-woo:')).toBe(true);
      const stored = await storage.get(live1a!.storageKey);
      expect(stored.equals(PNG)).toBe(true);

      const mediaCount = await prisma.productMedia.count();

      // Run 2: 9007/9008 resume-skip (IMPORTED, unchanged hash); 9001
      // reprocesses with 1a as a duplicate skip and 1b failing again.
      const second = await runner.runMedia({ file: fixture, allowPrivate: true });
      expect(second.report.images.processed).toBe(0);
      expect(second.report.images.downloaded).toBe(0);
      expect(second.report.images.skippedDedup).toBe(1);
      expect(second.report.images.failed).toBe(1);
      expect(second.report.resumed).toBe(2);
      expect(await prisma.productMedia.count()).toBe(mediaCount);
    } finally {
      await cleanup(before);
    }
  });
});
