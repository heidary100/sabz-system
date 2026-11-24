import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import sharp from 'sharp';
import { PrismaService } from '../../common/database/prisma.service';
import {
  CATALOG_PRODUCTS_TAG,
  CATALOG_TREE_TAG,
  productDetailTag,
} from '../../common/storefront-cache/catalog-tags';
import { StorefrontCacheService } from '../../common/storefront-cache/storefront-cache.service';
import { sanitizeMediaDisplayName } from '../products/media-validation';
import { extensionForMediaMime, mediaTypeForMime } from '../products/media-validation';
import { BackgroundRemovalService } from '../products/media-processing/background-removal.service';
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
  isCurrentPipelineMedia,
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
  /**
   * Re-download and re-process rows even when the source URL already has a
   * live binary. Required for a pipeline upgrade (background removal +
   * square canvas + revised watermark); old binaries are retained, never
   * deleted before the replacement is verified.
   */
  refreshImages?: boolean;
  /** Optional source-id allowlist for targeted retries (debug/recovery). */
  sourceIds?: string[];
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
    /** Existing live rows replaced by --refresh-images (repo old bytes kept). */
    refreshed: number;
    /** Imported media no longer present in the CSV gallery (soft-deleted). */
    retiredStale: number;
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
  'Binaries run the mandatory local pipeline: background removal → transparent PNG → square transparent canvas → smaller logo-only watermark → thumbnail; original source bytes are retained.',
  'AVIF is classified as an image before the MP4/ISOBMFF branch; unsupported content is dead-lettered.',
  '--refresh-images is resumable: rows already on the current pipeline are skipped, legacy/placeholder rows are upgraded without deleting old binaries before verification.',
  'After a clean product pass, imported media removed from the CSV gallery is soft-deleted and a parent-level primary is restored; manual media is never touched.',
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
  thumbnailKey: string | null;
  sortOrder: number;
  isPrimary: boolean;
  deletedAt: Date | null;
  mediaType: 'IMAGE' | 'VIDEO';
  processingStatus: 'NONE' | 'PENDING' | 'PROCESSED' | 'SKIPPED' | 'FAILED';
  processingError: string | null;
  backgroundRemoved: boolean;
  originalStorageKey: string | null;
}

interface MediaCounts {
  downloaded: number;
  processed: number;
  failed: number;
  skippedDedup: number;
  refreshed: number;
  retiredStale: number;
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
  // Product imports MUST run the local background-removal pipeline before
  // watermarking. The model is host-provisioned; the runner verifies it
  // before a non-dry-run starts and refuses to publish unprocessed images.
  const backgroundRemoval = new BackgroundRemovalService(new ConfigService());
  const processing = new MediaProcessingService(
    new ImageProcessorService(overlay, watermark),
    new VideoProcessorService(
      overlay,
      new FfmpegRunner(FfmpegRunner.resolveBinary()),
      watermark,
      tempDir,
    ),
    watermark,
    backgroundRemoval,
  );
  return new WooMediaRunner(
    prisma,
    storage,
    processing,
    tempDir,
    overrides.downloader,
    overrides.prober,
    backgroundRemoval,
    watermark,
    new StorefrontCacheService(new ConfigService()),
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
    private readonly backgroundRemoval?: BackgroundRemovalService,
    private readonly watermark?: WatermarkConfig,
    private readonly cache?: StorefrontCacheService,
  ) {}

