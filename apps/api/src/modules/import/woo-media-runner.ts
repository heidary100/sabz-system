import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { sanitizeMediaDisplayName } from '../products/media-validation';
import { extensionForMediaMime, mediaTypeForMime } from '../products/media-validation';
import { FfmpegRunner } from '../products/media-processing/ffmpeg.runner';
import { ImageProcessorService } from '../products/media-processing/image-processor.service';
import { MediaProcessingService } from '../products/media-processing/media-processing.service';
import { VideoProcessorService } from '../products/media-processing/video-processor.service';
import {
  resolveWatermarkConfig,
  type WatermarkConfig,
} from '../products/media-processing/watermark-config';
import { WatermarkOverlayService } from '../products/media-processing/watermark-overlay.service';
import { resolveProductMediaTempDir } from '../products/media-upload.config';
import { LocalDiskMediaStorage } from '../products/storage/local-disk-media.storage';
import type { ProductMediaStorage } from '../products/storage/product-media-storage';
import {
  backoffMs,
  basenameForUrl,
  cleanupDownloaded,
  DEFAULT_MEDIA_CONCURRENCY,
  downloadMediaToTemp,
  isRetryable,
  MEDIA_IMPORT_ACTOR,
  MEDIA_MAX_ATTEMPTS,
  MEDIA_SOURCE_SYSTEM,
  PENDING_MEDIA_PREFIX,
  probeMediaUrl,
  type DownloadedMedia,
  type DownloadOptions,
  type MediaProbe,
} from './woo-media';
import { buildFileIndex, createClaimants, resolveRow, type ResolvedRow } from './woo-resolve';
import { parseWooCsvFile, type WooRecord } from './woo-parse';
import { WOO_SOURCE_SYSTEM, WooReferenceLoader } from './woo-reference';
import { buildProductPlan, buildRowHash, faError, type ProductPlan } from './woo-write';

/**
 * Bulk media downloader (SS-208).
 *
 * Brings referenced product images into Sabz through the real media pipeline
 * (watermark + thumbnail via `MediaProcessingService`, same as admin
 * uploads): per URL — allowlist → skip-hit on `(productId, sourceUrl)` →
 * download with timeout/size caps → sha256 → skip on `(productId,
 * contentHash)` reuse → process → store → backfill the SS-207
 * `pending-woo:*` placeholder in place (or create when no placeholder
 * exists). Re-runs are no-ops per asset.
 *
 * In-process batching with a worker pool (default 6 products in flight,
 * sequential downloads within a product so CSV `sortOrder` and the
 * exactly-one-primary invariant hold without row locks). Per-image
 * try/catch: a failed image is dead-lettered, never a failed product.
 *
 * Audit lives in ImportRun/ImportRecord under the dedicated
 * `WOOCOMMERCE_MEDIA` source system so media resume never cross-talks with
 * the SS-207 writer's resume (both key on row hash).
 */

export interface RunMediaOptions {
  file: string;
  limit?: number;
  /** Products processed concurrently (default 6). */
  concurrency?: number;
  /** Extra allowed download hosts beyond the `sabzsistem.com` seed. */
  allowHosts?: string[];
  /** Test/staging escape: skip SSRF pinning (never default true). */
  allowPrivate?: boolean;
  /** Header-probe only: report without writing any media. */
  dryRun?: boolean;
  /** Non-zero exit iff image failures exceed this count (default 0). */
  failureThreshold?: number;
  /** Skip rows already IMPORTED by a media run with unchanged hash. */
  resume?: boolean;
}

export interface MediaImageFailure {
  line: number;
  sourceId: string;
  url: string;
  error: string;
}

export interface MediaReport {
  generatedAt: string;
  file: string;
  runId: string;
  dryRun: boolean;
  rows: number;
  products: number;
  images: {
    refs: number;
    downloaded: number;
    processed: number;
    failed: number;
    skippedDedup: number;
  };
  resumed: number;
  failures: MediaImageFailure[];
  decisions: string[];
}

const MEDIA_DECISIONS = [
  'Allowlist seeded with sabzsistem.com; extra hosts only via explicit --allow-host.',
  'CSV image order is sortOrder; the first image is primary; second_image occupies position 1 (no new field).',
  'Re-runs skip on (productId, sourceUrl) and (productId, contentHash): no duplicate media.',
  'Failed image never fails its product; failures are dead-lettered per URL.',
  'Binaries run the standard watermark + thumbnail pipeline (MediaProcessingService).',
  'No queue/broker: in-process batching with a concurrency cap (per ADR constraints).',
];