  async runMedia(options: RunMediaOptions): Promise<{ report: MediaReport; exitCode: number }> {
    const threshold = options.failureThreshold ?? 0;
    const resume = options.resume ?? true;
    const concurrency = options.concurrency ?? DEFAULT_MEDIA_CONCURRENCY;
    const allowHosts = options.allowHosts ?? [];
    const allowPrivate = options.allowPrivate ?? false;
    const dryRun = options.dryRun ?? false;
    const refreshImages = options.refreshImages ?? false;
    const sourceIdFilter =
      options.sourceIds !== undefined && options.sourceIds.length > 0
        ? new Set(options.sourceIds)
        : null;

    // Mandatory image pipeline guard: background removal + watermarking must
    // be available before any binary is published. A dry run only reports.
    if (!dryRun) {
      this.assertProcessingReady();
    }

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
      refreshed: 0,
      retiredStale: 0,
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
      if (sourceIdFilter !== null && !sourceIdFilter.has(verdict.sourceId)) {
        continue;
      }
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
      if (resume && !refreshImages) {
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
            await this.probeProduct(
              run.id,
              task,
              { extraHosts: allowHosts, allowPrivate },
              counts,
              failures,
              refreshImages,
            );
          } else {
            await this.processProduct(
              run.id,
              task,
              { extraHosts: allowHosts, allowPrivate },
              counts,
              failures,
              refreshImages,
            );
          }
        }
      })(),
    );
    await Promise.all(workers);

    // Media bytes/URL versions may have changed even when product data did
    // not: expire the storefront's cached cards/detail pages immediately.
    if (!dryRun && this.cache !== undefined && tasks.length > 0) {
      const slugs = await this.prisma.product.findMany({
        where: { id: { in: [...new Set(tasks.map((task) => task.productId))] } },
        select: { slug: true },
      });
      await this.cache
        .invalidate([
          CATALOG_PRODUCTS_TAG,
          CATALOG_TREE_TAG,
          ...slugs.map((row) => productDetailTag(row.slug)),
        ])
        .catch(() => undefined);
    }

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
        refreshed: counts.refreshed,
        retiredStale: counts.retiredStale,
      },
      resumed: counts.resumed,
      failures,
      decisions: MEDIA_DECISIONS,
    };
    return { report, exitCode: failed > threshold ? 1 : 0 };
  }

  // ------------------------------------------------------------------ helpers

  /**
   * Fails closed before an apply when the mandatory local processing pipeline
   * is not available. A missing U2-Net model or disabled watermark would
   * otherwise publish unprocessed WooCommerce URLs as final product images.
   */
  private assertProcessingReady(): void {
    if (this.watermark !== undefined) {
      if (!this.watermark.enabled) {
        throw new Error(
          'Watermarking is disabled; the mandatory product-image pipeline cannot run.',
        );
      }
      if (!this.watermark.logoOnly) {
        throw new Error(
          'The legacy text watermark is disabled for imports; logo-only watermarking is required.',
        );
      }
      if (
        !this.watermark.logoPath ||
        !existsSync(this.watermark.logoPath)
      ) {
        throw new Error(
          `The watermark logo asset is missing at ${this.watermark.logoPath}.`,
        );
      }
    }
    if (this.backgroundRemoval !== undefined) {
      if (!this.backgroundRemoval.enabled()) {
        throw new Error(
          'Background removal is disabled; the mandatory product-image pipeline cannot run.',
        );
      }
      const modelPath = this.backgroundRemoval.modelPath();
      if (!existsSync(modelPath)) {
        throw new Error(
          `Background-removal model is missing at ${modelPath}; import apply is blocked.`,
        );
      }
    }
  }

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
    refreshImages = false,
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
      if (liveByUrl.has(item.url) && !refreshImages) {
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
    refreshImages = false,
  ): Promise<void> {
    const rows: ExistingMedia[] = await this.prisma.productMedia.findMany({
      where: { productId: task.productId },
      select: {
        id: true,
        sourceUrl: true,
        contentHash: true,
        storageKey: true,
        thumbnailKey: true,
        sortOrder: true,
        isPrimary: true,
        deletedAt: true,
        mediaType: true,
        processingStatus: true,
        processingError: true,
        backgroundRemoved: true,
        originalStorageKey: true,
      },
    });
    const byUrl = new Map<string, ExistingMedia>();
    // Legacy SS-207 placeholders carry a numeric source id instead of the
    // real URL. Reuse them by position so the CSV order/primary role is
    // preserved instead of creating duplicate pending rows.
    const pendingRows = rows
      .filter(
        (row) =>
          row.deletedAt === null &&
          row.storageKey.startsWith(PENDING_MEDIA_PREFIX),
      )
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const usedPending = new Set<string>();
    const takePending = (): ExistingMedia | undefined => {
      const next = pendingRows.find((row) => !usedPending.has(row.id));
      if (next) usedPending.add(next.id);
      return next;
    };
    const liveHashes = new Set<string>();
    let hasPrimary = false;
    let maxSort = -1;
    for (const row of rows) {
      if (row.sourceUrl && !row.storageKey.startsWith(PENDING_MEDIA_PREFIX)) {
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
      const hit = byUrl.get(item.url) ?? takePending();
      const liveHit =
        hit !== undefined &&
        hit.deletedAt === null &&
        !hit.storageKey.startsWith(PENDING_MEDIA_PREFIX);
      // Current-pipeline rows are always a no-op. Legacy rows are only
      // reprocessed when --refresh-images explicitly asks for an upgrade.
      if (liveHit && (isCurrentPipelineMedia(hit) || !refreshImages)) {
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
          if (liveHit) {
            counts.refreshed += 1;
          }
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

    // Once every image in the current CSV plan is verified, retire imported
    // rows that are no longer part of the gallery. Do it only after a clean
    // pass: a failed replacement must never remove the previous image.
    if (productFailed === 0) {
      try {
        counts.retiredStale += await this.retireStaleMedia(task);
      } catch (error) {
        productFailed += 1;
        counts.failed += 1;
        failures.push({
          line: task.line,
          sourceId: task.sourceId,
          url: 'stale-media',
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

  /**
   * Soft-deletes imported media that has left the CSV gallery and restores the
   * product-level primary when the old primary was retired. Manual media
   * (`sourceUrl = null`) and other variants' media are never touched.
   */
  private async retireStaleMedia(task: ProductTask): Promise<number> {
    const planUrls = task.plan.media.map((item) => item.url);
    const scope = {
      productId: task.productId,
      variantId: task.variantId,
      deletedAt: null,
      // Never retire admin-authored media; only rows owned by this import.
      createdBy: { in: ['woo-import', MEDIA_IMPORT_ACTOR] },
      sourceUrl:
        planUrls.length > 0
          ? { not: null, notIn: planUrls }
          : { not: null },
    };
    return this.prisma.$transaction(async (tx) => {
      const stale = await tx.productMedia.findMany({
        where: scope,
        select: { id: true },
      });
      if (stale.length === 0) {
        return 0;
      }
      await tx.productMedia.updateMany({
        where: { id: { in: stale.map((row) => row.id) } },
        data: {
          deletedAt: new Date(),
          isPrimary: false,
          updatedBy: MEDIA_IMPORT_ACTOR,
        },
      });
      if (task.variantId === null) {
        const primary = await tx.productMedia.findFirst({
          where: {
            productId: task.productId,
            deletedAt: null,
            mediaType: 'IMAGE',
            isPrimary: true,
          },
          select: { id: true },
        });
        if (!primary) {
          const replacement = await tx.productMedia.findFirst({
            where: {
              productId: task.productId,
              variantId: null,
              deletedAt: null,
              mediaType: 'IMAGE',
            },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
            select: { id: true },
          });
          if (replacement) {
            await tx.productMedia.update({
              where: { id: replacement.id },
              data: { isPrimary: true, updatedBy: MEDIA_IMPORT_ACTOR },
            });
          }
        }
      }
      return stale.length;
    });
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
          sourceUrl: item.url,
          previousStorageKey: hit.storageKey.startsWith(PENDING_MEDIA_PREFIX)
            ? null
            : hit.storageKey,
          previousThumbnailKey: hit.thumbnailKey,
          contentHash: downloaded.contentHash,
          thumbnailKey: stored.thumbnailKey,
          thumbnailSizeBytes: stored.thumbnailSizeBytes,
          originalStorageKey: stored.originalStorageKey,
          originalSizeBytes: stored.originalSizeBytes,
          originalMimeType: stored.originalMimeType,
          originalWidth: stored.originalWidth,
          originalHeight: stored.originalHeight,
          width: stored.width,
          height: stored.height,
          processingStatus: stored.processingStatus,
          backgroundRemoved: stored.backgroundRemoved,
          processingModel: stored.processingModel,
          processedAt: stored.processedAt,
          deletedAt: null,
          isPrimary: hit.isPrimary ? true : await this.claimPrimary(task.productId, item.isPrimary),
          updatedBy: MEDIA_IMPORT_ACTOR,
        },
      });
    } catch (error) {
      await this.deleteStoredBinaries(
        stored.storageKey,
        stored.thumbnailKey,
        stored.originalStorageKey,
      );
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
          originalStorageKey: stored.originalStorageKey,
          originalSizeBytes: stored.originalSizeBytes,
          originalMimeType: stored.originalMimeType,
          originalWidth: stored.originalWidth,
          originalHeight: stored.originalHeight,
          width: stored.width,
          height: stored.height,
          processingStatus: stored.processingStatus,
          backgroundRemoved: stored.backgroundRemoved,
          processingModel: stored.processingModel,
          processedAt: stored.processedAt,
          sortOrder,
          isPrimary,
          createdBy: MEDIA_IMPORT_ACTOR,
        },
      });
    } catch (error) {
      await this.deleteStoredBinaries(
        stored.storageKey,
        stored.thumbnailKey,
        stored.originalStorageKey,
      );
      throw error;
    } finally {
      await this.cleanupProcessed(stored.outputPath, stored.thumbnailPath, downloaded.filePath);
    }
  }

  /** Runs the mandatory import pipeline (originals retained) and stores. */
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
    originalStorageKey: string;
    originalSizeBytes: number;
    originalMimeType: string;
    originalWidth: number | null;
    originalHeight: number | null;
    width: number | null;
    height: number | null;
    processingStatus: 'NONE' | 'PENDING' | 'PROCESSED' | 'SKIPPED' | 'FAILED';
    backgroundRemoved: boolean;
    processingModel: string | null;
    processedAt: Date | null;
    outputPath: string;
    thumbnailPath: string | null;
  }> {
    const mediaId = randomUUID();
    const isImage = mediaTypeForMime(downloaded.detectedMime) === 'IMAGE';

    // 1) Preserve the exact source bytes first; every derivative is
    // recoverable and a failed import never leaves the product with an
    // unprocessed substitute.
    const originalExtension = extensionForMediaMime(downloaded.detectedMime);
    const originalStorageKey = `products/${productId}/${mediaId}.original.${originalExtension}`;
    const originalMeta = isImage
      ? await sharp(downloaded.filePath).metadata().catch(() => null)
      : null;
    await this.storage.putFile(originalStorageKey, downloaded.filePath);

    let processed: Awaited<ReturnType<MediaProcessingService['process']>>;
    try {
      // 2) Mandatory local background removal → transparent PNG → square
      // transparent canvas → logo-only watermark → thumbnail derivative.
      processed = await this.processing.process(
        downloaded.filePath,
        downloaded.detectedMime,
        this.tempDir,
        isImage ? { backgroundRemoval: true } : {},
      );
      if (isImage && (processed.processingStatus === 'FAILED' || processed.processingError)) {
        throw new Error(
          processed.processingError ??
            'پردازش پس‌زمینه تصویر ناموفق بود؛ تصویر منتشر نشد.',
        );
      }
    } catch (error) {
      await this.storage.delete(originalStorageKey).catch(() => undefined);
      throw error;
    }

    const processedMime = processed.mimeType ?? downloaded.detectedMime;
    const extension = extensionForMediaMime(processedMime);
    const storageKey = `products/${productId}/${mediaId}.${extension}`;
    const thumbnailKey =
      processed.thumbnailPath !== undefined
        ? `products/${productId}/${mediaId}.thumb.webp`
        : null;
    try {
      await this.storage.putFile(storageKey, processed.outputPath);
      if (thumbnailKey !== null && processed.thumbnailPath !== undefined) {
        await this.storage.putFile(thumbnailKey, processed.thumbnailPath);
      }
    } catch (error) {
      // DB row is not written yet: remove the partial derivative but keep
      // the retained original only until the caller's cleanup runs.
      await this.storage.delete(storageKey).catch(() => undefined);
      if (thumbnailKey !== null) {
        await this.storage.delete(thumbnailKey).catch(() => undefined);
      }
      await this.storage.delete(originalStorageKey).catch(() => undefined);
      throw error;
    }

    return {
      mediaType: mediaTypeForMime(processedMime),
      originalName: sanitizeMediaDisplayName(
        basenameForUrl(url, `image-${position}.jpg`),
        'media',
      ),
      mimeType: processedMime,
      sizeBytes: processed.sizeBytes,
      storageKey,
      thumbnailKey,
      thumbnailSizeBytes: processed.thumbnailSizeBytes ?? null,
      originalStorageKey,
      originalSizeBytes: downloaded.sizeBytes,
      originalMimeType: downloaded.detectedMime,
      originalWidth: originalMeta?.width ?? null,
      originalHeight: originalMeta?.height ?? null,
      width: processed.width ?? null,
      height: processed.height ?? null,
      processingStatus: processed.processingStatus ?? 'NONE',
      backgroundRemoved: processed.backgroundRemoved ?? false,
      processingModel: processed.processingModel ?? null,
      processedAt: new Date(),
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
    originalStorageKey: string | null = null,
  ): Promise<void> {
    for (const key of [storageKey, thumbnailKey, originalStorageKey]) {
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
    `images: refs ${report.images.refs} / downloaded ${report.images.downloaded} / processed ${report.images.processed} / failed ${report.images.failed} / skipped-dedup ${report.images.skippedDedup} / refreshed ${report.images.refreshed} / retired-stale ${report.images.retiredStale}`,
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