/** Injectable fetch shims so tests run without network. */
export type MediaDownloader = (
  url: string,
  options: DownloadOptions,
) => Promise<DownloadedMedia>;
export type MediaProber = (url: string, options: DownloadOptions) => Promise<MediaProbe>;

interface ProductTask {
  line: number;
  sourceId: string;
  sourceType: string;
  rowHash: string;
  record: WooRecord;
  verdict: ResolvedRow;
  plan: ProductPlan;
  productId: string;
  variantId: string | null;
}

interface ExistingMedia {
  id: string;
  sourceUrl: string | null;
  contentHash: string | null;
  storageKey: string;
  sortOrder: number;
  isPrimary: boolean;
  deletedAt: Date | null;
}

interface MediaCounts {
  downloaded: number;
  processed: number;
  failed: number;
  skippedDedup: number;
  resumed: number;
}

/** Builds a standalone runner from the process environment (CLI/Nest factory). */
export function createWooMediaRunner(
  prisma: PrismaService,
  overrides: {
    storageDir?: string;
    tempDir?: string;
    watermark?: WatermarkConfig;
    downloader?: MediaDownloader;
    prober?: MediaProber;
  } = {},
): WooMediaRunner {
  const storageDir =
    overrides.storageDir ?? process.env.PRODUCT_MEDIA_STORAGE_DIR ?? '.data/product-media';
  const tempDir = overrides.tempDir ?? resolveProductMediaTempDir();
  const watermark = overrides.watermark ?? resolveWatermarkConfig();
  const storage = new LocalDiskMediaStorage(storageDir);
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
  return new WooMediaRunner(
    prisma,
    storage,
    processing,
    tempDir,
    overrides.downloader,
    overrides.prober,
  );
}

@Injectable()
export class WooMediaRunner {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ProductMediaStorage,
    private readonly processing: MediaProcessingService,
    private readonly tempDir: string,
    private readonly downloader: MediaDownloader = downloadMediaToTemp,
    private readonly prober: MediaProber = probeMediaUrl,
  ) {}

  async runMedia(options: RunMediaOptions): Promise<{ report: MediaReport; exitCode: number }> {
    const threshold = options.failureThreshold ?? 0;
    const resume = options.resume ?? true;
    const concurrency = options.concurrency ?? DEFAULT_MEDIA_CONCURRENCY;
    const allowHosts = options.allowHosts ?? [];
    const allowPrivate = options.allowPrivate ?? false;
    const dryRun = options.dryRun ?? false;

    const parsed = parseWooCsvFile(options.file, options.limit);
    const loader = new WooReferenceLoader(this.prisma);
    const refs = await loader.load();
    const index = buildFileIndex(parsed.rows);
    const claimants = createClaimants(refs);

    const run = await this.prisma.importRun.create({
      data: { sourceSystem: MEDIA_SOURCE_SYSTEM },
      select: { id: true },
    });

    const productIdBySourceKey = await this.loadSourceIndex();
    const counts: MediaCounts = {
      downloaded: 0,
      processed: 0,
      failed: 0,
      skippedDedup: 0,
      resumed: 0,
    };
    const failures: MediaImageFailure[] = [];
    let refsTotal = 0;
    let productsAttempted = 0;

    // Resolve verdicts + plans first (cheap, local): SKIP rows are recorded
    // without touching the catalog; the rest become per-product tasks.
    const tasks: ProductTask[] = [];
    for (const record of parsed.rows) {
      const verdict = await resolveRow(record, refs, index, claimants);
      if (verdict.action === 'SKIP') {
        await this.recordRow(
          run.id,
          record,
          verdict,
          'SKIPPED',
          verdict.reasons.join(' | ') || 'SKIP',
        );
        continue;
      }
      const rowHash = buildRowHash(record.cells);
      if (resume) {
        const prior = await this.prisma.importRecord.findFirst({
          where: { sourceSystem: MEDIA_SOURCE_SYSTEM, sourceId: verdict.sourceId },
          orderBy: { createdAt: 'desc' },
          select: { status: true, sourceRowHash: true },
        });
        if (
          prior &&
          prior.status === 'IMPORTED' &&
          prior.sourceRowHash === rowHash
        ) {
          counts.resumed += 1;
          await this.recordRow(
            run.id,
            record,
            verdict,
            'SKIPPED',
            'resume: unchanged hash, media already imported.',
            null,
            null,
            rowHash,
          );
          continue;
        }
      }
      const plan = buildProductPlan(record, verdict);
      if (!plan) {
        await this.recordRow(
          run.id,
          record,
          verdict,
          'SKIPPED',
          verdict.reasons.join(' | ') || 'SKIP',
          null,
          null,
          rowHash,
        );
        continue;
      }
      if (plan.media.length === 0) {
        await this.recordRow(run.id, record, verdict, 'SKIPPED', 'imageless: no product images.', null, null, rowHash);
        continue;
      }
      const sourceKey = `${WOO_SOURCE_SYSTEM}:${verdict.sourceId}`;
      const productId =
        plan.sourceType === 'variation' && plan.parentSourceKey
          ? productIdBySourceKey.get(plan.parentSourceKey)?.productId
          : productIdBySourceKey.get(sourceKey)?.productId;
      if (!productId) {
        failures.push({
          line: verdict.line,
          sourceId: verdict.sourceId,
          url: plan.media[0]?.url ?? '',
          error: 'محصول در کاتالوگ یافت نشد؛ ابتدا واردات محصول (SS-207) را اجرا کنید.',
        });
        counts.failed += 1;
        await this.recordRow(
          run.id,
          record,
          verdict,
          'FAILED',
          'product missing: run the SS-207 product import first.',
          null,
          null,
          rowHash,
        );
        continue;
      }
      const variantId =
        plan.sourceType === 'variation'
          ? (productIdBySourceKey.get(sourceKey)?.variantId ?? null)
          : null;
      refsTotal += plan.media.length;
      tasks.push({
        line: verdict.line,
        sourceId: verdict.sourceId,
        sourceType: plan.sourceType,
        rowHash,
        record,
        verdict,
        plan,
        productId,
        variantId,
      });
    }

    productsAttempted = tasks.length;
    const workerCount = Math.max(1, Math.min(concurrency, tasks.length));
    let cursor = 0;
    const workers = Array.from({ length: workerCount }, () =>
      (async () => {
        while (cursor < tasks.length) {
          const task = tasks[cursor];
          cursor += 1;
          if (!task) {
            return;
          }
          if (dryRun) {
            await this.probeProduct(run.id, task, { extraHosts: allowHosts, allowPrivate }, counts, failures);
          } else {
            await this.processProduct(run.id, task, { extraHosts: allowHosts, allowPrivate }, counts, failures);
          }
        }
      })(),
    );
    await Promise.all(workers);

    const failed = failures.length;
    await this.prisma.importRun.update({
      where: { id: run.id },
      data: {
        status: failed > threshold ? 'FAILED' : 'COMPLETED',
        finishedAt: new Date(),
        error: failed > 0 ? `${failed} image(s) failed.` : null,
      },
    });

    const report: MediaReport = {
      generatedAt: new Date().toISOString(),
      file: options.file,
      runId: run.id,
      dryRun,
      rows: parsed.rows.length,
      products: productsAttempted,
      images: {
        refs: refsTotal,
        downloaded: counts.downloaded,
        processed: counts.processed,
        failed: counts.failed,
        skippedDedup: counts.skippedDedup,
      },
      resumed: counts.resumed,
      failures,
      decisions: MEDIA_DECISIONS,
    };
    return { report, exitCode: failed > threshold ? 1 : 0 };
  }

  // ------------------------------------------------------------------ helpers

  private async loadSourceIndex(): Promise<
    Map<string, { productId: string; variantId: string | null }>
  > {
    const [sourcedProducts, sourcedVariants] = await Promise.all([
      this.prisma.product.findMany({
        where: { sourceSystem: WOO_SOURCE_SYSTEM, sourceId: { not: null } },
        select: { id: true, sourceId: true },
      }),
      this.prisma.productVariant.findMany({
        where: { sourceSystem: WOO_SOURCE_SYSTEM, sourceId: { not: null } },
        select: { id: true, productId: true, sourceId: true },
      }),
    ]);
    const index = new Map<string, { productId: string; variantId: string | null }>();
    for (const row of sourcedProducts) {
      if (row.sourceId) {
        index.set(`${WOO_SOURCE_SYSTEM}:${row.sourceId}`, {
          productId: row.id,
          variantId: null,
        });
      }
    }
    for (const row of sourcedVariants) {
      if (row.sourceId) {
        index.set(`${WOO_SOURCE_SYSTEM}:${row.sourceId}`, {
          productId: row.productId,
          variantId: row.id,
        });
      }
    }
    return index;
  }

  private async recordRow(
    runId: string,
    record: WooRecord,
    verdict: ResolvedRow,
    status: 'IMPORTED' | 'SKIPPED' | 'FAILED',
    error: string | null,
    productId: string | null = null,
    variantId: string | null = null,
    rowHash?: string,
  ): Promise<void> {
    await this.prisma.importRecord.create({
      data: {
        runId,
        sourceSystem: MEDIA_SOURCE_SYSTEM,
        sourceId: verdict.sourceId,
        sourceType: verdict.sourceType || null,
        sourceRowHash: rowHash ?? buildRowHash(record.cells),
        status,
        attempts: 1,
        error,
        sourceData: record.cells as Prisma.InputJsonValue,
        productId,
        variantId,
      },
    });
  }

  /** Dry-run: header-probe every URL, write nothing. */
  private async probeProduct(
    runId: string,
    task: ProductTask,
    fetchOptions: DownloadOptions,
    counts: MediaCounts,
    failures: MediaImageFailure[],
  ): Promise<void> {
    const existing = await this.prisma.productMedia.findMany({
      where: { productId: task.productId },
      select: { sourceUrl: true, storageKey: true, deletedAt: true },
    });
    const liveByUrl = new Map(
      existing
        .filter((row) => row.sourceUrl && row.deletedAt === null && !row.storageKey.startsWith(PENDING_MEDIA_PREFIX))
        .map((row) => [row.sourceUrl as string, true]),
    );
    let failed = 0;
    for (const item of task.plan.media) {
      if (liveByUrl.has(item.url)) {
        counts.skippedDedup += 1;
        continue;
      }
      try {
        await this.prober(item.url, fetchOptions);
      } catch (error) {
        failed += 1;
        counts.failed += 1;
        failures.push({
          line: task.line,
          sourceId: task.sourceId,
          url: item.url,
          error: faError(error),
        });
      }
    }
    await this.recordRow(
      runId,
      task.record,
      task.verdict,
      failed > 0 ? 'FAILED' : 'SKIPPED',
      failed > 0 ? `${failed} probe(s) failed (dry-run, no writes).` : 'dry-run probe, no writes.',
      task.productId,
      task.variantId,
      task.rowHash,
    );
  }

  /**
   * Live run for one product: sequential downloads in CSV order so
   * `sortOrder`/primary assignment is deterministic without row locks.
   * Products run concurrently with each other.
   */
  private async processProduct(
    runId: string,
    task: ProductTask,
    fetchOptions: DownloadOptions,
    counts: MediaCounts,
    failures: MediaImageFailure[],
  ): Promise<void> {
    const rows: ExistingMedia[] = await this.prisma.productMedia.findMany({
      where: { productId: task.productId },
      select: {
        id: true,
        sourceUrl: true,
        contentHash: true,
        storageKey: true,
        sortOrder: true,
        isPrimary: true,
        deletedAt: true,
      },
    });
    const byUrl = new Map<string, ExistingMedia>();
    const liveHashes = new Set<string>();
    let hasPrimary = false;
    let maxSort = -1;
    for (const row of rows) {
      if (row.sourceUrl) {
        byUrl.set(row.sourceUrl, row);
      }
      if (row.deletedAt === null) {
        if (row.contentHash) {
          liveHashes.add(row.contentHash);
        }
        if (row.isPrimary) {
          hasPrimary = true;
        }
      }
      if (row.sortOrder > maxSort) {
        maxSort = row.sortOrder;
      }
    }
    let order = maxSort + 1;
    let productFailed = 0;
    let productProcessed = 0;

    for (const [position, item] of task.plan.media.entries()) {
      const hit = byUrl.get(item.url);
      if (hit && hit.deletedAt === null && !hit.storageKey.startsWith(PENDING_MEDIA_PREFIX)) {
        counts.skippedDedup += 1;
        continue;
      }
      try {
        const downloaded = await this.downloadWithRetry(item.url, fetchOptions);
        counts.downloaded += 1;
        if (!hit && downloaded.contentHash && liveHashes.has(downloaded.contentHash)) {
          // Same bytes already stored for this product under another URL:
          // skip instead of persisting a duplicate binary.
          counts.skippedDedup += 1;
          await cleanupDownloaded(downloaded);
          continue;
        }
        if (hit) {
          await this.backfillRow(task, hit, item, downloaded, position);
        } else {
          const isPrimary = item.isPrimary && !hasPrimary;
          await this.createRow(task, item, downloaded, order, isPrimary, position);
          order += 1;
          if (isPrimary) {
            hasPrimary = true;
          }
        }
        if (downloaded.contentHash) {
          liveHashes.add(downloaded.contentHash);
        }
        counts.processed += 1;
        productProcessed += 1;
        await cleanupDownloaded(downloaded);
      } catch (error) {
        productFailed += 1;
        counts.failed += 1;
        failures.push({
          line: task.line,
          sourceId: task.sourceId,
          url: item.url,
          error: faError(error),
        });
      }
    }

    await this.recordRow(
      runId,
      task.record,
      task.verdict,
      productFailed > 0 ? 'FAILED' : productProcessed > 0 ? 'IMPORTED' : 'SKIPPED',
      productFailed > 0
        ? `${productFailed} image(s) failed; siblings processed.`
        : productProcessed > 0
          ? null
          : 'all images skipped as duplicates.',
      task.productId,
      task.variantId,
      task.rowHash,
    );
  }

  /** Download with retries + backoff (fatal errors throw immediately). */
  private async downloadWithRetry(
    url: string,
    fetchOptions: DownloadOptions,
  ): Promise<DownloadedMedia> {
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= MEDIA_MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.downloader(url, fetchOptions);
      } catch (error) {
        lastError = error;
        if (!isRetryable(error) || attempt === MEDIA_MAX_ATTEMPTS) {
          throw error;
        }
        await new Promise((resolvePromise) =>
          setTimeout(resolvePromise, backoffMs(attempt)),
        );
      }
    }
    throw lastError;
  }

  /**
   * Backfills an SS-207 placeholder (or soft-deleted row holding the
   * identity) with real binary + metadata, preserving its `sortOrder`.
   * The CSV-first image becomes primary when the product has none.
   */
  private async backfillRow(
    task: ProductTask,
    hit: ExistingMedia,
    item: { url: string; isPrimary: boolean },
    downloaded: DownloadedMedia,
    position: number,
  ): Promise<void> {
    const stored = await this.storeBinary(task.productId, item.url, downloaded, position);
    try {
      await this.prisma.productMedia.update({
        where: { id: hit.id },
        data: {
          mediaType: stored.mediaType,
          originalName: stored.originalName,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          storageKey: stored.storageKey,
          contentHash: downloaded.contentHash,
          thumbnailKey: stored.thumbnailKey,
          thumbnailSizeBytes: stored.thumbnailSizeBytes,
          deletedAt: null,
          isPrimary: hit.isPrimary ? true : await this.claimPrimary(task.productId, item.isPrimary),
          updatedBy: MEDIA_IMPORT_ACTOR,
        },
      });
    } catch (error) {
      await this.deleteStoredBinaries(stored.storageKey, stored.thumbnailKey);
      throw error;
    } finally {
      await this.cleanupProcessed(stored.outputPath, stored.thumbnailPath, downloaded.filePath);
    }
  }

  private async createRow(
    task: ProductTask,
    item: { url: string; isPrimary: boolean },
    downloaded: DownloadedMedia,
    sortOrder: number,
    isPrimary: boolean,
    position: number,
  ): Promise<void> {
    const stored = await this.storeBinary(task.productId, item.url, downloaded, position);
    try {
      await this.prisma.productMedia.create({
        data: {
          productId: task.productId,
          variantId: task.variantId,
          mediaType: stored.mediaType,
          originalName: stored.originalName,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          storageKey: stored.storageKey,
          sourceUrl: item.url,
          contentHash: downloaded.contentHash,
          thumbnailKey: stored.thumbnailKey,
          thumbnailSizeBytes: stored.thumbnailSizeBytes,
          sortOrder,
          isPrimary,
          createdBy: MEDIA_IMPORT_ACTOR,
        },
      });
    } catch (error) {
      await this.deleteStoredBinaries(stored.storageKey, stored.thumbnailKey);
      throw error;
    } finally {
      await this.cleanupProcessed(stored.outputPath, stored.thumbnailPath, downloaded.filePath);
    }
  }

  /** Runs the standard pipeline (validation already done at fetch) and stores. */
  private async storeBinary(
    productId: string,
    url: string,
    downloaded: DownloadedMedia,
    position: number,
  ): Promise<{
    mediaType: 'IMAGE' | 'VIDEO';
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    storageKey: string;
    thumbnailKey: string | null;
    thumbnailSizeBytes: number | null;
    outputPath: string;
    thumbnailPath: string | null;
  }> {
    const mediaId = randomUUID();
    const extension = extensionForMediaMime(downloaded.detectedMime);
    const storageKey = `products/${productId}/${mediaId}.${extension}`;
    const processed = await this.processing.process(
      downloaded.filePath,
      downloaded.detectedMime,
      this.tempDir,
    );
    const thumbnailKey =
      processed.thumbnailPath !== undefined
        ? `products/${productId}/${mediaId}.thumb.webp`
        : null;
    await this.storage.putFile(storageKey, processed.outputPath);
    try {
      if (thumbnailKey !== null && processed.thumbnailPath !== undefined) {
        await this.storage.putFile(thumbnailKey, processed.thumbnailPath);
      }
    } catch (error) {
      await this.storage.delete(storageKey).catch(() => undefined);
      throw error;
    }
    return {
      mediaType: mediaTypeForMime(downloaded.detectedMime),
      originalName: sanitizeMediaDisplayName(
        basenameForUrl(url, `image-${position}.jpg`),
        'media',
      ),
      mimeType: downloaded.detectedMime,
      sizeBytes: processed.sizeBytes,
      storageKey,
      thumbnailKey,
      thumbnailSizeBytes: processed.thumbnailSizeBytes ?? null,
      outputPath: processed.outputPath,
      thumbnailPath: processed.thumbnailPath ?? null,
    };
  }

  /**
   * Claims primary for the CSV-first image when no live primary exists.
   * Re-checked inside the update path: concurrent products never share a
   * productId (per-product serial section), so a pre-check suffices.
   */
  private async claimPrimary(productId: string, wantsPrimary: boolean): Promise<boolean> {
    if (!wantsPrimary) {
      return false;
    }
    const primary = await this.prisma.productMedia.findFirst({
      where: { productId, deletedAt: null, isPrimary: true },
      select: { id: true },
    });
    return primary === null;
  }

  private async deleteStoredBinaries(
    storageKey: string,
    thumbnailKey: string | null,
  ): Promise<void> {
    for (const key of [storageKey, thumbnailKey]) {
      if (key === null) {
        continue;
      }
      try {
        await this.storage.delete(key);
      } catch {
        // Orphan cleanup is best-effort, never masks the import error.
      }
    }
  }

  private async cleanupProcessed(
    outputPath: string,
    thumbnailPath: string | null,
    inputPath: string,
  ): Promise<void> {
    for (const path of [outputPath, thumbnailPath, inputPath]) {
      if (path === null || path === undefined) {
        continue;
      }
      // The input lives under its download dir (removed separately); only
      // pipeline outputs outside it need individual removal.
      if (path === inputPath) {
        continue;
      }
      try {
        await rm(path, { force: true });
      } catch {
        // Temp cleanup never masks the import result.
      }
    }
  }
}

export function renderMediaSummary(report: MediaReport): string {
  const lines = [
    `WooCommerce media ${report.dryRun ? 'dry-run' : 'import'}: ${report.rows} rows from ${report.file}`,
    `run ${report.runId}`,
    `products ${report.products} / resumed ${report.resumed}`,
    `images: refs ${report.images.refs} / downloaded ${report.images.downloaded} / processed ${report.images.processed} / failed ${report.images.failed} / skipped-dedup ${report.images.skippedDedup}`,
    ...report.failures
      .slice(0, 50)
      .map((failure) => `FAILED line ${failure.line} (${failure.sourceId}) ${failure.url}: ${failure.error}`),
    ...(report.failures.length > 50
      ? [`... and ${report.failures.length - 50} more failures (see report artifact).`]
      : []),
    'policy rulings:',
    ...report.decisions.map((decision) => `  - ${decision}`),
  ];
  return lines.join('\n');
}

/** Absolute storage root guard for CLI wiring (relative resolves to api cwd). */
export function resolveMediaStorageDir(): string {
  const dir = process.env.PRODUCT_MEDIA_STORAGE_DIR ?? '.data/product-media';
  return join(process.cwd(), dir);
}
